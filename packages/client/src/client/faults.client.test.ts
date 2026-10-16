/**
 * The fault transport (roadmap R30), and a seeded run of the client under random faults.
 *
 * The first part examines each fault of `FaultTransport` with fake timers. The second part sends
 * calls through `resilience()` to a `LocalTransport` with random faults, and examines the rules of
 * each outcome. A failure names its seed: start the test again with `FAULT_SEED=<seed>` to replay it.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { z } from "zod";
import { Client } from "./client.js";
import type { Message, ResponseItem, Transport } from "./types.js";
import { resilience } from "./middleware/resilience.js";
import { deliveryOf, isNetworkError, thrownItem } from "./middleware/items.js";
import { ms } from "../duration.js";
import { LocalTransport } from "../adapters/local/client/transport.js";
import { createProcedure } from "../procedures/define.js";
import { idempotentIn } from "../procedures/idempotency.js";
import { createRegistry } from "../procedures/module.js";
import { pathToMethod } from "../server/method.js";
import { FaultTransport, type Fault } from "../../test/faults/fault-transport.js";
import { seededRandom, seedsOf } from "../../test/faults/random.js";

let t0 = 0;
const now = (): number => Date.now() - t0;

beforeEach(() => {
  vi.useFakeTimers();
  t0 = Date.now();
});
afterEach(() => {
  vi.useRealTimers();
});

/** A transport that answers each request with `count` items (1, 2, ...) and records each request and each end. */
function counting(count: number) {
  const seen = { requests: [] as number[], ended: 0 };
  const transport: Transport = {
    name: "counting",
    async *send<TReq, TRes>(message: Message<TReq>): AsyncIterable<ResponseItem<TRes>> {
      seen.requests.push(now());
      try {
        for (let n = 1; n <= count; n++) {
          yield { id: message.id, status: { type: "success", code: 200 }, payload: n as TRes, metadata: {} };
        }
      } finally {
        seen.ended++;
      }
    },
    close: async () => undefined,
  };
  return { transport, seen };
}

const method = { service: "fx", operation: "op" };
const message = (signal?: AbortSignal): Message<unknown> => ({ id: "m", method, payload: {}, metadata: {}, ...(signal ? { signal } : {}) });

/** The payloads of a call through a transport, and its error. */
async function collect(transport: Transport, signal?: AbortSignal): Promise<{ items: unknown[]; error?: unknown }> {
  const items: unknown[] = [];
  try {
    for await (const item of transport.send(message(signal))) items.push(item.payload);
    return { items };
  } catch (error) {
    return { items, error };
  }
}

