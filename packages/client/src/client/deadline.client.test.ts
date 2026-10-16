/**
 * One deadline model (roadmap R10). The overall timeout is the deadline of the call: each try
 * sends its remaining time as `procedure-timeout`, and the server stops the handler at that time.
 * The timeout of one try is at most the remaining time. `resilience()` puts the layers in order.
 */

import { describe, it, expect } from "vitest";
import { z } from "zod";
import express from "express";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Client } from "./client.js";
import { createRetryMiddleware } from "./middleware/retry.js";
import { createOverallTimeoutMiddleware, createTimeoutMiddleware, createCombinedTimeoutMiddleware } from "./middleware/timeout.js";
import { resilience } from "./middleware/resilience.js";
import { DEADLINE_METADATA_KEY, TIMEOUT_METADATA_KEY } from "./deadline.js";
import type { Message, ResponseItem, Transport } from "./types.js";
import { createDefaultHeaderConverter } from "../adapters/http/shared/headers.js";
import { createProcedure } from "../procedures/define.js";
import { createRegistry } from "../procedures/module.js";
import { ProcedureServer } from "../server/procedure-server.js";
import { HttpTransport } from "../adapters/http/client/transport.js";
import { HttpServerTransport } from "../adapters/http/server/transport.js";

const method = { service: "test", operation: "op" };
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function ok<T>(id: string, payload: T): ResponseItem<T> {
  return { id, status: { type: "success", code: 200 }, payload, metadata: {} };
}
const busy = (id: string): ResponseItem<unknown> => ({ id, status: { type: "error", code: "UNAVAILABLE", message: "busy", retryable: true }, payload: null, metadata: {} });

/** A transport that records the metadata of each try. */
function recorder(run: (message: Message<unknown>, call: number) => AsyncIterable<ResponseItem<unknown>>) {
  const tries: Array<Record<string, unknown>> = [];
  const transport: Transport = {
    name: "recorder",
    send<TReq, TRes>(message: Message<TReq>): AsyncIterable<ResponseItem<TRes>> {
      tries.push({ ...message.metadata });
      return run(message as Message<unknown>, tries.length) as AsyncIterable<ResponseItem<TRes>>;
    },
    close: async () => {},
  };
  return { transport, tries };
}

describe("the deadline goes with each try (R10)", () => {
  it("the overall timeout sends its remaining time, smaller at each try", async () => {
    const { transport, tries } = recorder(async function* (message, call) {
      await sleep(30);
      yield call < 3 ? busy(message.id) : ok(message.id, "done");
    });
    const client = new Client(transport)
      .use(createOverallTimeoutMiddleware({ overall: 1000 }))
      .use(createRetryMiddleware({ retryDelay: 1, jitter: 0 }));
    expect(await client.call(method, {})).toBe("done");
    const sent = tries.map((t) => t[TIMEOUT_METADATA_KEY] as number);
    expect(sent).toHaveLength(3);
    expect(sent[0]).toBeLessThanOrEqual(1000);
    expect(sent[0]).toBeGreaterThan(900);
    expect(sent[1]).toBeLessThan(sent[0]!);
    expect(sent[2]).toBeLessThan(sent[1]!);
  });

  it("the remaining time that the caller gives is sent again, smaller, at each try", async () => {
    const { transport, tries } = recorder(async function* (message, call) {
      await sleep(30);
      yield call < 2 ? busy(message.id) : ok(message.id, "done");
    });
    const client = new Client(transport).use(createRetryMiddleware({ retryDelay: 1, jitter: 0 }));
    await client.call(method, {}, { context: { [TIMEOUT_METADATA_KEY]: 500 } });
    const sent = tries.map((t) => t[TIMEOUT_METADATA_KEY] as number);
    expect(sent[0]).toBeLessThanOrEqual(500);
    expect(sent[1]).toBeLessThan(sent[0]!);
  });

  it("the timeout of one try does not narrow the deadline of the server", async () => {
    const { transport, tries } = recorder(async function* (message) {
      yield ok(message.id, "done");
    });
    const client = new Client(transport)
      .use(createOverallTimeoutMiddleware({ overall: 5000 }))
      .use(createTimeoutMiddleware({ perAttempt: 50 }));
    await client.call(method, {});
    expect(tries[0]![TIMEOUT_METADATA_KEY]).toBeGreaterThan(4000);
  });

  it("sends nothing without a deadline", async () => {
    const { transport, tries } = recorder(async function* (message) {
      yield ok(message.id, "done");
    });
    await new Client(transport).call(method, {});
    expect(tries[0]![TIMEOUT_METADATA_KEY]).toBeUndefined();
  });

  it("the HTTP headers carry procedure-timeout, not X-Timeout and not the internal deadline", () => {
    const headers = createDefaultHeaderConverter().metadataToHeaders({
      timeout: { overall: 5000 },
      [TIMEOUT_METADATA_KEY]: 4000,
      [DEADLINE_METADATA_KEY]: Date.now() + 4000,
    });
    expect(headers["X-Timeout"]).toBeUndefined();
    const encoded = decodeURIComponent(String(headers["X-Metadata"]));
    expect(encoded).toContain(TIMEOUT_METADATA_KEY);
    expect(encoded).not.toContain(DEADLINE_METADATA_KEY);
  });
});

