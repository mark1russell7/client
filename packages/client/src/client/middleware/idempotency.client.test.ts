/**
 * Retry and idempotency (roadmap R1). A try whose request left and got no answer has an
 * indeterminate outcome: the server can have run it. The retry middleware sends such a call again
 * only when the call is idempotent. `ProcedureServer` runs a keyed call one time.
 */

import { describe, it, expect } from "vitest";
import { z } from "zod";
import express from "express";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Client } from "../client.js";
import { createRetryMiddleware } from "./retry.js";
import { createTimeoutMiddleware } from "./timeout.js";
import { deliveryOf, isNotSentError, thrownItem } from "./items.js";
import type { Message, ResponseItem, Transport } from "../types.js";
import { IDEMPOTENCY_KEY_METADATA, IdempotencyCache, idempotentIn, isRepeatable } from "../../procedures/idempotency.js";
import { createProcedure } from "../../procedures/define.js";
import { createRegistry } from "../../procedures/module.js";
import { ProcedureServer } from "../../server/procedure-server.js";
import type { ServerRequest, ServerResponse } from "../../server/types.js";
import { HttpTransport } from "../../adapters/http/client/transport.js";
import { HttpServerTransport } from "../../adapters/http/server/transport.js";

const method = { service: "orders", operation: "create" };

function ok<T>(id: string, payload: T): ResponseItem<T> {
  return { id, status: { type: "success", code: 200 }, payload, metadata: {} };
}

/** A transport that runs a function for each try, and records the messages. */
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

/** A transport whose first try fails with a thrown error, and whose second try succeeds. */
function failsOnce(error: Error) {
  return fake(async function* (message, call) {
    if (call === 1) throw error;
    yield ok(message.id, "second try");
  });
}

const reset = Object.assign(new Error("socket hang up"), { code: "ECONNRESET" });
const refused = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:1"), { code: "ECONNREFUSED" });

describe("the delivery of a failed try", () => {
  it("is not-sent for a refused connection and for a WebSocket that did not open", () => {
    expect(isNotSentError(refused)).toBe(true);
    expect(isNotSentError(new TypeError("fetch failed", { cause: refused }))).toBe(true);
    expect(isNotSentError(new Error("Connection timeout"))).toBe(true);
    expect(deliveryOf(thrownItem("1", refused))).toBe("not-sent");
  });

  it("is indeterminate for a reset and for a WebSocket that closed during the request", () => {
    expect(isNotSentError(reset)).toBe(false);
    expect(deliveryOf(thrownItem("1", reset))).toBe("indeterminate");
    expect(deliveryOf(thrownItem("1", new Error("WebSocket connection closed")))).toBe("indeterminate");
  });
});

