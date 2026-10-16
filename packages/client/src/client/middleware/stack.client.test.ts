/**
 * The middleware stack of `resilience()` with fake timers (roadmap R30): the overall timeout, the
 * cache, the retry, the circuit breaker, the rate limit and the timeout of one try, together.
 *
 * A scripted server records each try with the metadata that the layers wrote: the attempt of the
 * retry, the remaining time of the deadline, the state of the breaker and the free slots of the
 * rate limit. The tests compare the order of the events, their times and the counts. The abort
 * points: before the call, during the wait of a retry, during a try, during a try whose
 * transport ignores the signal, and during the wait of the rate limit.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Client } from "../client.js";
import type { Message, Method, ResponseItem, Transport } from "../types.js";
import { resilience, type ResilienceOptions } from "./resilience.js";
import { CircuitBreakerError } from "./circuit-breaker.js";
import { RateLimitError } from "./rate-limit.js";
import { ms } from "../../duration.js";
import { FaultTransport, type Fault } from "../../../test/faults/fault-transport.js";

const read: Method = { service: "stack", operation: "read" };
const write: Method = { service: "stack", operation: "write" };

let t0 = 0;
/** The time since the start of the test, in milliseconds of the fake clock. */
const now = (): number => Date.now() - t0;
/** The events of a test, in order: the tries of the server and the changes of the breaker. */
let events: string[] = [];

beforeEach(() => {
  vi.useFakeTimers();
  t0 = Date.now();
  events = [];
});
afterEach(() => {
  vi.useRealTimers();
});

/** The answer of the server to one request: after `after` ms, a value or an error code. */
interface Answer {
  after: number;
  code?: string;
  value?: unknown;
}

