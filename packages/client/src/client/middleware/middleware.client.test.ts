/**
 * The client middlewares through `Client`, with `throwOnError` on and off (deep dive TRN-5,
 * TRN-7, TRN-8, TRN-12). The old tests drove the generators directly, so they missed the
 * defects that only show through `Client`.
 */

import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Client } from "../client.js";
import { createCacheMiddleware } from "./cache.js";
import { createRetryMiddleware } from "./retry.js";
import { createTimeoutMiddleware, createOverallTimeoutMiddleware } from "./timeout.js";
import { createRateLimitMiddleware } from "./rate-limit.js";
import { isNetworkError } from "./items.js";
import type { Message, ResponseItem, Transport } from "../types.js";

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
    it("a per-attempt timeout with retry starts a new attempt", async () => {
      const { transport, messages } = fake(async function* (message, call) {
        if (call === 1) {
          // The first attempt hangs and ignores the signal
          await new Promise(() => undefined);
        }
        yield ok(message.id, "second attempt");
      });
      const client = new Client({ transport, throwOnError })
        .use(createRetryMiddleware({ retryDelay: 1, jitter: 0 }))
        .use(createTimeoutMiddleware({ perAttempt: 30 }));
      expect(await client.call(method, {})).toBe("second attempt");
      expect(messages).toHaveLength(2);
    });

    it("gives TIMEOUT, not ABORTED, when the transport reports the abort", async () => {
      const { transport } = fake(async function* (message) {
        await new Promise<void>((resolve) => message.signal!.addEventListener("abort", () => resolve()));
        yield { id: message.id, status: { type: "error", code: "ABORTED", message: "Request was aborted", retryable: false }, payload: null, metadata: {} };
      });
      const client = new Client({ transport, throwOnError }).use(createOverallTimeoutMiddleware({ overall: 20 }));
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
      const client = new Client({ transport, throwOnError }).use(createRetryMiddleware({ retryDelay: 1, jitter: 0 }));
      await expect(client.call(method, {})).rejects.toThrow("Input validation failed");
      expect(messages).toHaveLength(1);
    });

    it("retries a thrown network failure, with a new request id for each attempt", async () => {
      const { transport, messages } = fake(async function* (message, call) {
        if (call < 3) throw Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" });
        yield ok(message.id, "up");
      });
      const client = new Client({ transport, throwOnError }).use(createRetryMiddleware({ retryDelay: 1, jitter: 0 }));
      expect(await client.call(method, {})).toBe("up");
      const ids = messages.map((m) => m.id);
      expect(new Set(ids).size).toBe(3);
    });

    it("stops the backoff at once when the caller aborts", async () => {
      const { transport, messages } = fake(async function* (message) {
        yield { id: message.id, status: { type: "error", code: "UNAVAILABLE", message: "busy", retryable: true }, payload: null, metadata: {} };
      });
      const client = new Client({ transport, throwOnError }).use(createRetryMiddleware({ retryDelay: 10_000, jitter: 0 }));
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
    const client = new Client(transport).use(createRateLimitMiddleware({ maxRequests: 1, window: 30, strategy: "queue" }));
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
      createRateLimitMiddleware({ maxRequests: 1, window: 10_000, strategy: "queue" }),
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
      const { Client, LocalTransport, createRateLimitMiddleware } = await import(${JSON.stringify(pathToFileURL(dist).href)});
      const transport = new LocalTransport();
      let ran = 0;
      transport.register({ service: "t", operation: "op" }, () => { ran++; return ran; });
      const client = new Client(transport).use(createRateLimitMiddleware({ maxRequests: 1, window: 100, strategy: "queue" }));
      for (let i = 0; i < 5; i++) client.call({ service: "t", operation: "op" }, {}).then(() => { if (ran === 5) console.log("all ran"); });
    `;
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8", timeout: 20_000 });
    expect(result.stdout).toContain("all ran");
    expect(result.status).toBe(0);
  });
});