describe("retry and idempotency", () => {
  it("does not send a call again after a reset, when nothing says that it is idempotent", async () => {
    const { transport, messages } = failsOnce(reset);
    const client = new Client(transport).use(createRetryMiddleware({ retryDelay: 1, jitter: 0 }));
    await expect(client.call(method, {})).rejects.toThrow("socket hang up");
    expect(messages).toHaveLength(1);
  });

  it("sends a call again after a refused connection: the request did not leave", async () => {
    const { transport, messages } = failsOnce(refused);
    const client = new Client(transport).use(createRetryMiddleware({ retryDelay: 1, jitter: 0 }));
    expect(await client.call(method, {})).toBe("second try");
    expect(messages).toHaveLength(2);
  });

  it("sends a call again when the server marks its error retryable", async () => {
    const { transport, messages } = fake(async function* (message, call) {
      if (call === 1) {
        yield { id: message.id, status: { type: "error", code: "UNAVAILABLE", message: "busy", retryable: true }, payload: null, metadata: {} };
        return;
      }
      yield ok(message.id, "second try");
    });
    const client = new Client(transport).use(createRetryMiddleware({ retryDelay: 1, jitter: 0 }));
    expect(await client.call(method, {})).toBe("second try");
    expect(messages).toHaveLength(2);
  });

  it("sends an idempotent call again after a reset: the option, the call or the registry says so", async () => {
    const byOption = failsOnce(reset);
    const optionClient = new Client(byOption.transport).use(createRetryMiddleware({ retryDelay: 1, jitter: 0, idempotent: true }));
    expect(await optionClient.call(method, {})).toBe("second try");

    const byCall = failsOnce(reset);
    const callClient = new Client(byCall.transport).use(createRetryMiddleware({ retryDelay: 1, jitter: 0 }));
    expect(await callClient.call(method, {}, { context: { retry: { idempotent: true } } })).toBe("second try");

    const registry = createRegistry({
      name: "orders-read",
      procedures: [
        createProcedure().path(["orders", "list"]).input(z.object({})).output(z.array(z.unknown())).meta({ effects: { reads: ["orders"], writes: [] } }).handler(async () => []).build(),
        createProcedure().path(["orders", "create"]).input(z.object({})).output(z.object({})).meta({ effects: { writes: ["orders"] } }).handler(async () => ({})).build(),
      ],
    });
    const isIdempotent = idempotentIn(registry);
    expect(isIdempotent({ service: "orders", operation: "list" })).toBe(true);
    expect(isIdempotent({ service: "orders", operation: "create" })).toBe(false);
    expect(isIdempotent({ service: "orders", operation: "unknown" })).toBeUndefined();
  });

  it("does not send a write again after the timeout of one try", async () => {
    const { transport, messages } = fake(async function* (message, call) {
      if (call === 1) await new Promise(() => undefined);
      yield ok(message.id, "second try");
    });
    const client = new Client({ transport, throwOnError: true })
      .use(createRetryMiddleware({ retryDelay: 1, jitter: 0 }))
      .use(createTimeoutMiddleware({ perAttempt: 20 }));
    await expect(client.call(method, {})).rejects.toMatchObject({ code: "TIMEOUT" });
    expect(messages).toHaveLength(1);
  });

  it("sends one idempotency key with each try of a call, and a new key for the next call", async () => {
    const { transport, messages } = fake(async function* (message, call) {
      if (call === 1) throw refused;
      yield ok(message.id, "done");
    });
    const client = new Client(transport).use(createRetryMiddleware({ retryDelay: 1, jitter: 0 }));
    await client.call(method, {});
    await client.call(method, {});
    const keys = messages.map((m) => m.metadata[IDEMPOTENCY_KEY_METADATA]);
    expect(typeof keys[0]).toBe("string");
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[0]);
  });

  it("keeps an idempotency key that the caller gives", async () => {
    const { transport, messages } = fake(async function* (message) {
      yield ok(message.id, "done");
    });
    const client = new Client(transport).use(createRetryMiddleware({ retryDelay: 1 }));
    await client.call(method, {}, { context: { [IDEMPOTENCY_KEY_METADATA]: "order-17" } });
    expect(messages[0]!.metadata[IDEMPOTENCY_KEY_METADATA]).toBe("order-17");
  });
});

describe("isRepeatable", () => {
  it("is true for an idempotent procedure and for one that changes nothing", () => {
    expect(isRepeatable({ writes: ["db"], idempotent: true })).toBe(true);
    expect(isRepeatable({ reads: ["db"], writes: [] })).toBe(true);
    expect(isRepeatable({ writes: ["db"] })).toBe(false);
    expect(isRepeatable(undefined)).toBe(false);
  });
});

describe("IdempotencyCache", () => {
  it("runs a key one time, and forgets it after its time to live", async () => {
    let now = 0;
    const cache = new IdempotencyCache<number>({ ttlMs: 100, now: () => now });
    let runs = 0;
    const run = async (): Promise<number> => ++runs;
    expect(await cache.run("a", run, () => true).result).toBe(1);
    expect(await cache.run("a", run, () => true).result).toBe(1);
    now = 100;
    expect(await cache.run("a", run, () => true).result).toBe(2);
  });

  it("runs a key again when the result is not kept, or when the run throws", async () => {
    const cache = new IdempotencyCache<number>();
    let runs = 0;
    expect(await cache.run("a", async () => ++runs, () => false).result).toBe(1);
    expect(await cache.run("a", async () => ++runs, () => false).result).toBe(2);
    await expect(cache.run("b", async () => { throw new Error("no"); }, () => true).result).rejects.toThrow("no");
    expect(cache.size).toBe(0);
  });

  it("keeps at most maxEntries finished results, and drops the oldest first", async () => {
    const cache = new IdempotencyCache<number>({ maxEntries: 2 });
    for (const key of ["a", "b", "c"]) await cache.run(key, async () => 1, () => true).result;
    expect(cache.size).toBe(2);
    let ran = false;
    await cache.run("a", async () => { ran = true; return 2; }, () => true).result;
    expect(ran).toBe(true);
  });
});

