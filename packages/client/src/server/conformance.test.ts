/**
 * A conformance suite of the server faces (roadmap R18). The same calls go through each face:
 * `LocalTransport`, `Server.handle`, HTTP and WebSocket. Each face must give the same value, the
 * same stream, the same error codes, the abort, the deadline and the token rule. The MCP face has
 * its part in `client-mcp` (`conformance.test.ts`).
 */

import { describe, it, expect, afterEach } from "vitest";
import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { z } from "zod";
import { Client } from "../client/client.js";
import { HttpTransport } from "../adapters/http/client/index.js";
import { HttpServerTransport } from "../adapters/http/server/index.js";
import { WebSocketTransport } from "../adapters/websocket/client/transport.js";
import { WebSocketServerTransport } from "../adapters/websocket/server/transport.js";
import { LocalTransport } from "../adapters/local/client/transport.js";
import { createOverallTimeoutMiddleware } from "../client/middleware/timeout.js";
import { seconds } from "../duration.js";
import { createProcedure } from "../procedures/define.js";
import { createRegistry } from "../procedures/module.js";
import type { ProcedureRegistry } from "../procedures/registry.js";
import { ProcedureServer } from "./procedure-server.js";
import { pathToMethod } from "./method.js";

const TOKEN = "conformance-token-0123456789";

/** What the handlers saw, for the checks of the context. */
interface Seen {
  deadlineLeft: number[];
  aborted: number;
  headers: Array<Record<string, unknown> | undefined>;
}

function registryOf(seen: Seen): ProcedureRegistry {
  const read = { reads: [], writes: [] };
  return createRegistry({
    name: "conformance",
    procedures: [
      createProcedure()
        .path(["conf", "echo"])
        .input(z.object({ text: z.string() }))
        .output(z.object({ text: z.string() }))
        .meta({ effects: read })
        .handler(async (input, ctx) => {
          const deadline = ctx.capability?.deadline;
          if (deadline !== undefined) seen.deadlineLeft.push(deadline - Date.now());
          seen.headers.push(ctx.metadata?.["headers"] as Record<string, unknown> | undefined);
          return { text: input.text };
        })
        .build(),
      createProcedure()
        .path(["conf", "count"])
        .input(z.object({ to: z.number() }))
        .output(z.number())
        .meta({ effects: read })
        .handler(async function* (input: { to: number }) {
          for (let n = 1; n <= input.to; n++) yield n;
        } as never)
        .build(),
      createProcedure()
        .path(["conf", "wait"])
        .input(z.object({}))
        .output(z.string())
        .meta({ effects: read })
        .handler(async (_input, ctx) => {
          await new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, 5000);
            ctx.signal?.addEventListener(
              "abort",
              () => {
                clearTimeout(timer);
                seen.aborted++;
                resolve();
              },
              { once: true },
            );
          });
          return "ended";
        })
        .build(),
      // A handler error, with the code of the input or without a code (WIRE-PROTOCOL.md: the
      // server keeps the code of a handler error)
      createProcedure()
        .path(["conf", "fail"])
        .input(z.object({ code: z.string().optional(), retryable: z.boolean().optional() }))
        .output(z.string())
        .meta({ effects: read })
        .handler(async (input: { code?: string | undefined; retryable?: boolean | undefined }) => {
          throw Object.assign(
            new Error("it failed"),
            input.code === undefined ? {} : { code: input.code },
            input.retryable === undefined ? {} : { retryable: input.retryable },
          );
        })
        .build(),
      createProcedure()
        .path(["conf", "failStream"])
        .input(z.object({ code: z.string().optional() }))
        .output(z.number())
        .meta({ effects: read })
        .handler(async function* (input: { code?: string | undefined }) {
          yield 1;
          throw Object.assign(new Error("it failed"), input.code === undefined ? {} : { code: input.code });
        } as never)
        .build(),
    ],
  });
}

let cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup().catch(() => {});
  cleanups = [];
});

async function listen(http: HttpServer): Promise<number> {
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", () => resolve()));
  return (http.address() as AddressInfo).port;
}

interface Face {
  name: string;
  /** A client of the face. With `token`, the server requires it, and the client sends it. */
  client(seen: Seen, options?: { token?: string; send?: string }): Promise<Client>;
}