describe("the faults of FaultTransport (R30)", () => {
  it("the same seed gives the same faults, and another seed gives other faults", async () => {
    const rates = { latency: 0.3, dropBeforeFirst: 0.2, dropInStream: 0.2, duplicate: 0.2 };
    const run = async (seed: number) => {
      const faults = new FaultTransport(counting(3).transport, { seed, rates });
      for (let call = 0; call < 40; call++) {
        const done = collect(faults);
        await vi.advanceTimersByTimeAsync(200);
        await done;
      }
      return faults.log.map((record) => record.faults);
    };
    const first = await run(7);
    expect(await run(7)).toEqual(first);
    expect(await run(8)).not.toEqual(first);
    // The rates give each kind of fault in 40 calls
    const kinds = new Set(first.flat().map((fault) => fault.kind));
    expect([...kinds].sort()).toEqual(["drop-before-first", "drop-in-stream", "duplicate", "latency"]);
  });

  it("a latency delays the request and each item", async () => {
    const inner = counting(2);
    const faults = new FaultTransport(inner.transport, { script: [[{ kind: "latency", ms: 30 }]] });
    const times: number[] = [];
    const done = (async () => {
      for await (const item of faults.send(message())) {
        expect(item.status.type).toBe("success");
        times.push(now());
      }
    })();
    await vi.advanceTimersByTimeAsync(200);
    await done;
    expect(inner.seen.requests).toEqual([30]);
    expect(times).toEqual([60, 90]);
  });

  it("a drop before the first item lets the request leave, then fails with an indeterminate network error", async () => {
    const inner = counting(1);
    const faults = new FaultTransport(inner.transport, { script: [[{ kind: "drop-before-first" }]] });
    const { items, error } = await collect(faults);
    expect(items).toEqual([]);
    expect(inner.seen.requests).toHaveLength(1);
    expect((error as { code?: string }).code).toBe("ECONNRESET");
    expect(isNetworkError(error)).toBe(true);
    expect(deliveryOf(thrownItem("m", error))).toBe("indeterminate");
    await vi.advanceTimersByTimeAsync(0);
    expect(inner.seen.ended).toBe(1);
  });

  it("a drop in a stream gives the first items, fails, and ends the inner stream", async () => {
    const inner = counting(5);
    const faults = new FaultTransport(inner.transport, { script: [[{ kind: "drop-in-stream", after: 2 }]] });
    const { items, error } = await collect(faults);
    expect(items).toEqual([1, 2]);
    expect((error as { code?: string }).code).toBe("ECONNRESET");
    expect(inner.seen.ended).toBe(1);
  });

  it("a hang ignores the signal and never ends", async () => {
    const inner = counting(1);
    const faults = new FaultTransport(inner.transport, { script: [[{ kind: "hang" }]] });
    const controller = new AbortController();
    let settled = false;
    void collect(faults, controller.signal).then(() => (settled = true));
    controller.abort();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(settled).toBe(false);
    expect(faults.hanging).toBe(1);
    expect(inner.seen.requests).toEqual([]);
  });

  it("a duplicate gives one item two times", async () => {
    const faults = new FaultTransport(counting(3).transport, { script: [[{ kind: "duplicate", item: 1 }]] });
    expect((await collect(faults)).items).toEqual([1, 2, 2, 3]);
  });

  it("the client takes the last item of a duplicate answer as the value", async () => {
    const faults = new FaultTransport(counting(1).transport, { script: [[{ kind: "duplicate", item: 0 }]] });
    expect(await new Client(faults).call(method, {})).toBe(1);
  });
});