/** This function waits `time` ms. It gives false when the signal aborts first. */
function delay(time: number, signal: AbortSignal | undefined): Promise<boolean> {
  if (signal?.aborted) return Promise.resolve(false);
  return new Promise((resolve) => {
    const onAbort = (): void => {
      clearTimeout(timer);
      resolve(false);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve(true);
    }, time);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * A server that answers each request with `answer(n)`, where n counts the requests that reached
 * it from 1. It honors the signal of a request. Each request and each answer is an event.
 */
function scriptedServer(answer: (n: number) => Answer) {
  let requests = 0;
  const transport: Transport = {
    name: "scripted",
    async *send<TReq, TRes>(message: Message<TReq>): AsyncIterable<ResponseItem<TRes>> {
      const n = ++requests;
      const metadata = message.metadata;
      const breaker = metadata["circuitBreaker"] as { state: string; failures: number } | undefined;
      const slots = (metadata["rateLimit"] as { tokensAvailable: number } | undefined)?.tokensAvailable;
      events.push(
        `${now()} #${n} ${message.method.operation} attempt=${metadata.retry?.attempt} left=${String(metadata["procedure-timeout"])} breaker=${breaker?.state}/${breaker?.failures} slots=${slots}`,
      );
      const { after, code, value } = answer(n);
      if (!(await delay(after, message.signal))) {
        events.push(`${now()} #${n} aborted`);
        yield { id: message.id, status: { type: "error", code: "ABORTED", message: "Request was aborted", retryable: false }, payload: null as TRes, metadata: {} };
        return;
      }
      if (code !== undefined) {
        events.push(`${now()} #${n} ${code}`);
        yield { id: message.id, status: { type: "error", code, message: code, retryable: true }, payload: null as TRes, metadata: {} };
        return;
      }
      events.push(`${now()} #${n} ok`);
      yield { id: message.id, status: { type: "success", code: 200 }, payload: (value ?? "value") as TRes, metadata: {} };
    },
    close: async () => undefined,
  };
  return { transport, requests: () => requests };
}

/** The options of the stack in the tests. `overrides` replace whole parts. */
function stack(overrides: Partial<ResilienceOptions> = {}): ResilienceOptions {
  return {
    overall: ms(1000),
    perAttempt: ms(100),
    retry: { maxRetries: 3, retryDelay: ms(50), backoffMultiplier: 2, jitter: 0, budget: false, idempotent: (method) => method.operation === "read" },
    breaker: {
      failureThreshold: 3,
      resetTimeout: ms(500),
      successThreshold: 1,
      onStateChange: (from, to) => events.push(`${now()} breaker ${from}->${to}`),
    },
    cache: { methods: ["stack.read"], ttl: ms(10_000) },
    // A long window: the slots do not come back during a test
    rateLimit: { maxRequests: 10, window: ms(60_000), strategy: "queue", onRateLimitExceeded: () => events.push(`${now()} rate limit`) },
    ...overrides,
  };
}

/** The outcome of a call: its value or its error, and the time when it ended. */
interface Outcome {
  settled: boolean;
  at?: number;
  value?: unknown;
  error?: unknown;
}

function track(promise: Promise<unknown>): Outcome {
  const outcome: Outcome = { settled: false };
  promise.then(
    (value) => Object.assign(outcome, { settled: true, at: now(), value }),
    (error: unknown) => Object.assign(outcome, { settled: true, at: now(), error }),
  );
  return outcome;
}

/** The code of a failed call. */
const codeOf = (outcome: Outcome): unknown => (outcome.error as { code?: unknown } | undefined)?.code;

describe("the order of the layers (R30)", () => {
  it("a failed try, the backoff, a second try, then a cache hit that makes no request", async () => {
    const server = scriptedServer((n) => (n === 1 ? { after: 10, code: "UNAVAILABLE" } : { after: 10, value: "fresh" }));
    const client = new Client({ transport: server.transport, throwOnError: true }).use(resilience(stack()));

    const first = track(client.call(read, { id: 1 }));
    await vi.advanceTimersByTimeAsync(1000);
    expect(first).toMatchObject({ settled: true, at: 70, value: "fresh" });
    // The breaker counted the first failure before the second try. Each try took a slot, and the
    // deadline of the overall timeout went with each try.
    expect(events).toEqual([
      "0 #1 read attempt=0 left=1000 breaker=CLOSED/0 slots=9",
      "10 #1 UNAVAILABLE",
      "60 #2 read attempt=1 left=940 breaker=CLOSED/1 slots=8",
      "70 #2 ok",
    ]);

    // The same read again: the cache answers, with no try and no slot
    const second = track(client.call(read, { id: 1 }));
    await vi.advanceTimersByTimeAsync(0);
    expect(second).toMatchObject({ settled: true, at: 1000, value: "fresh" });
    expect(server.requests()).toBe(2);

    // Another read takes the next slot: the cache hit took none
    track(client.call(read, { id: 2 }));
    await vi.advanceTimersByTimeAsync(20);
    expect(events.at(-2)).toBe("1000 #3 read attempt=0 left=1000 breaker=CLOSED/1 slots=7");
  });

  it("the timeout of one try ends a hung try: an idempotent read goes again, a write does not", async () => {
    const server = scriptedServer(() => ({ after: 10 }));
    const hangFirst: Array<readonly Fault[] | undefined> = [[{ kind: "hang" }]];
    const reads = new FaultTransport(server.transport, { script: hangFirst });
    const readClient = new Client({ transport: reads, throwOnError: true }).use(resilience(stack()));

    const value = track(readClient.call(read, { id: 1 }));
    await vi.advanceTimersByTimeAsync(1000);
    // The hung try never reached the server. The breaker counted its timeout.
    expect(value).toMatchObject({ settled: true, at: 160, value: "value" });
    expect(events).toEqual(["150 #1 read attempt=1 left=850 breaker=CLOSED/1 slots=8", "160 #1 ok"]);
    expect(reads.log.map((record) => record.faults.map((fault) => fault.kind))).toEqual([["hang"], []]);

    // A write after a timeout can have run: no retry
    events = [];
    t0 = Date.now();
    const writes = new FaultTransport(scriptedServer(() => ({ after: 10 })).transport, { script: hangFirst });
    const writeClient = new Client({ transport: writes, throwOnError: true }).use(resilience(stack()));
    const failed = track(writeClient.call(write, { id: 1 }));
    await vi.advanceTimersByTimeAsync(1000);
    expect(failed.settled).toBe(true);
    expect(failed.at).toBe(100);
    expect(codeOf(failed)).toBe("TIMEOUT");
    expect(writes.log).toHaveLength(1);
  });

  it("the overall timeout ends the retries, also during a backoff", async () => {
    const server = scriptedServer(() => ({ after: 10, code: "UNAVAILABLE" }));
    const client = new Client({ transport: server.transport, throwOnError: true }).use(
      resilience(
        stack({
          overall: ms(300),
          retry: { maxRetries: 10, retryDelay: ms(50), backoffMultiplier: 2, jitter: 0, budget: false, idempotent: true },
          breaker: { failureThreshold: 10 },
        }),
      ),
    );
    const outcome = track(client.call(read, { id: 1 }));
    await vi.advanceTimersByTimeAsync(1000);
    // The backoffs are 50, 100 and 200 ms: the overall timeout comes during the third one
    expect(events).toEqual([
      "0 #1 read attempt=0 left=300 breaker=CLOSED/0 slots=9",
      "10 #1 UNAVAILABLE",
      "60 #2 read attempt=1 left=240 breaker=CLOSED/1 slots=8",
      "70 #2 UNAVAILABLE",
      "170 #3 read attempt=2 left=130 breaker=CLOSED/2 slots=7",
      "180 #3 UNAVAILABLE",
    ]);
    expect(outcome.at).toBe(300);
    expect(codeOf(outcome)).toBe("TIMEOUT");
    expect((outcome.error as { retryable?: boolean }).retryable).toBe(false);
  });

  it("the breaker opens during a retry loop and stops it, fails the next call fast, then a probe closes it", async () => {
    const server = scriptedServer((n) => (n <= 2 ? { after: 10, code: "UNAVAILABLE" } : { after: 10, value: "back" }));
    const client = new Client({ transport: server.transport, throwOnError: true }).use(
      resilience(
        stack({
          breaker: {
            failureThreshold: 2,
            resetTimeout: ms(500),
            successThreshold: 1,
            onStateChange: (from, to) => events.push(`${now()} breaker ${from}->${to}`),
          },
        }),
      ),
    );
    const first = track(client.call(read, { id: 1 }));
    await vi.advanceTimersByTimeAsync(200);
    // The third try meets the open breaker: the retry does not repeat a CircuitBreakerError
    expect(first.at).toBe(170);
    expect(first.error).toBeInstanceOf(CircuitBreakerError);

    const fast = track(client.call(read, { id: 2 }));
    await vi.advanceTimersByTimeAsync(0);
    expect(fast.at).toBe(200);
    expect(fast.error).toBeInstanceOf(CircuitBreakerError);

    await vi.advanceTimersByTimeAsync(400);
    const probe = track(client.call(read, { id: 3 }));
    await vi.advanceTimersByTimeAsync(100);
    expect(probe).toMatchObject({ settled: true, at: 610, value: "back" });
    expect(events).toEqual([
      "0 #1 read attempt=0 left=1000 breaker=CLOSED/0 slots=9",
      "10 #1 UNAVAILABLE",
      "60 #2 read attempt=1 left=940 breaker=CLOSED/1 slots=8",
      "70 #2 UNAVAILABLE",
      "70 breaker CLOSED->OPEN",
      "570 breaker OPEN->HALF_OPEN",
      "600 #3 read attempt=0 left=1000 breaker=HALF_OPEN/2 slots=7",
      "610 #3 ok",
      "610 breaker HALF_OPEN->CLOSED",
    ]);
    expect(server.requests()).toBe(3);
  });

  it("the rate limit takes a slot for each try and queues a try without one, and a cache hit takes none", async () => {
    const server = scriptedServer((n) => (n === 1 ? { after: 10, code: "UNAVAILABLE" } : { after: 10 }));
    // Two slots, and one more each 500 ms
    const client = new Client({ transport: server.transport, throwOnError: true }).use(
      resilience(stack({ rateLimit: { maxRequests: 2, window: ms(1000), strategy: "queue" } })),
    );
    const first = track(client.call(read, { id: 1 }));
    await vi.advanceTimersByTimeAsync(100);
    expect(first).toMatchObject({ at: 70, value: "value" });

    const hit = track(client.call(read, { id: 1 }));
    const queued = track(client.call(read, { id: 2 }));
    await vi.advanceTimersByTimeAsync(1000);
    expect(hit.at).toBe(100);
    // The queued try waits for its slot: at 500 ms
    expect(queued).toMatchObject({ at: 510, value: "value" });
    expect(events.filter((event) => event.includes(" read "))).toEqual([
      "0 #1 read attempt=0 left=1000 breaker=CLOSED/0 slots=1",
      "60 #2 read attempt=1 left=940 breaker=CLOSED/1 slots=0",
      "500 #3 read attempt=0 left=600 breaker=CLOSED/1 slots=0",
    ]);
  });

  it("a rate limit that rejects a retry ends the call with the RateLimitError: the retry does not repeat it", async () => {
    const server = scriptedServer(() => ({ after: 10, code: "UNAVAILABLE" }));
    const client = new Client({ transport: server.transport, throwOnError: true }).use(
      resilience(
        stack({
          rateLimit: { maxRequests: 1, window: ms(60_000), strategy: "reject", onRateLimitExceeded: () => events.push(`${now()} rate limit`) },
        }),
      ),
    );
    const outcome = track(client.call(read, { id: 1 }));
    await vi.advanceTimersByTimeAsync(1000);
    expect(outcome.at).toBe(60);
    expect(outcome.error).toBeInstanceOf(RateLimitError);
    expect(events).toEqual(["0 #1 read attempt=0 left=1000 breaker=CLOSED/0 slots=0", "10 #1 UNAVAILABLE", "60 rate limit"]);
  });
});

describe("the abort points (R30)", () => {
  /** A second call shows what the first one left: the failures of the breaker and the free slots. */
  async function after(client: Client): Promise<string | undefined> {
    const before = events.length;
    track(client.call(read, { id: 99 }));
    await vi.advanceTimersByTimeAsync(20);
    return events[before];
  }

  it("an abort before the call: no try, no slot, no failure", async () => {
    const server = scriptedServer(() => ({ after: 10 }));
    const client = new Client({ transport: server.transport, throwOnError: true }).use(resilience(stack()));
    const controller = new AbortController();
    controller.abort();
    const outcome = track(client.call(read, { id: 1 }, { signal: controller.signal }));
    await vi.advanceTimersByTimeAsync(0);
    expect(outcome.at).toBe(0);
    expect(codeOf(outcome)).toBe("ABORTED");
    expect(server.requests()).toBe(0);
    expect(await after(client)).toBe("0 #1 read attempt=0 left=1000 breaker=CLOSED/0 slots=9");
  });

  it("an abort during the backoff of a retry ends the call at once", async () => {
    const server = scriptedServer(() => ({ after: 10, code: "UNAVAILABLE" }));
    const client = new Client({ transport: server.transport, throwOnError: true }).use(
      resilience(stack({ retry: { maxRetries: 3, retryDelay: ms(1000), jitter: 0, budget: false, idempotent: true } })),
    );
    const controller = new AbortController();
    const outcome = track(client.call(read, { id: 1 }, { signal: controller.signal }));
    await vi.advanceTimersByTimeAsync(200);
    controller.abort();
    await vi.advanceTimersByTimeAsync(0);
    expect(outcome.at).toBe(200);
    expect(codeOf(outcome)).toBe("ABORTED");
    expect(server.requests()).toBe(1);
  });

  it("an abort during a try ends the try, and the breaker does not count it", async () => {
    const server = scriptedServer((n) => (n === 1 ? { after: 500 } : { after: 10 }));
    const client = new Client({ transport: server.transport, throwOnError: true }).use(resilience(stack()));
    const controller = new AbortController();
    const outcome = track(client.call(read, { id: 1 }, { signal: controller.signal }));
    await vi.advanceTimersByTimeAsync(30);
    controller.abort();
    await vi.advanceTimersByTimeAsync(0);
    expect(outcome.at).toBe(30);
    expect(codeOf(outcome)).toBe("ABORTED");
    expect(events).toEqual(["0 #1 read attempt=0 left=1000 breaker=CLOSED/0 slots=9", "30 #1 aborted"]);
    expect(await after(client)).toBe("30 #2 read attempt=0 left=1000 breaker=CLOSED/0 slots=8");
  });

  // The transport ignores the signal: the timeout layers must not wait for their timeout, and
  // must not report a TIMEOUT for an abort of the caller
  for (const [name, options] of [
    ["the whole stack", stack()],
    ["an overall timeout alone", { overall: ms(1000) }],
    ["a timeout of one try alone", { perAttempt: ms(100) }],
  ] as Array<[string, ResilienceOptions]>) {
    it(`an abort during a try whose transport ignores the signal ends the call at once (${name})`, async () => {
      const server = scriptedServer(() => ({ after: 10 }));
      const faults = new FaultTransport(server.transport, { script: [[{ kind: "hang" }]] });
      const client = new Client({ transport: faults, throwOnError: true }).use(resilience(options));
      const controller = new AbortController();
      const outcome = track(client.call(read, { id: 1 }, { signal: controller.signal }));
      await vi.advanceTimersByTimeAsync(30);
      controller.abort();
      await vi.advanceTimersByTimeAsync(2000);
      // Before the fix: "ABORTED at 100" (the stack), "TIMEOUT at 1000" (overall), "TIMEOUT at 100" (one try)
      expect(outcome.at).toBe(30);
      expect(codeOf(outcome)).toBe("ABORTED");
      expect(faults.log).toHaveLength(1);
      if (options.breaker) expect(await after(client)).toMatch(/breaker=CLOSED\/0 /);
    });
  }

  it("an abort while the rate limit queues the try ends the call at once", async () => {
    const server = scriptedServer(() => ({ after: 10 }));
    const client = new Client({ transport: server.transport, throwOnError: true }).use(
      resilience(stack({ rateLimit: { maxRequests: 1, window: ms(60_000), strategy: "queue" } })),
    );
    const first = track(client.call(read, { id: 1 }));
    await vi.advanceTimersByTimeAsync(20);
    expect(first.value).toBe("value");
    const controller = new AbortController();
    const outcome = track(client.call(read, { id: 2 }, { signal: controller.signal }));
    await vi.advanceTimersByTimeAsync(50);
    expect(outcome.settled).toBe(false);
    controller.abort();
    await vi.advanceTimersByTimeAsync(0);
    expect(outcome.at).toBe(70);
    expect(codeOf(outcome)).toBe("ABORTED");
    expect(server.requests()).toBe(1);
  });
});