const faces: Face[] = [
  {
    name: "LocalTransport",
    async client(seen) {
      return new Client({ transport: new LocalTransport({ registry: registryOf(seen) }), throwOnError: true });
    },
  },
  {
    name: "HTTP",
    async client(seen, options = {}) {
      const server = new ProcedureServer({ registry: registryOf(seen), autoRegister: true, ...(options.token ? { token: options.token } : {}) });
      const app = express();
      const http = createServer(app);
      server.addTransport(new HttpServerTransport(server, { app, httpServer: http }));
      await server.start();
      const port = await listen(http);
      cleanups.push(async () => {
        await server.stop();
        http.closeAllConnections();
        await new Promise<void>((resolve) => http.close(() => resolve()));
      });
      const headers: Record<string, string> = options.send ? { Authorization: `Bearer ${options.send}` } : {};
      return new Client({ transport: new HttpTransport({ baseUrl: `http://127.0.0.1:${port}/api`, defaultHeaders: headers }), throwOnError: true });
    },
  },
  {
    name: "WebSocket",
    async client(seen, options = {}) {
      const server = new ProcedureServer({ registry: registryOf(seen), autoRegister: true, ...(options.token ? { token: options.token } : {}) });
      const http = createServer();
      const ws = new WebSocketServerTransport(server, { server: http, path: "/ws" });
      server.addTransport(ws);
      await server.start();
      const port = await listen(http);
      const query = options.send ? `?token=${options.send}` : "";
      const transport = new WebSocketTransport({ url: `ws://127.0.0.1:${port}/ws${query}`, heartbeat: { enabled: false }, reconnect: { enabled: false } });
      cleanups.push(async () => {
        await transport.close();
        await server.stop();
        http.closeAllConnections();
        await new Promise<void>((resolve) => http.close(() => resolve()));
      });
      return new Client({ transport, throwOnError: true });
    },
  },
];

const fresh = (): Seen => ({ deadlineLeft: [], aborted: 0, headers: [] });

