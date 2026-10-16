/**
 * The rules of retry and the circuit breaker (roadmap R12): a retry budget, full jitter,
 * Retry-After, maxAttempts as the number of tries, and a circuit breaker that counts only the
 * failures of availability.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import express from "express";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { z } from "zod";
import { Client } from "../client.js";
import { createRetryMiddleware } from "./retry.js";
import { createCircuitBreakerMiddleware, CircuitBreakerError } from "./circuit-breaker.js";
import { isAvailabilityFailure, retryAfterOf } from "./items.js";
import type { Message, ResponseItem, Transport } from "../types.js";
import { ms, seconds } from "../../duration.js";
import { createProcedure } from "../../procedures/define.js";
import { createRegistry } from "../../procedures/module.js";
import { ProcedureServer } from "../../server/procedure-server.js";
import { HttpTransport } from "../../adapters/http/client/transport.js";
import { HttpServerTransport } from "../../adapters/http/server/transport.js";

const method = { service: "test", operation: "op" };

afterEach(() => vi.restoreAllMocks());

function error(id: string, code: string, retryable = true, metadata: Record<string, unknown> = {}): ResponseItem<unknown> {
  return { id, status: { type: "error", code, message: code, retryable }, payload: null, metadata };
}
function ok(id: string): ResponseItem<unknown> {
  return { id, status: { type: "success", code: 200 }, payload: "ok", metadata: {} };
}

/** A transport that answers each try with the next item of the script, then with the last one. */
function scripted(script: Array<(id: string) => ResponseItem<unknown>>) {
  const times: number[] = [];
  const transport: Transport = {
    name: "scripted",
    async *send<TReq, TRes>(message: Message<TReq>): AsyncIterable<ResponseItem<TRes>> {
      times.push(Date.now());
      const step = script[Math.min(times.length - 1, script.length - 1)]!;
      yield step(message.id) as ResponseItem<TRes>;
    },
    close: async () => {},
  };
  return { transport, times };
}

describe("retry (R12)", () => {
  it("maxAttempts counts the tries", async () => {
    const { transport, times } = scripted([(id) => error(id, "UNAVAILABLE")]);
    const client = new Client({ transport, throwOnError: false }).use(createRetryMiddleware({ retryDelay: ms(0), budget: false }));
    await client.call(method, {}, { context: { retry: { maxAttempts: 3 } } });
    expect(times).toHaveLength(3);
  });

  it("uses full jitter: the delay is a random time from 0 to the backoff", async () => {
    vi.spyOn(Math, "random").mockReturnValue(1);
    const { transport, times } = scripted([(id) => error(id, "UNAVAILABLE"), ok]);
    const client = new Client(transport).use(createRetryMiddleware({ retryDelay: seconds(5), budget: false }));
    await client.call(method, {});
    // random() = 1 takes the whole backoff away: the retry starts at once
    expect(times[1]! - times[0]!).toBeLessThan(200);
  });

  it("waits at least the Retry-After of the server", async () => {
    const { transport, times } = scripted([(id) => error(id, "UNAVAILABLE", true, { "retry-after": 120 }), ok]);
    const client = new Client(transport).use(createRetryMiddleware({ retryDelay: ms(0), budget: false }));
    await client.call(method, {});
    expect(times[1]! - times[0]!).toBeGreaterThanOrEqual(110);
  });

  it("stops retrying when the budget is empty", async () => {
    const { transport, times } = scripted([(id) => error(id, "UNAVAILABLE")]);
    const client = new Client({ transport, throwOnError: false }).use(
      createRetryMiddleware({ retryDelay: ms(0), maxRetries: 3, budget: { ratio: 0.01, minPerSecond: 2 } }),
    );
    // The budget starts with 1 retry (100 × 0.01), and 2 more are allowed each second
    for (let call = 0; call < 5; call++) await client.call(method, {});
    expect(times.length).toBe(5 + 3);
  });
});

describe("the circuit breaker counts only the failures of availability (R12)", () => {
  it("is a failure for UNAVAILABLE, TIMEOUT and network errors, and not for ABORTED or a validation error", () => {
    const withCode = (code: string) => Object.assign(new Error(code), { code });
    expect(isAvailabilityFailure(withCode("UNAVAILABLE"))).toBe(true);
    expect(isAvailabilityFailure(withCode("TIMEOUT"))).toBe(true);
    expect(isAvailabilityFailure(Object.assign(new Error("reset"), { code: "ECONNRESET" }))).toBe(true);
    expect(isAvailabilityFailure(withCode("ABORTED"))).toBe(false);
    expect(isAvailabilityFailure(withCode("VALIDATION_ERROR"))).toBe(false);
    expect(isAvailabilityFailure(withCode("FORBIDDEN"))).toBe(false);
  });

  it("stays closed when callers abort or send invalid input", async () => {
    const { transport } = scripted([(id) => error(id, "ABORTED", false), (id) => error(id, "VALIDATION_ERROR", false)]);
    const client = new Client({ transport, throwOnError: false }).use(createCircuitBreakerMiddleware({ failureThreshold: 2 }));
    for (let call = 0; call < 6; call++) await client.call(method, {});
    await expect(client.call(method, {})).resolves.toBeNull();
  });

  it("opens after UNAVAILABLE errors", async () => {
    const { transport } = scripted([(id) => error(id, "UNAVAILABLE", false)]);
    const client = new Client({ transport, throwOnError: false }).use(createCircuitBreakerMiddleware({ failureThreshold: 2 }));
    await client.call(method, {});
    await client.call(method, {});
    await expect(client.call(method, {})).rejects.toBeInstanceOf(CircuitBreakerError);
  });
});

describe("Retry-After over HTTP (R12)", () => {
  it("the server sends the wait of an error, and the client reads it", async () => {
    const registry = createRegistry({
      name: "busy",
      procedures: [
        createProcedure()
          .path(["test", "op"])
          .input(z.object({}))
          .output(z.string())
          .meta({ effects: { reads: [], writes: [] } })
          .handler(async () => {
            throw Object.assign(new Error("busy"), { retryable: true, retryAfterMs: 1500 });
          })
          .build(),
      ],
    });
    const server = new ProcedureServer({ registry });
    server.registerFromRegistry();
    const app = express();
    const http = createServer(app);
    server.addTransport(new HttpServerTransport(server, { app, httpServer: http }));
    await server.start();
    await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", () => resolve()));
    try {
      const port = (http.address() as AddressInfo).port;
      const raw = await fetch(`http://127.0.0.1:${port}/api/test/op`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      expect(raw.headers.get("retry-after")).toBe("2");
      const transport = new HttpTransport({ baseUrl: `http://127.0.0.1:${port}/api` });
      const items: ResponseItem<unknown>[] = [];
      for await (const item of transport.send({ id: "1", method, payload: {}, metadata: {} })) items.push(item);
      expect(retryAfterOf(items[0]!)).toBe(1500);
    } finally {
      await server.stop();
      http.closeAllConnections();
      await new Promise<void>((resolve) => http.close(() => resolve()));
    }
  });
});
