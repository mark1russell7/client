/**
 * Per-call overrides and the context state of the middlewares, through `Client`.
 *
 * `route()` puts its overrides into the context: `cache: { ttl, bypass, refresh }` and
 * `retry: { maxAttempts, delay, backoffMultiplier, maxDelay }`. Before, the cache middleware read
 * none of them and retry read only `maxAttempts` (deep dive CORE-14, the open part). The context
 * types (`CacheContext`, `CircuitBreakerContext`, `RateLimitContext`, `PaginationContext`) were
 * never set: now each middleware writes the state that its type describes.
 */

import { describe, it, expect } from "vitest";
import { Client } from "../client.js";
import { createCacheMiddleware } from "./cache.js";
import { createRetryMiddleware } from "./retry.js";
import { createCircuitBreakerMiddleware } from "./circuit-breaker.js";
import { createRateLimitMiddleware } from "./rate-limit.js";
import { createPaginationMiddleware } from "./pagination.js";
import { toMiddlewareContext } from "../call-types.js";
import type { ClientMiddleware, Message, ResponseItem, Transport } from "../types.js";
import { ms } from "../../duration.js";

const method = { service: "test", operation: "op" };
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function ok<T>(id: string, payload: T): ResponseItem<T> {
  return { id, status: { type: "success", code: 200 }, payload, metadata: {} };
}

/** A transport that answers each call with its number, and keeps a copy of each message. */
function counting(): { transport: Transport; messages: Message<unknown>[] } {
  const messages: Message<unknown>[] = [];
  return {
    messages,
    transport: {
      name: "counting",
      send<TReq, TRes>(message: Message<TReq>): AsyncIterable<ResponseItem<TRes>> {
        messages.push({ ...(message as Message<unknown>), metadata: structuredClone(message.metadata) });
        const count = messages.length;
        return (async function* () {
          yield ok(message.id, count) as ResponseItem<TRes>;
        })();
      },
      close: async () => {},
    },
  };
}

/** A middleware that keeps a copy of the metadata after the inner middlewares ran. */
function observer(seen: Array<Record<string, unknown>>): ClientMiddleware {
  return ((next: (context: never) => AsyncIterable<unknown>) =>
    async function* (context: { message: { metadata: Record<string, unknown> } }) {
      yield* next(context as never) as AsyncIterable<never>;
      seen.push(structuredClone(context.message.metadata));
    }) as unknown as ClientMiddleware;
}

describe("cache overrides", () => {
  it("bypass: the call goes to the transport, and its response is not stored", async () => {
    const { transport } = counting();
    const client = new Client(transport).use(createCacheMiddleware({ methods: ["test.op"] }));
    expect(await client.call(method, {})).toBe(1);
    expect(await client.withContext({ cache: { bypass: true } }).call(method, {})).toBe(2);
    expect(await client.call(method, {})).toBe(1);
  });

  it("refresh: the call goes to the transport, and its response replaces the stored one", async () => {
    const { transport } = counting();
    const client = new Client(transport).use(createCacheMiddleware({ methods: ["test.op"] }));
    expect(await client.call(method, {})).toBe(1);
    expect(await client.withContext({ cache: { refresh: true } }).call(method, {})).toBe(2);
    expect(await client.call(method, {})).toBe(2);
  });

  it("ttl: the stored response expires after the time of the call, not of the middleware", async () => {
    const { transport } = counting();
    const client = new Client(transport).use(createCacheMiddleware({ methods: ["test.op"], ttl: ms(60_000) }));
    expect(await client.withContext({ cache: { ttl: ms(20) } }).call(method, {})).toBe(1);
    await sleep(60);
    expect(await client.call(method, {})).toBe(2);
  });

  it("writes cache.hit into the context", async () => {
    const seen: Array<Record<string, unknown>> = [];
    const { transport } = counting();
    const client = new Client(transport).use(observer(seen)).use(createCacheMiddleware({ methods: ["test.op"] }));
    await client.call(method, {});
    await client.call(method, {});
    expect((seen[0]?.["cache"] as { hit: boolean }).hit).toBe(false);
    expect((seen[1]?.["cache"] as { hit: boolean }).hit).toBe(true);
  });
});