/** A server with one write procedure that counts its runs. */
function counterServer(options: { delayMs?: number; idempotent?: boolean; throwRetryable?: boolean } = {}) {
  const state = { runs: 0 };
  const registry = createRegistry({
    name: "orders",
    procedures: [
      createProcedure()
        .path(["orders", "create"])
        .input(z.object({ item: z.string() }))
        .output(z.object({ order: z.number() }))
        .meta({ effects: { writes: ["orders"], ...(options.idempotent ? { idempotent: true } : {}) } })
        .handler(async () => {
          state.runs++;
          if (options.delayMs) await new Promise((resolve) => setTimeout(resolve, options.delayMs));
          if (options.throwRetryable) throw Object.assign(new Error("busy"), { retryable: true });
          return { order: state.runs };
        })
        .build(),
    ],
  });
  const server = new ProcedureServer({ registry });
  server.registerFromRegistry();
  const handler = (server as unknown as { findHandler(m: unknown): ((r: ServerRequest<unknown>) => Promise<ServerResponse<unknown>>) | null }).findHandler(method)!;
  const request = (id: string, key?: string, signal?: AbortSignal): ServerRequest<unknown> => ({
    id,
    method,
    payload: { item: "book" },
    metadata: key ? { [IDEMPOTENCY_KEY_METADATA]: key } : {},
    ...(signal ? { signal } : {}),
  });
  return { server, state, handler, request };
}

describe("ProcedureServer runs a keyed write one time", () => {
  it("gives the first result to a second try with the same key", async () => {
    const { state, handler, request } = counterServer();
    const first = await handler(request("1", "k1"));
    const second = await handler(request("2", "k1"));
    expect(state.runs).toBe(1);
    expect(first.payload).toEqual({ order: 1 });
    expect(second).toMatchObject({ id: "2", payload: { order: 1 } });
    await handler(request("3", "k2"));
    expect(state.runs).toBe(2);
  });

  it("lets a try with the same key wait for the first run", async () => {
    const { state, handler, request } = counterServer({ delayMs: 20 });
    const [a, b] = await Promise.all([handler(request("1", "k")), handler(request("2", "k"))]);
    expect(state.runs).toBe(1);
    expect(a.payload).toEqual(b.payload);
  });

  it("continues a keyed write after its caller goes away, so that the next try gets its result", async () => {
    const { state, handler, request } = counterServer({ delayMs: 30 });
    const controller = new AbortController();
    const first = handler(request("1", "k", controller.signal));
    setTimeout(() => controller.abort(), 5);
    await first;
    const second = await handler(request("2", "k"));
    expect(state.runs).toBe(1);
    expect(second.status.type).toBe("success");
    expect(second.payload).toEqual({ order: 1 });
  });

  it("runs a call without a key, and a repeatable procedure, each time", async () => {
    const plain = counterServer();
    await plain.handler(plain.request("1"));
    await plain.handler(plain.request("2"));
    expect(plain.state.runs).toBe(2);
    const repeatable = counterServer({ idempotent: true });
    await repeatable.handler(repeatable.request("1", "k"));
    await repeatable.handler(repeatable.request("2", "k"));
    expect(repeatable.state.runs).toBe(2);
  });

  it("runs a key again after a retryable error", async () => {
    const { state, handler, request } = counterServer({ throwRetryable: true });
    await handler(request("1", "k"));
    await handler(request("2", "k"));
    expect(state.runs).toBe(2);
  });

  it("can turn the cache off", async () => {
    const server = new ProcedureServer({ registry: createRegistry(), idempotency: false });
    expect((server as unknown as { idempotency: unknown }).idempotency).toBeUndefined();
  });
});

describe("retry with a key over HTTP", () => {
  it("runs a slow write one time when the timeout of the first try ends", async () => {
    const { server, state } = counterServer({ delayMs: 120 });
    const app = express();
    const http = createServer(app);
    server.addTransport(new HttpServerTransport(server, { app, httpServer: http }));
    await server.start();
    await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", () => resolve()));
    try {
      const transport = new HttpTransport({ baseUrl: `http://127.0.0.1:${(http.address() as AddressInfo).port}/api` });
      const client = new Client({ transport, throwOnError: true })
        .use(createRetryMiddleware({ retryDelay: 10, jitter: 0, idempotent: true }))
        .use(createTimeoutMiddleware({ perAttempt: 60 }));
      // Try 1 times out at 60 ms. Try 2 starts at 70 ms and waits for the run of try 1 (120 ms).
      const result = await client.call<{ item: string }, { order: number }>(method, { item: "book" });
      expect(result).toEqual({ order: 1 });
      expect(state.runs).toBe(1);
    } finally {
      await server.stop();
      http.closeAllConnections();
      await new Promise<void>((resolve) => http.close(() => resolve()));
    }
  });
});