describe.each(faces)("the conformance of $name (R18)", (face) => {
  it("gives a value", async () => {
    const client = await face.client(fresh());
    expect(await client.call(pathToMethod(["conf", "echo"]), { text: "hi" })).toEqual({ text: "hi" });
  });

  it("gives the items of a stream in order", async () => {
    const client = await face.client(fresh());
    const items: number[] = [];
    for await (const item of client.stream<unknown, number>(pathToMethod(["conf", "count"]), { to: 3 })) items.push(item);
    expect(items).toEqual([1, 2, 3]);
  });

  it("gives VALIDATION_ERROR for an input that is not valid", async () => {
    const client = await face.client(fresh());
    await expect(client.call(pathToMethod(["conf", "echo"]), { text: 5 })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("gives an error for a procedure that does not exist", async () => {
    const client = await face.client(fresh());
    await expect(client.call(pathToMethod(["conf", "missing"]), {})).rejects.toMatchObject({ code: expect.stringMatching(/NOT_FOUND|HANDLER_NOT_FOUND/) });
  });

  it("gives the deadline of the client to the handler", async () => {
    const seen = fresh();
    const client = (await face.client(seen)).use(createOverallTimeoutMiddleware({ overall: seconds(3) }));
    await client.call(pathToMethod(["conf", "echo"]), { text: "x" });
    expect(seen.deadlineLeft[0]).toBeGreaterThan(2000);
    expect(seen.deadlineLeft[0]).toBeLessThanOrEqual(3000);
  });

  it("aborts the handler when the client aborts", async () => {
    const seen = fresh();
    const client = await face.client(seen);
    const controller = new AbortController();
    const call = client.call(pathToMethod(["conf", "wait"]), {}, { signal: controller.signal });
    setTimeout(() => controller.abort(), 50);
    await expect(call).rejects.toBeDefined();
    const until = Date.now() + 2000;
    while (seen.aborted === 0 && Date.now() < until) await new Promise((resolve) => setTimeout(resolve, 10));
    expect(seen.aborted).toBe(1);
  });

  it("keeps the code of a handler error for a value and for a stream, and gives HANDLER_ERROR without a code", async () => {
    const client = await face.client(fresh());
    await expect(client.call(pathToMethod(["conf", "fail"]), { code: "E_CUSTOM" })).rejects.toMatchObject({ code: "E_CUSTOM", message: "it failed" });
    await expect(client.call(pathToMethod(["conf", "fail"]), {})).rejects.toMatchObject({ code: "HANDLER_ERROR", message: "it failed" });
    const read = async (code?: string): Promise<number[]> => {
      const items: number[] = [];
      for await (const item of client.stream<unknown, number>(pathToMethod(["conf", "failStream"]), code === undefined ? {} : { code })) items.push(item);
      return items;
    };
    await expect(read("E_CUSTOM")).rejects.toMatchObject({ code: "E_CUSTOM", message: "it failed" });
    await expect(read()).rejects.toMatchObject({ code: "HANDLER_ERROR" });
  });
});

describe("the HTTP status of a handler error (WIRE-PROTOCOL.md)", () => {
  it("follows the code: the status of ERROR_CODES for a code of the protocol, 500 for another code, and 500 for a 503 that is not retryable", async () => {
    const server = new ProcedureServer({ registry: registryOf(fresh()), autoRegister: true });
    const app = express();
    const http = createServer(app);
    server.addTransport(new HttpServerTransport(server, { app, httpServer: http }));
    await server.start();
    const port = await listen(http);
    cleanups.push(async () => {
      await server.stop();
      http.closeAllConnections();
      await new Promise<void>((resolve) => http.close(() => resolve()));
    });
    const post = async (body: unknown) => {
      const response = await fetch(`http://127.0.0.1:${port}/api/conf/fail`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      return { status: response.status, body: (await response.json()) as Record<string, unknown> };
    };
    expect(await post({ code: "UNAVAILABLE", retryable: true })).toMatchObject({ status: 503, body: { code: "UNAVAILABLE", retryable: true, error: "it failed" } });
    // An error that is not retryable never gets 503: a 503 invites a retry at the HTTP level (CLI-48)
    expect(await post({ code: "UNAVAILABLE" })).toMatchObject({ status: 500, body: { code: "UNAVAILABLE", retryable: false, error: "it failed" } });
    expect(await post({ code: "E_CUSTOM" })).toMatchObject({ status: 500, body: { code: "E_CUSTOM", error: "it failed" } });
    expect(await post({})).toMatchObject({ status: 500, body: { code: "HANDLER_ERROR", error: "it failed" } });
  });
});

describe.each(faces.filter((face) => face.name !== "LocalTransport"))("the token rule of $name (R18)", (face) => {
  it("refuses a request without the token, and accepts one with it", async () => {
    const without = await face.client(fresh(), { token: TOKEN });
    await expect(without.call(pathToMethod(["conf", "echo"]), { text: "x" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    const seen = fresh();
    const withToken = await face.client(seen, { token: TOKEN, send: TOKEN });
    expect(await withToken.call(pathToMethod(["conf", "echo"]), { text: "x" })).toEqual({ text: "x" });
    // The secret does not reach the handler
    expect(JSON.stringify(seen.headers[0] ?? {})).not.toContain(TOKEN);
  });
});

describe("a direct handle() of the server (R18)", () => {
  it("is a request of this process: the token does not apply", async () => {
    const server = new ProcedureServer({ registry: registryOf(fresh()), autoRegister: true, token: TOKEN });
    const response = await server.handle({ id: "1", method: pathToMethod(["conf", "echo"]), payload: { text: "x" }, metadata: {} });
    expect(response.payload).toEqual({ text: "x" });
  });

  it("an authenticate function gives the principal, and refuses a request without one", async () => {
    const server = new ProcedureServer({
      registry: registryOf(fresh()),
      autoRegister: true,
      authenticate: (request) => (request.credentials?.bearer === "alice" ? { id: "alice", via: "test" } : undefined),
    });
    const ok = await server.handle({ id: "1", method: pathToMethod(["conf", "echo"]), payload: { text: "x" }, metadata: {}, credentials: { bearer: "alice" } });
    expect(ok.status.type).toBe("success");
    const refused = await server.handle({ id: "2", method: pathToMethod(["conf", "echo"]), payload: { text: "x" }, metadata: {}, credentials: {} });
    expect(refused.status).toMatchObject({ type: "error", code: "UNAUTHORIZED" });
  });
});