describe("the client under random faults (R30)", () => {
  const MAX_RETRIES = 3;

  /** The procedures, and the count of the runs of each write by its number. */
  function procedures() {
    const writeRuns = new Map<number, number>();
    const registry = createRegistry({
      name: "fx",
      procedures: [
        createProcedure()
          .path(["fx", "read"])
          .input(z.object({ n: z.number() }))
          .output(z.number())
          .meta({ effects: { reads: ["data"], writes: [] } })
          .handler(async (input) => input.n * 2)
          .build(),
        createProcedure()
          .path(["fx", "write"])
          .input(z.object({ n: z.number() }))
          .output(z.number())
          .meta({ effects: { reads: [], writes: ["data"] } })
          .handler(async (input) => {
            writeRuns.set(input.n, (writeRuns.get(input.n) ?? 0) + 1);
            return input.n;
          })
          .build(),
        createProcedure()
          .path(["fx", "stream"])
          .input(z.object({ n: z.number() }))
          .output(z.number())
          .meta({ effects: { reads: ["data"], writes: [] } })
          .handler(async function* () {
            for (let item = 0; item < 4; item++) yield item;
          } as never)
          .build(),
      ],
    });
    return { registry, writeRuns };
  }

  /** The outcome of one call, in a form that a replay compares. */
  interface Outcome {
    kind: "read" | "write" | "stream";
    n: number;
    items: unknown[];
    error?: string;
    at: number;
    tries: number;
    /** The kinds of the faults of the tries */
    faults: string[];
  }

  /** The items without an item that repeats the item before it. */
  const withoutRepeats = (items: unknown[]): unknown[] => items.filter((item, index) => index === 0 || item !== items[index - 1]);

  /** This function sends 60 calls with random faults, one after the other, and gives their outcomes. */
  async function run(seed: number) {
    const { registry, writeRuns } = procedures();
    const faults = new FaultTransport(new LocalTransport({ registry }), {
      seed,
      rates: { latency: 0.5, hang: 0.1, dropBeforeFirst: 0.15, dropInStream: 0.15, duplicate: 0.1 },
      latencyMs: [1, 40],
    });
    const client = new Client({ transport: faults, throwOnError: true }).use(
      resilience({
        overall: ms(2000),
        perAttempt: ms(200),
        retry: { maxRetries: MAX_RETRIES, retryDelay: ms(20), jitter: 0, budget: false, idempotent: idempotentIn(registry) },
      }),
    );
    // The kind of each call comes from the seed too
    const random = seededRandom(seed ^ 0x5eed);
    const outcomes: Outcome[] = [];
    for (let n = 0; n < 60; n++) {
      const kind = (["read", "write", "stream"] as const)[Math.floor(random() * 3)]!;
      const triesBefore = faults.log.length;
      const start = now();
      const items: unknown[] = [];
      let error: string | undefined;
      let settled = false;
      void (async () => {
        try {
          for await (const item of client.stream(pathToMethod(["fx", kind]), { n })) items.push(item);
        } catch (failure) {
          error = String((failure as { code?: unknown }).code ?? failure);
        } finally {
          settled = true;
        }
      })();
      await vi.advanceTimersByTimeAsync(2100);
      if (!settled) throw new Error(`seed ${seed}: call ${n} (${kind}) did not end before its overall timeout`);
      const tries = faults.log.slice(triesBefore);
      outcomes.push({
        kind,
        n,
        items,
        ...(error === undefined ? {} : { error }),
        at: now() - start,
        tries: tries.length,
        faults: tries.flatMap((record) => record.faults.map((fault) => fault.kind)),
      });
      // A long pause between the calls: each call starts with the same state
      await vi.advanceTimersByTimeAsync(1000);
    }
    return { outcomes, writeRuns, log: faults.log.map((record) => record.faults) };
  }

  for (const seed of seedsOf([1, 2, 3, 4, 5])) {
    it(`keeps its rules (seed ${seed})`, async () => {
      const { outcomes, writeRuns, log } = await run(seed);
      const where = (outcome: Outcome) => `seed ${seed}, call ${outcome.n} (${outcome.kind})`;
      for (const outcome of outcomes) {
        // Each failure is a timeout or a broken connection, and a failed call had a fault
        if (outcome.error !== undefined) {
          expect(["TIMEOUT", "ECONNRESET"], where(outcome)).toContain(outcome.error);
          expect(outcome.faults.some((kind) => kind !== "latency" && kind !== "duplicate"), where(outcome)).toBe(true);
        }
        expect(outcome.tries, where(outcome)).toBeGreaterThanOrEqual(1);
        expect(outcome.tries, where(outcome)).toBeLessThanOrEqual(MAX_RETRIES + 1);
        // The protocol has no sequence numbers: a duplicate item passes to the reader
        const items = withoutRepeats(outcome.items);
        if (items.length !== outcome.items.length) expect(outcome.faults, where(outcome)).toContain("duplicate");
        if (outcome.kind === "read" && outcome.error === undefined) expect(items, where(outcome)).toEqual([outcome.n * 2]);
        if (outcome.kind === "write") {
          // A write can have run after each fault: the client never sends it two times
          expect(outcome.tries, where(outcome)).toBe(1);
          expect(writeRuns.get(outcome.n) ?? 0, where(outcome)).toBeLessThanOrEqual(1);
          if (outcome.error === undefined) expect(items, where(outcome)).toEqual([outcome.n]);
        }
        if (outcome.kind === "stream") {
          // The items are the start of the stream, and all of it without an error
          expect([0, 1, 2, 3].slice(0, items.length), where(outcome)).toEqual(items);
          if (outcome.error === undefined) expect(items, where(outcome)).toEqual([0, 1, 2, 3]);
        }
      }
      // Each kind of outcome is present, so the run examined something
      expect(outcomes.some((outcome) => outcome.error === undefined)).toBe(true);
      expect(outcomes.some((outcome) => outcome.error !== undefined)).toBe(true);
      expect(outcomes.some((outcome) => outcome.tries > 1)).toBe(true);

      // A replay of the seed gives the same faults and the same outcomes
      const replay = await run(seed);
      expect(replay.log, `seed ${seed}`).toEqual(log);
      expect(replay.outcomes, `seed ${seed}`).toEqual(outcomes);
    });
  }

  it("the faults of a plan depend only on the seed and the number of the call", () => {
    const plan = (seed: number) => {
      const faults = new FaultTransport(counting(1).transport, { seed, rates: { hang: 0.5, latency: 0.5 } });
      const plans: Fault[][] = [];
      for (let call = 0; call < 20; call++) plans.push((faults as unknown as { plan(call: number): Fault[] }).plan(call));
      return plans;
    };
    expect(plan(42)).toEqual(plan(42));
  });
});
