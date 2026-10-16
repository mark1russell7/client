/**
 * The client middlewares through `Client`, with `throwOnError` on and off (deep dive TRN-5,
 * TRN-7, TRN-8, TRN-12). The old tests drove the generators directly, so they missed the
 * defects that only show through `Client`.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { spawnSync } from "node:child_process";
import { getEventListeners } from "node:events";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Client } from "../client.js";
import { createCacheMiddleware } from "./cache.js";
import { createRetryMiddleware } from "./retry.js";
import { createTimeoutMiddleware, createOverallTimeoutMiddleware, createCombinedTimeoutMiddleware } from "./timeout.js";
import { createRateLimitMiddleware, createPerServiceRateLimiter, RateLimitError, type RateLimitStats } from "./rate-limit.js";
import { isNetworkError } from "./items.js";
import { DEADLINE_METADATA_KEY, TIMEOUT_METADATA_KEY } from "../deadline.js";
import type { ClientContext, ClientMiddleware, ClientRunner, Message, ResponseItem, Transport } from "../types.js";
import { ms } from "../../duration.js";

const method = { service: "test", operation: "op" };

function ok<T>(id: string, payload: T): ResponseItem<T> {
  return { id, status: { type: "success", code: 200 }, payload, metadata: {} };
}

/** A transport that runs a function for each call. */
function fake(run: (message: Message<unknown>, call: number) => AsyncIterable<ResponseItem<unknown>>): { transport: Transport; messages: Message<unknown>[] } {
  const messages: Message<unknown>[] = [];
  return {
    messages,
    transport: {
      name: "fake",
      send<TReq, TRes>(message: Message<TReq>): AsyncIterable<ResponseItem<TRes>> {
        messages.push({ ...(message as Message<unknown>), metadata: { ...message.metadata } });
        return run(message as Message<unknown>, messages.length) as AsyncIterable<ResponseItem<TRes>>;
      },
      close: async () => {},
    },
  };
}

/** A promise that never settles: a transport that waits for it ignores the signal. */
const forever = (): Promise<never> => new Promise<never>(() => undefined);

/** The outcome of a call on fake timers: settled or not, and the value or the error. */
interface Outcome {
  settled: boolean;
  value?: unknown;
  error?: unknown;
}

function track(promise: Promise<unknown>): Outcome {
  const outcome: Outcome = { settled: false };
  promise.then(
    (value) => Object.assign(outcome, { settled: true, value }),
    (error: unknown) => Object.assign(outcome, { settled: true, error }),
  );
  return outcome;
}

/**
 * An inner runner whose iterator has only `next()`: it gives `items` success items, then it waits
 * forever. A `ClientRunner` gives any async iterable, so its iterator does not need `return()`.
 */
function bare(items: number): ClientRunner {
  return (context: ClientContext) => {
    let sent = 0;
    return {
      [Symbol.asyncIterator]: () => ({
        next: () => (sent < items ? Promise.resolve({ done: false, value: ok(context.message.id, ++sent) }) : forever()),
      }),
    };
  };
}

/** A middleware that runs `look` on the message after the inner middlewares ended. */
function afterCall(look: (message: Message<unknown>) => void): ClientMiddleware {
  return ((next: (context: never) => AsyncIterable<unknown>) =>
    async function* (context: { message: Message<unknown> }) {
      yield* next(context as never) as AsyncIterable<never>;
      look(context.message);
    }) as unknown as ClientMiddleware;
}

