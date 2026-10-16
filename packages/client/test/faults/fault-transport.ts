/**
 * A transport with faults, for tests (roadmap R30).
 *
 * `FaultTransport` wraps a transport and gives each call the faults of a plan: a latency, a drop
 * before the first item, a drop in a stream, a hang that ignores the signal, or a duplicate
 * item. A seed chooses the faults, so a failing run replays with its seed. A script can also give
 * the faults of each call. The timers are `setTimeout` timers, so fake timers control them.
 */

import type { Message, ResponseItem, Transport } from "../../src/client/types.js";
import { integerOf, seededRandom, type Random } from "./random.js";

/** One fault of one call. */
export type Fault =
  /** Each frame waits this time: the request before it leaves, and each item before the reader gets it. */
  | { readonly kind: "latency"; readonly ms: number }
  /** The request leaves, then the connection breaks before the first item. */
  | { readonly kind: "drop-before-first" }
  /** The connection breaks after `after` items of the response. */
  | { readonly kind: "drop-in-stream"; readonly after: number }
  /** The call never answers and never ends. It ignores its signal. */
  | { readonly kind: "hang" }
  /** The item with this index (from 0) arrives two times. */
  | { readonly kind: "duplicate"; readonly item: number };

/** The chance of each fault for one call, from 0 to 1. */
export interface FaultRates {
  readonly latency?: number;
  readonly dropBeforeFirst?: number;
  readonly dropInStream?: number;
  readonly hang?: number;
  readonly duplicate?: number;
}

/** The options of a `FaultTransport`. */
export interface FaultTransportOptions {
  /** The seed of the random choices. */
  readonly seed?: number;
  /** The chance of each fault. Without rates and without a script, no call gets a fault. */
  readonly rates?: FaultRates;
  /** The smallest and the largest latency, in milliseconds. The default is 1 to 50. */
  readonly latencyMs?: readonly [number, number];
  /** The largest item index of a drop in a stream or of a duplicate. The default is 2. */
  readonly maxItem?: number;
  /** The faults of each call, by the number of the call from 0. A script entry goes before the rates. */
  readonly script?: ReadonlyArray<readonly Fault[] | undefined>;
}

/** The record of one call: its number, its method and its faults. */
export interface FaultRecord {
  readonly call: number;
  readonly id: string;
  readonly method: string;
  readonly faults: readonly Fault[];
}

/** The error of a broken connection. Its code makes it a network error that can have arrived. */
export function connectionReset(): Error {
  return Object.assign(new Error("The fault transport broke the connection"), { code: "ECONNRESET" });
}

/** This function waits `ms` milliseconds, or less when the signal aborts. */
function wait(ms: number, signal: AbortSignal | undefined): Promise<void> {
  if (ms <= 0 || signal?.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const done = (): void => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal?.addEventListener("abort", done, { once: true });
  });
}

/** A transport that gives faults to the calls of another transport. */
export class FaultTransport implements Transport {
  readonly name: string;
  /** The calls and their faults, in the order of the calls. */
  readonly log: FaultRecord[] = [];
  private readonly random: Random;
  private calls = 0;
  /** The number of calls that hang now. */
  hanging = 0;

  constructor(
    private readonly inner: Transport,
    private readonly options: FaultTransportOptions = {},
  ) {
    this.name = `faults(${inner.name})`;
    this.random = seededRandom(options.seed ?? 1);
  }

  /**
   * The faults of one call. The plan takes the same count of random numbers for each call, so the
   * faults of a call depend only on the seed and the number of the call.
   */
  private plan(call: number): Fault[] {
    const rates = this.options.rates ?? {};
    const [minLatency, maxLatency] = this.options.latencyMs ?? [1, 50];
    const maxItem = this.options.maxItem ?? 2;
    const draw = {
      latency: this.random(),
      latencyMs: integerOf(this.random, minLatency, maxLatency),
      outcome: this.random(),
      after: integerOf(this.random, 0, maxItem),
      duplicate: this.random(),
      duplicateItem: integerOf(this.random, 0, maxItem),
    };
    const scripted = this.options.script?.[call];
    if (scripted) return [...scripted];
    const faults: Fault[] = [];
    if (draw.latency < (rates.latency ?? 0)) faults.push({ kind: "latency", ms: draw.latencyMs });
    // One outcome at most: a hang, a drop before the first item, or a drop in the stream
    const hang = rates.hang ?? 0;
    const dropBeforeFirst = rates.dropBeforeFirst ?? 0;
    const dropInStream = rates.dropInStream ?? 0;
    if (draw.outcome < hang) faults.push({ kind: "hang" });
    else if (draw.outcome < hang + dropBeforeFirst) faults.push({ kind: "drop-before-first" });
    else if (draw.outcome < hang + dropBeforeFirst + dropInStream) faults.push({ kind: "drop-in-stream", after: draw.after });
    if (draw.duplicate < (rates.duplicate ?? 0)) faults.push({ kind: "duplicate", item: draw.duplicateItem });
    return faults;
  }

  async *send<TReq, TRes>(message: Message<TReq>): AsyncIterable<ResponseItem<TRes>> {
    const call = this.calls++;
    const faults = this.plan(call);
    this.log.push({ call, id: message.id, method: `${message.method.service}.${message.method.operation}`, faults });
    const find = <K extends Fault["kind"]>(kind: K): Extract<Fault, { kind: K }> | undefined =>
      faults.find((fault): fault is Extract<Fault, { kind: K }> => fault.kind === kind);
    const latency = find("latency")?.ms ?? 0;
    const signal = message.signal;

    if (find("hang")) {
      // The request goes nowhere, and no answer comes. The signal does not stop the wait.
      this.hanging++;
      await new Promise<never>(() => undefined);
    }

    await wait(latency, signal);
    const iterator = this.inner.send<TReq, TRes>(message)[Symbol.asyncIterator]();

    if (find("drop-before-first")) {
      // The request leaves: the inner call starts. Its answer is lost.
      const first = iterator.next();
      void first.then(
        () => iterator.return?.(),
        () => undefined,
      );
      await wait(latency, signal);
      throw connectionReset();
    }

    const dropAfter = find("drop-in-stream")?.after;
    const duplicate = find("duplicate")?.item;
    let index = 0;
    let ended = false;
    try {
      for (;;) {
        const result = await iterator.next();
        if (result.done) {
          ended = true;
          return;
        }
        if (dropAfter !== undefined && index === dropAfter) throw connectionReset();
        await wait(latency, signal);
        yield result.value;
        if (duplicate === index) yield result.value;
        index++;
      }
    } finally {
      // A drop or an early stop of the reader ends the inner call
      if (!ended) await iterator.return?.();
    }
  }

  close(): Promise<void> {
    return this.inner.close();
  }
}