describe("retry overrides", () => {
  /** A transport whose first `failures` calls fail with a retryable error. */
  function flaky(failures: number): Transport {
    let calls = 0;
    return {
      name: "flaky",
      send<TReq, TRes>(message: Message<TReq>): AsyncIterable<ResponseItem<TRes>> {
        calls++;
        const fail = calls <= failures;
        return (async function* () {
          yield (fail
            ? { id: message.id, status: { type: "error", code: "BUSY", message: "busy", retryable: true }, metadata: {} }
            : ok(message.id, "done")) as ResponseItem<TRes>;
        })();
      },
      close: async () => {},
    };
  }

  it("takes delay and backoffMultiplier from the call", async () => {
    const client = new Client(flaky(2)).use(createRetryMiddleware({ retryDelay: ms(5_000), jitter: 0 }));
    const started = Date.now();
    expect(await client.withContext({ retry: { delay: ms(10), backoffMultiplier: 3 } }).call(method, {})).toBe("done");
    const elapsed = Date.now() - started;
    // 10 ms, then 30 ms: not 5 s and 10 s
    expect(elapsed).toBeGreaterThanOrEqual(35);
    expect(elapsed).toBeLessThan(2_000);
  });

  it("caps each delay at maxDelay", async () => {
    const client = new Client(flaky(2)).use(createRetryMiddleware({ retryDelay: ms(5_000), jitter: 0 }));
    const started = Date.now();
    expect(await client.withContext({ retry: { maxDelay: ms(5) } }).call(method, {})).toBe("done");
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it("takes backoffMultiplier and maxDelay as options too", async () => {
    const client = new Client(flaky(2)).use(createRetryMiddleware({ retryDelay: ms(5_000), maxDelay: ms(5), jitter: 0 }));
    const started = Date.now();
    expect(await client.call(method, {})).toBe("done");
    expect(Date.now() - started).toBeLessThan(2_000);
  });
});

describe("route() overrides reach the keys that the middlewares read", () => {
  it("maps attempts, and keeps the other keys (the durations too)", () => {
    expect(
      toMiddlewareContext({
        retry: { attempts: 4, delay: ms(10), backoffMultiplier: 3, maxDelay: ms(50) },
        cache: { ttl: ms(5), bypass: true, refresh: false },
      }),
    ).toEqual({
      retry: { maxAttempts: 4, delay: ms(10), backoffMultiplier: 3, maxDelay: ms(50) },
      cache: { ttl: ms(5), bypass: true, refresh: false },
    });
  });
});

describe("the state of the middlewares in the context", () => {
  it("circuit breaker: state, failures, successes", async () => {
    const seen: Array<Record<string, unknown>> = [];
    const { transport } = counting();
    const client = new Client(transport).use(observer(seen)).use(createCircuitBreakerMiddleware());
    await client.call(method, {});
    expect(seen[0]?.["circuitBreaker"]).toEqual({ state: "CLOSED", failures: 0, successes: 0 });
  });

  it("rate limit: the tokens and the queue", async () => {
    const { transport, messages } = counting();
    const client = new Client(transport).use(createRateLimitMiddleware({ maxRequests: 5, window: ms(60_000) }));
    await client.call(method, {});
    expect(messages[0]?.metadata["rateLimit"]).toEqual({ tokensAvailable: 4, maxTokens: 5, queueSize: 0 });
  });

  it("pagination: the page and the limit, also as one object", async () => {
    const { transport, messages } = counting();
    const client = new Client(transport).use(createPaginationMiddleware({ defaultLimit: 20 }));
    await client.withContext({ page: 3 }).call(method, {});
    expect(messages[0]?.metadata["pagination"]).toEqual({ page: 3, limit: 20 });
  });
});