describe("cache (TRN-5)", () => {
  it("keeps the responses of two users apart (the metadata is part of the key)", async () => {
    const { transport } = fake(async function* (message) {
      yield ok(message.id, `data of ${(message.metadata.auth as { token: string }).token}`);
    });
    const client = new Client(transport).use(createCacheMiddleware({ methods: ["test.op"] }));
    const alice = client.withContext({ auth: { token: "alice" } });
    const bob = client.withContext({ auth: { token: "bob" } });
    expect(await alice.call(method, {})).toBe("data of alice");
    expect(await bob.call(method, {})).toBe("data of bob");
    expect(await alice.call(method, {})).toBe("data of alice");
  });

  it("caches only the methods that opt in", async () => {
    const { transport, messages } = fake(async function* (message) {
      yield ok(message.id, messages.length);
    });
    const client = new Client(transport).use(createCacheMiddleware({ methods: (m) => m.operation === "get" }));
    await client.call({ service: "users", operation: "get" }, {});
    await client.call({ service: "users", operation: "get" }, {});
    await client.call({ service: "users", operation: "delete" }, {});
    await client.call({ service: "users", operation: "delete" }, {});
    expect(messages.map((m) => m.method.operation)).toEqual(["get", "delete", "delete"]);
  });

  it("never caches a stream", async () => {
    const { transport, messages } = fake(async function* (message) {
      yield ok(message.id, 1);
      yield ok(message.id, 2);
    });
    const client = new Client(transport).use(createCacheMiddleware({ methods: ["test.op"] }));
    await client.call(method, {});
    await client.call(method, {});
    expect(messages).toHaveLength(2);
  });

  it("gives each caller its own copy of a cached object", async () => {
    const { transport } = fake(async function* (message) {
      yield ok(message.id, { list: [1, 2] });
    });
    const client = new Client(transport).use(createCacheMiddleware({ methods: ["test.op"] }));
    const first = await client.call<unknown, { list: number[] }>(method, {});
    first.list.push(99);
    const second = await client.call<unknown, { list: number[] }>(method, {});
    expect(second.list).toEqual([1, 2]);
  });
});

for (const throwOnError of [true, false]) {
  describe(`timeout (TRN-7), throwOnError: ${throwOnError}`, () => {
    it("a per-attempt timeout with retry starts a new attempt of an idempotent call", async () => {
      const { transport, messages } = fake(async function* (message, call) {
        if (call === 1) {
          // The first attempt hangs and ignores the signal
          await new Promise(() => undefined);
        }
        yield ok(message.id, "second attempt");
      });
      const client = new Client({ transport, throwOnError })
        // The first attempt can have run on the server, so only an idempotent call goes again (R1)
        .use(createRetryMiddleware({ retryDelay: ms(1), jitter: 0, idempotent: true }))
        .use(createTimeoutMiddleware({ perAttempt: ms(30) }));
      expect(await client.call(method, {})).toBe("second attempt");
      expect(messages).toHaveLength(2);
    });

    it("gives TIMEOUT, not ABORTED, when the transport reports the abort", async () => {
      const { transport } = fake(async function* (message) {
        await new Promise<void>((resolve) => message.signal!.addEventListener("abort", () => resolve()));
        yield { id: message.id, status: { type: "error", code: "ABORTED", message: "Request was aborted", retryable: false }, payload: null, metadata: {} };
      });
      const client = new Client({ transport, throwOnError }).use(createOverallTimeoutMiddleware({ overall: ms(20) }));
      if (throwOnError) {
        await expect(client.call(method, {})).rejects.toMatchObject({ code: "TIMEOUT" });
      } else {
        // Without throwOnError, the error item gives a null result
        expect(await client.call(method, {})).toBeNull();
      }
    });
  });

  describe(`retry (TRN-8), throwOnError: ${throwOnError}`, () => {
    it("does not retry a thrown error that is not a network failure", async () => {
      const { transport, messages } = fake(async function* () {
        throw new Error("Input validation failed");
      });
      const client = new Client({ transport, throwOnError }).use(createRetryMiddleware({ retryDelay: ms(1), jitter: 0 }));
      await expect(client.call(method, {})).rejects.toThrow("Input validation failed");
      expect(messages).toHaveLength(1);
    });

    it("retries a thrown network failure, with a new request id for each attempt", async () => {
      const { transport, messages } = fake(async function* (message, call) {
        if (call < 3) throw Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" });
        yield ok(message.id, "up");
      });
      const client = new Client({ transport, throwOnError }).use(createRetryMiddleware({ retryDelay: ms(1), jitter: 0 }));
      expect(await client.call(method, {})).toBe("up");
      const ids = messages.map((m) => m.id);
      expect(new Set(ids).size).toBe(3);
    });

    it("stops the backoff at once when the caller aborts", async () => {
      const { transport, messages } = fake(async function* (message) {
        yield { id: message.id, status: { type: "error", code: "UNAVAILABLE", message: "busy", retryable: true }, payload: null, metadata: {} };
      });
      const client = new Client({ transport, throwOnError }).use(createRetryMiddleware({ retryDelay: ms(10_000), jitter: 0 }));
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 20);
      const started = Date.now();
      const result = client.call(method, {}, { signal: controller.signal });
      if (throwOnError) await expect(result).rejects.toMatchObject({ code: "ABORTED" });
      else expect(await result).toBeNull();
      expect(Date.now() - started).toBeLessThan(2000);
      expect(messages).toHaveLength(1);
    });
  });
}