describe("the limit of one try is at most the remaining time (R10)", () => {
  it("ends at the overall time, not at the longer limit of one try", async () => {
    const { transport } = recorder(async function* () {
      await new Promise(() => undefined);
    });
    const client = new Client({ transport, throwOnError: true }).use(resilience({ overall: 60, perAttempt: 10_000 }));
    const start = Date.now();
    await expect(client.call(method, {})).rejects.toMatchObject({ code: "TIMEOUT" });
    expect(Date.now() - start).toBeLessThan(1000);
  });
});

describe("resilience() (R10)", () => {
  it("puts the retry between the two timeouts: a try that hangs is followed by another try", async () => {
    const { transport, tries } = recorder(async function* (message, call) {
      if (call === 1) await new Promise(() => undefined);
      yield ok(message.id, "second try");
    });
    const client = new Client(transport).use(
      resilience({ overall: 2000, perAttempt: 40, retry: { retryDelay: 1, jitter: 0, idempotent: true } }),
    );
    expect(await client.call(method, {})).toBe("second try");
    expect(tries).toHaveLength(2);
  });

  it("answers a cached read without a try", async () => {
    const { transport, tries } = recorder(async function* (message) {
      yield ok(message.id, tries.length);
    });
    const client = new Client(transport).use(resilience({ overall: 1000, cache: { methods: ["test.op"] }, retry: { retryDelay: 1 } }));
    await client.call(method, {});
    await client.call(method, {});
    expect(tries).toHaveLength(1);
  });

  it("createCombinedTimeoutMiddleware is the preset of the two timeouts", async () => {
    const { transport } = recorder(async function* () {
      await new Promise(() => undefined);
    });
    const client = new Client({ transport, throwOnError: true }).use(createCombinedTimeoutMiddleware({ overall: 50, perAttempt: 5000 }));
    await expect(client.call(method, {})).rejects.toMatchObject({ code: "TIMEOUT" });
  });
});

describe("the server stops the handler at the deadline of the client (R10, REV-6)", () => {
  it("the handler sees the deadline of the overall timeout", async () => {
    const seen: Array<number | undefined> = [];
    const registry = createRegistry({
      name: "deadline",
      procedures: [
        createProcedure()
          .path(["test", "op"])
          .input(z.object({}))
          .output(z.string())
          .meta({ effects: { reads: [], writes: [] } })
          .handler(async (_input, ctx) => {
            const deadline = ctx.capability?.deadline;
            seen.push(deadline === undefined ? undefined : deadline - Date.now());
            return "done";
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
      const transport = new HttpTransport({ baseUrl: `http://127.0.0.1:${(http.address() as AddressInfo).port}/api` });
      const client = new Client(transport).use(resilience({ overall: 3000 }));
      expect(await client.call(method, {})).toBe("done");
      expect(seen[0]).toBeDefined();
      expect(seen[0]!).toBeGreaterThan(2000);
      expect(seen[0]!).toBeLessThanOrEqual(3000);
    } finally {
      await server.stop();
      http.closeAllConnections();
      await new Promise<void>((resolve) => http.close(() => resolve()));
    }
  });
});