describe("timeout on fake timers", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("ends a hung try at its time, with TIMEOUT and the default message", async () => {
    const { transport } = fake(async function* () {
      await forever();
    });
    const perAttempt = track(new Client(transport).use(createTimeoutMiddleware({ perAttempt: ms(100) })).call(method, {}));
    const overall = track(new Client(transport).use(createOverallTimeoutMiddleware({ overall: ms(100) })).call(method, {}));
    const combined = track(
      new Client(transport).use(createCombinedTimeoutMiddleware({ overall: ms(100), perAttempt: ms(1000) })).call(method, {}),
    );
    await vi.advanceTimersByTimeAsync(99);
    expect([perAttempt.settled, overall.settled, combined.settled]).toEqual([false, false, false]);
    await vi.advanceTimersByTimeAsync(1);
    expect(perAttempt.error).toMatchObject({ code: "TIMEOUT", message: "Request timeout" });
    expect(overall.error).toMatchObject({ code: "TIMEOUT", message: "Overall request timeout" });
    expect(combined.error).toMatchObject({ code: "TIMEOUT", message: "Request timeout (overall)" });
  });

  it("lets a call without a time run as long as it runs", async () => {
    const { transport } = fake(async function* (message) {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      yield ok(message.id, "late");
    });
    const perAttempt = track(new Client(transport).use(createTimeoutMiddleware({})).call(method, {}));
    const overall = track(new Client(transport).use(createOverallTimeoutMiddleware({})).call(method, {}));
    await vi.advanceTimersByTimeAsync(5000);
    expect(perAttempt).toEqual({ settled: true, value: "late" });
    expect(overall).toEqual({ settled: true, value: "late" });
  });

  it("names the option or the context field of a time that is not a duration", async () => {
    expect(() => createTimeoutMiddleware({ perAttempt: 100 as never })).toThrow(/^perAttempt must be a duration/);
    const { transport } = fake(async function* (message) {
      yield ok(message.id, "done");
    });
    await expect(
      new Client(transport).use(createTimeoutMiddleware({})).call(method, {}, { context: { timeout: { perAttempt: 100 } } as never }),
    ).rejects.toThrow(/^timeout\.perAttempt must be a duration/);
    await expect(
      new Client(transport).use(createOverallTimeoutMiddleware({})).call(method, {}, { context: { timeout: { overall: 100 } } as never }),
    ).rejects.toThrow(/^timeout\.overall must be a duration/);
  });

  it("gives a try at most the remaining time of the call", async () => {
    const { transport } = fake(async function* () {
      await forever();
    });
    const client = new Client(transport).use(createTimeoutMiddleware({ perAttempt: ms(10_000) }));
    const call = track(client.call(method, {}, { context: { [TIMEOUT_METADATA_KEY]: 50 } }));
    await vi.advanceTimersByTimeAsync(49);
    expect(call.settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(call.error).toMatchObject({ code: "TIMEOUT", message: "Request timeout" });
  });

  it("gives an error item of the transport as it is when the time did not run out", async () => {
    const { transport } = fake(async function* (message) {
      yield { id: message.id, status: { type: "error", code: "UNAVAILABLE", message: "busy", retryable: true }, payload: null, metadata: {} };
    });
    const client = new Client(transport).use(createTimeoutMiddleware({ perAttempt: ms(100) }));
    await expect(client.call(method, {})).rejects.toMatchObject({ code: "UNAVAILABLE", message: "busy" });
  });

  it("stops its timer, and puts back the deadline and the signal of the message", async () => {
    const after: Array<{ deadline: boolean; hasSignal: boolean; signal: AbortSignal | undefined }> = [];
    const { transport, messages } = fake(async function* (message) {
      yield ok(message.id, "done");
    });
    const client = new Client(transport)
      .use(afterCall((message) => after.push({ deadline: DEADLINE_METADATA_KEY in message.metadata, hasSignal: "signal" in message, signal: message.signal })))
      .use(createOverallTimeoutMiddleware({ overall: ms(1000) }));
    expect(await client.call(method, {})).toBe("done");
    expect(vi.getTimerCount()).toBe(0);
    // The transport got the deadline and a signal of the timeout. After the call, the message has neither.
    expect(messages[0]!.metadata[DEADLINE_METADATA_KEY]).toBeTypeOf("number");
    expect(messages[0]!.signal).toBeInstanceOf(AbortSignal);
    expect(after[0]).toEqual({ deadline: false, hasSignal: false, signal: undefined });
    // A signal of the caller is in the message again after the call
    const caller = new AbortController();
    await client.call(method, {}, { signal: caller.signal });
    expect(after[1]).toEqual({ deadline: false, hasSignal: true, signal: caller.signal });
  });

  it("stops the transport when the reader stops early", async () => {
    let stopped = false;
    const { transport } = fake(async function* (message) {
      try {
        yield ok(message.id, 1);
        yield ok(message.id, 2);
      } finally {
        stopped = true;
      }
    });
    const client = new Client(transport).use(createTimeoutMiddleware({ perAttempt: ms(100) }));
    for await (const value of client.stream(method, {})) {
      expect(value).toBe(1);
      break;
    }
    expect(stopped).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("works with an inner runner whose iterator has no return()", async () => {
    const timeout = createTimeoutMiddleware({ perAttempt: ms(100) }) as unknown as (next: ClientRunner) => ClientRunner;
    const context = (signal?: AbortSignal): ClientContext => ({
      message: { id: "1", method, payload: {}, metadata: {}, ...(signal ? { signal } : {}) },
    });
    // The reader stops early
    for await (const item of timeout(bare(2))(context())) {
      expect(item.payload).toBe(1);
      break;
    }
    // The caller aborts a try that waits
    const caller = new AbortController();
    const items: ResponseItem[] = [];
    const read = track(
      (async () => {
        for await (const item of timeout(bare(0))(context(caller.signal))) items.push(item);
      })(),
    );
    await vi.advanceTimersByTimeAsync(0);
    caller.abort();
    await vi.advanceTimersByTimeAsync(0);
    expect(read).toEqual({ settled: true, value: undefined });
    expect(items.map((item) => item.status)).toEqual([{ type: "error", code: "ABORTED", message: "Request was aborted", retryable: false }]);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("timeout without AbortSignal.any", () => {
  // Node 20.3 and the browsers since 2024 have AbortSignal.any. The middleware composes the signals by hand without it.
  let any: PropertyDescriptor | undefined;
  beforeEach(() => {
    vi.useFakeTimers();
    any = Object.getOwnPropertyDescriptor(AbortSignal, "any");
    Reflect.deleteProperty(AbortSignal, "any");
  });
  afterEach(() => {
    if (any) Object.defineProperty(AbortSignal, "any", any);
    vi.useRealTimers();
  });

  it("aborts the signal of the transport at the time, and removes its listeners from the signal of the caller", async () => {
    expect("any" in AbortSignal).toBe(false);
    const { transport, messages } = fake(async function* (message, call) {
      if (call === 1) yield ok(message.id, "in time");
      else await forever();
    });
    const client = new Client(transport).use(createTimeoutMiddleware({ perAttempt: ms(100) }));
    const caller = new AbortController();
    expect(await client.call(method, {}, { signal: caller.signal })).toBe("in time");
    expect(messages[0]!.signal!.aborted).toBe(false);
    expect(getEventListeners(caller.signal, "abort")).toHaveLength(0);

    const late = track(client.call(method, {}, { signal: caller.signal }));
    await vi.advanceTimersByTimeAsync(100);
    expect(late.error).toMatchObject({ code: "TIMEOUT" });
    expect(messages[1]!.signal!.aborted).toBe(true);
    expect(caller.signal.aborted).toBe(false);
    expect(getEventListeners(caller.signal, "abort")).toHaveLength(0);
  });

  it("ends the call at once when the caller aborts, during the try or before it", async () => {
    const { transport, messages } = fake(async function* () {
      await forever();
    });
    const client = new Client(transport).use(createTimeoutMiddleware({ perAttempt: ms(10_000) }));
    const during = new AbortController();
    const first = track(client.call(method, {}, { signal: during.signal }));
    await vi.advanceTimersByTimeAsync(0);
    during.abort();
    await vi.advanceTimersByTimeAsync(0);
    expect(first.error).toMatchObject({ code: "ABORTED" });
    expect(messages[0]!.signal!.aborted).toBe(true);

    const before = new AbortController();
    before.abort();
    const second = track(client.call(method, {}, { signal: before.signal }));
    await vi.advanceTimersByTimeAsync(0);
    expect(second.error).toMatchObject({ code: "ABORTED" });
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("isNetworkError", () => {
  it("knows the network failures", () => {
    expect(isNetworkError(Object.assign(new Error("x"), { code: "ECONNRESET" }))).toBe(true);
    expect(isNetworkError(new TypeError("fetch failed"))).toBe(true);
    expect(isNetworkError(new Error("WebSocket connection closed"))).toBe(true);
    expect(isNetworkError(new Error("Input validation failed"))).toBe(false);
    expect(isNetworkError("text")).toBe(false);
  });
});

describe("rate limit (TRN-12)", () => {
  it("runs the queued requests in order; an arrival waits behind them", async () => {
    const order: number[] = [];
    const { transport } = fake(async function* (message) {
      order.push((message.payload as { n: number }).n);
      yield ok(message.id, null);
    });
    const client = new Client(transport).use(createRateLimitMiddleware({ maxRequests: 1, window: ms(30), strategy: "queue" }));
    const calls = [1, 2, 3].map((n) => client.call(method, { n }));
    await new Promise((resolve) => setTimeout(resolve, 35));
    calls.push(client.call(method, { n: 4 }));
    await Promise.all(calls);
    expect(order).toEqual([1, 2, 3, 4]);
  });

  it("removes a queued request whose caller aborts", async () => {
    const { transport, messages } = fake(async function* (message) {
      yield ok(message.id, null);
    });
    const client = new Client({ transport, throwOnError: false }).use(
      createRateLimitMiddleware({ maxRequests: 1, window: ms(10_000), strategy: "queue" }),
    );
    await client.call(method, {});
    const controller = new AbortController();
    const waiting = client.call(method, {}, { signal: controller.signal });
    controller.abort();
    expect(await waiting).toBeNull();
    expect(messages).toHaveLength(1);
  });

  it("keeps the process alive until the queued requests ran", () => {
    const dist = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "dist", "client", "index.js");
    if (!existsSync(dist)) return; // the build makes dist/ before the tests in CI
    const script = `
      const { Client, LocalTransport, createRateLimitMiddleware, ms } = await import(${JSON.stringify(pathToFileURL(dist).href)});
      const transport = new LocalTransport();
      let ran = 0;
      transport.register({ service: "t", operation: "op" }, () => { ran++; return ran; });
      const client = new Client(transport).use(createRateLimitMiddleware({ maxRequests: 1, window: ms(100), strategy: "queue" }));
      for (let i = 0; i < 5; i++) client.call({ service: "t", operation: "op" }, {}).then(() => { if (ran === 5) console.log("all ran"); });
    `;
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8", timeout: 20_000 });
    expect(result.stdout).toContain("all ran");
    expect(result.status).toBe(0);
  });
});

describe("rate limit on fake timers", () => {
  let t0 = 0;
  /** The time since the start of the test, in milliseconds of the fake clock. */
  const now = (): number => Date.now() - t0;
  beforeEach(() => {
    vi.useFakeTimers();
    t0 = Date.now();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /** A transport that answers at once, and keeps the name in the payload and the time of each call. */
  function recording() {
    const ran: string[] = [];
    const { transport, messages } = fake(async function* (message) {
      ran.push(`${(message.payload as { name?: string }).name ?? "call"} ${now()}`);
      yield ok(message.id, null);
    });
    return { transport, messages, ran };
  }

  it("rejects by default, with the message and the stats of the limiter", async () => {
    const { transport, messages } = recording();
    const client = new Client(transport).use(createRateLimitMiddleware({ maxRequests: 1 }));
    await client.call(method, {});
    const second = track(client.call(method, {}));
    await vi.advanceTimersByTimeAsync(0);
    expect(second.error).toBeInstanceOf(RateLimitError);
    expect(second.error).toMatchObject({
      message: "Rate limit exceeded",
      stats: { tokensAvailable: 0, maxTokens: 1, queueSize: 0, totalRequests: 2, rejectedRequests: 0 },
    });
    const third = await client.call(method, {}).catch((error: unknown) => error);
    expect((third as RateLimitError).stats).toMatchObject({ totalRequests: 3, rejectedRequests: 1 });
    expect(messages).toHaveLength(1);
  });

  it("gives the whole budget back after one window", async () => {
    // (1 / 49) × 49 is 0.9999999999999999: a partial refill alone gives less than one token
    const { transport, messages } = recording();
    const client = new Client(transport).use(createRateLimitMiddleware({ maxRequests: 1, window: ms(49) }));
    await client.call(method, {});
    await vi.advanceTimersByTimeAsync(49);
    expect(await client.call(method, {})).toBeNull();
    expect(messages).toHaveLength(2);
  });

  it("queues a request until the next token, with one timer that it stops when the queue is empty", async () => {
    const { transport, ran } = recording();
    const client = new Client(transport).use(createRateLimitMiddleware({ maxRequests: 2, window: ms(1000), strategy: "queue" }));
    const calls = ["a", "b", "c", "d"].map((name) => client.call(method, { name }));
    await vi.advanceTimersByTimeAsync(0);
    expect(ran).toEqual(["a 0", "b 0"]);
    expect(vi.getTimerCount()).toBe(1);
    // The limiter sleeps until the next whole token: it does not poll
    await vi.advanceTimersToNextTimerAsync();
    expect(now()).toBe(500);
    expect(ran).toEqual(["a 0", "b 0", "c 500"]);
    await vi.advanceTimersByTimeAsync(500);
    expect(ran).toEqual(["a 0", "b 0", "c 500", "d 1000"]);
    await Promise.all(calls);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("gives one token to each waiting request when the drain runs late, and keeps the other tokens", async () => {
    const { transport, ran } = recording();
    const client = new Client(transport).use(createRateLimitMiddleware({ maxRequests: 2, window: ms(1000), strategy: "queue" }));
    const calls = ["a", "b", "c"].map((name) => client.call(method, { name }));
    await vi.advanceTimersByTimeAsync(0);
    // A busy event loop: the clock goes on, and the timer of the drain runs late
    vi.setSystemTime(Date.now() + 5000);
    await vi.advanceTimersByTimeAsync(500);
    await Promise.all(calls);
    expect(ran).toEqual(["a 0", "b 0", "c 5500"]);
    const free = track(client.call(method, { name: "d" }));
    await vi.advanceTimersByTimeAsync(0);
    expect(free).toEqual({ settled: true, value: null });
    expect(ran).toEqual(["a 0", "b 0", "c 5500", "d 5500"]);
  });

  it("rejects a request when the queue is full, and counts the rejections", async () => {
    const { transport, messages } = recording();
    const exceeded: RateLimitStats[] = [];
    const client = new Client(transport).use(
      createRateLimitMiddleware({ maxRequests: 1, window: ms(1000), strategy: "queue", maxQueueSize: 1, onRateLimitExceeded: (stats) => exceeded.push(stats) }),
    );
    const first = client.call(method, {});
    const queued = client.call(method, {});
    const full = track(client.call(method, {}));
    const again = track(client.call(method, {}));
    await vi.advanceTimersByTimeAsync(0);
    expect(full.error).toBeInstanceOf(RateLimitError);
    expect(full.error).toMatchObject({
      message: "Rate limit exceeded (queue full)",
      stats: { tokensAvailable: 0, maxTokens: 1, queueSize: 1, totalRequests: 3, rejectedRequests: 0 },
    });
    expect((again.error as RateLimitError).stats).toMatchObject({ totalRequests: 4, rejectedRequests: 1 });
    expect(exceeded.map((stats) => stats.rejectedRequests)).toEqual([0, 1]);

    // Without the callback, a full queue gives the same error
    const quiet = new Client(transport).use(createRateLimitMiddleware({ maxRequests: 1, window: ms(1000), strategy: "queue", maxQueueSize: 0 }));
    await quiet.call(method, {});
    const refused = track(quiet.call(method, {}));
    await vi.advanceTimersByTimeAsync(0);
    expect(refused.error).toBeInstanceOf(RateLimitError);

    await vi.advanceTimersByTimeAsync(1000);
    await Promise.all([first, queued]);
    expect(messages).toHaveLength(3);
  });

  it("removes a waiting request whose caller aborts: the next request gets its token", async () => {
    const { transport, ran } = recording();
    const client = new Client({ transport, throwOnError: false }).use(
      createRateLimitMiddleware({ maxRequests: 1, window: ms(1000), strategy: "queue" }),
    );
    const leaver = new AbortController();
    const stayer = new AbortController();
    const calls = [
      client.call(method, { name: "first" }),
      client.call(method, { name: "leaver" }, { signal: leaver.signal }),
      client.call(method, { name: "stayer" }, { signal: stayer.signal }),
    ];
    leaver.abort();
    await vi.advanceTimersByTimeAsync(1000);
    expect(await calls[1]).toBeNull();
    expect(ran).toEqual(["first 0", "stayer 1000"]);
    await Promise.all(calls);
    // The request that got its token keeps no listener on the signal of its caller
    expect(getEventListeners(stayer.signal, "abort")).toHaveLength(0);
  });

  it("gives no place in the queue to a caller that aborted before", async () => {
    const { transport, messages } = recording();
    const client = new Client({ transport, throwOnError: false }).use(
      createRateLimitMiddleware({ maxRequests: 1, window: ms(1000), strategy: "queue" }),
    );
    await client.call(method, {});
    const caller = new AbortController();
    caller.abort();
    const late = track(client.call(method, {}, { signal: caller.signal }));
    await vi.advanceTimersByTimeAsync(0);
    expect(late).toEqual({ settled: true, value: null });
    await vi.advanceTimersByTimeAsync(1000);
    expect(messages).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("createPerServiceRateLimiter", () => {
  const users = { service: "users", operation: "get" };
  const orders = { service: "orders", operation: "get" };

  it("gives each listed service its own limit, and the other services the default limit", async () => {
    const { transport, messages } = fake(async function* (message) {
      yield ok(message.id, null);
    });
    const client = new Client(transport).use(createPerServiceRateLimiter({ users: { maxRequests: 1 }, default: { maxRequests: 2 } }));
    await client.call(users, {});
    await expect(client.call(users, {})).rejects.toBeInstanceOf(RateLimitError);
    await client.call(orders, {});
    await client.call(orders, {});
    await expect(client.call(orders, {})).rejects.toBeInstanceOf(RateLimitError);
    expect(messages).toHaveLength(3);
  });

  it("does not limit a service that is not listed when there is no default", async () => {
    const { transport, messages } = fake(async function* (message) {
      yield ok(message.id, null);
    });
    const client = new Client(transport).use(createPerServiceRateLimiter({ users: { maxRequests: 1 } }));
    for (let n = 0; n < 3; n++) expect(await client.call(orders, {})).toBeNull();
    await client.call(users, {});
    await expect(client.call(users, {})).rejects.toBeInstanceOf(RateLimitError);
    expect(messages).toHaveLength(4);
  });
});
