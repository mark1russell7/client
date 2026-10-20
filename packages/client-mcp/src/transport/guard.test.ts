/**
 * The checks of a request to the Streamable HTTP face (CLI-35): the browser checks and the token
 * in one function, the body limit, the initialize rule, the session limit (256 by default since
 * CLI-51), and the cancel of the tasks of a session that closes.
 */

import { describe, it, expect, afterEach } from "vitest";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { z } from "zod";
import { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Server as SdkServer } from "@modelcontextprotocol/sdk/server/index.js";
import type { Transport as SdkTransport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { CallToolResultSchema, CreateTaskResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { createProcedure, defineModule, type AnyProcedure } from "@procedures/client";
import { createMcpHost } from "../host.js";
import { MCP_HTTP_LIMITS, assertLoopbackBind, guardMcpRequest } from "./guard.js";
import { createHttpTransport } from "./http.js";

let cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup().catch(() => {});
  cleanups = [];
});

/**
 * This function serves a handler on a listener of the test, on a free port of loopback, and gives
 * the URL of the endpoint. The endpoint has no listener of its own (CLI-11).
 */
async function listenFor(handle: (req: IncomingMessage, res: ServerResponse) => boolean): Promise<string> {
  const listener = createServer((req, res) => {
    if (handle(req, res)) return;
    res.statusCode = 404;
    res.end();
  });
  await new Promise<void>((resolve) => listener.listen(0, "127.0.0.1", resolve));
  cleanups.push(
    () =>
      new Promise<void>((resolve) => {
        listener.close(() => resolve());
        listener.closeAllConnections();
      }),
  );
  return `http://127.0.0.1:${(listener.address() as AddressInfo).port}/mcp`;
}

/** A request on a loopback socket with these headers. */
function request(headers: Record<string, string>, method = "POST") {
  return { method, headers, socket: { localAddress: "127.0.0.1" } } as never;
}

const INITIALIZE = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "0" } },
};

const POST_HEADERS = { "content-type": "application/json", accept: "application/json, text/event-stream" };

async function until(check: () => boolean): Promise<void> {
  for (let tries = 0; tries < 300 && !check(); tries++) await new Promise((resolve) => setTimeout(resolve, 10));
  expect(check()).toBe(true);
}

describe("guardMcpRequest", () => {
  it("passes a local request with the token", () => {
    expect(guardMcpRequest(request({ host: "127.0.0.1:3003", authorization: "Bearer secret-token-0123" }), { token: "secret-token-0123" })).toEqual({ ok: true });
    expect(guardMcpRequest(request({ host: "localhost:3003" }))).toEqual({ ok: true });
  });

  it("reads the bearer scheme in any case, with one or more spaces (RFC 7235, CLI-60)", () => {
    for (const authorization of ["bearer secret-token-0123", "BEARER secret-token-0123", "bearer   secret-token-0123", "BEARER secret-token-0123 "]) {
      expect(guardMcpRequest(request({ host: "127.0.0.1:3003", authorization }), { token: "secret-token-0123" }), authorization).toEqual({ ok: true });
    }
  });

  it("refuses a request without the token or with a wrong one, and names the scheme", () => {
    for (const authorization of [
      undefined,
      "",
      "Bearer",
      "Bearer ",
      "Bearer wrong",
      "Bearer secret-token-01234",
      "Bearer secret-token-0123 x",
      "Bearer\tsecret-token-0123",
      "Basic secret-token-0123",
    ]) {
      const result = guardMcpRequest(request({ host: "127.0.0.1", ...(authorization !== undefined ? { authorization } : {}) }), { token: "secret-token-0123" });
      expect(result).toMatchObject({ ok: false, status: 401, code: "UNAUTHORIZED", headers: { "www-authenticate": 'Bearer realm="mcp"' } });
    }
  });

  it("refuses DNS rebinding and a web page of another origin before it reads the token", () => {
    expect(guardMcpRequest(request({ host: "attacker.example" }), { token: "t" })).toMatchObject({ ok: false, status: 403, code: "FORBIDDEN_HOST" });
    expect(guardMcpRequest(request({ host: "box.local" }), { allowedHosts: ["box.local"] })).toEqual({ ok: true });
    expect(guardMcpRequest(request({ host: "127.0.0.1", origin: "https://evil.example" }))).toMatchObject({ ok: false, status: 403, code: "FORBIDDEN_ORIGIN" });
    expect(guardMcpRequest(request({ host: "127.0.0.1", origin: "https://app.example" }), { allowedOrigins: ["https://app.example"] })).toEqual({ ok: true });
    // A request with a cookie needs a named origin: "*" does not permit it (CSRF)
    expect(guardMcpRequest(request({ host: "127.0.0.1", origin: "https://app.example", cookie: "s=1" }), { allowedOrigins: "*", ambient: true })).toMatchObject({ ok: false, status: 403 });
  });

  it("refuses a listener that is not loopback, unless it is allowed", () => {
    expect(() => assertLoopbackBind("127.0.0.1")).not.toThrow();
    expect(() => assertLoopbackBind("localhost")).not.toThrow();
    expect(() => assertLoopbackBind("0.0.0.0")).toThrow(/not a loopback address/);
    expect(() => assertLoopbackBind("0.0.0.0", true)).not.toThrow();
  });
});

describe("the sessions of the Streamable HTTP endpoint", () => {
  /** An endpoint on its own port with an SDK server for each session. */
  async function endpoint(options: { maxSessions?: number; maxBodyBytes?: number; token?: string } = {}, busy?: () => ReadonlySet<string>) {
    const servers: SdkServer[] = [];
    const http = createHttpTransport(
      { ...options },
      async (transport) => {
        const server = new SdkServer({ name: "guard", version: "0" }, { capabilities: {} });
        servers.push(server);
        await server.connect(transport as unknown as SdkTransport);
      },
      busy ? { busySessions: busy } : {}
    );
    cleanups.push(() => http.close());
    const url = await listenFor((req, res) => http.handle(req, res));
    return { http, url, servers };
  }

  /** This function starts a session with a bare initialize request. */
  async function initialize(url: string, headers: Record<string, string> = POST_HEADERS): Promise<Response> {
    const response = await fetch(url, { method: "POST", headers, body: JSON.stringify(INITIALIZE) });
    await response.text();
    return response;
  }

  it("starts a session only for initialize, so a stray POST makes no server", async () => {
    const { http, url, servers } = await endpoint();
    const stray = await fetch(url, { method: "POST", headers: POST_HEADERS, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });
    expect(stray.status).toBe(400);
    const bad = await fetch(url, { method: "POST", headers: POST_HEADERS, body: "{" });
    expect(bad.status).toBe(400);
    expect(servers).toHaveLength(0);
    expect((await initialize(url)).status).toBe(200);
    expect(servers).toHaveLength(1);
    expect(http.sessions).toBe(1);
  });

  it("closes the server of an initialize that the SDK refuses", async () => {
    const { http, url, servers } = await endpoint();
    // Without text/event-stream in Accept, the SDK answers 406 and makes no session
    const refused = await initialize(url, { "content-type": "application/json", accept: "application/json" });
    expect(refused.status).toBe(406);
    expect(http.sessions).toBe(0);
    expect(servers).toHaveLength(1);
    await until(() => servers[0]!.transport === undefined);
  });

  it("refuses a body above the limit, at the start of a session and in a session", async () => {
    const { url, servers } = await endpoint({ maxBodyBytes: 400 });
    const big = await fetch(url, { method: "POST", headers: POST_HEADERS, body: JSON.stringify({ ...INITIALIZE, pad: "x".repeat(500) }) });
    expect(big.status).toBe(413);
    expect(servers).toHaveLength(0);
    const id = (await initialize(url)).headers.get("mcp-session-id")!;
    const later = await fetch(url, {
      method: "POST",
      headers: { ...POST_HEADERS, "mcp-session-id": id, "mcp-protocol-version": "2025-06-18" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "ping", params: { pad: "x".repeat(500) } }),
    });
    expect(later.status).toBe(413);
  });

  it("answers 401 with the scheme for a request without the token", async () => {
    const { url } = await endpoint({ token: "secret-token-0123" });
    const refused = await fetch(url, { method: "POST", headers: POST_HEADERS, body: JSON.stringify(INITIALIZE) });
    expect(refused.status).toBe(401);
    expect(refused.headers.get("www-authenticate")).toBe('Bearer realm="mcp"');
    // The scheme is case-insensitive (CLI-60)
    expect((await initialize(url, { ...POST_HEADERS, authorization: "bearer secret-token-0123" })).status).toBe(200);
  });

  /** This function starts `count` sessions, 32 at a time, and gives the status of each answer. */
  async function initializeMany(url: string, count: number): Promise<number[]> {
    const statuses: number[] = [];
    for (let start = 0; start < count; start += 32) {
      const batch = Array.from({ length: Math.min(32, count - start) }, async () => (await initialize(url)).status);
      statuses.push(...(await Promise.all(batch)));
    }
    return statuses;
  }

  /** Each session is busy, as the GET stream of a live client of the SDK makes it: the limit closes no session. */
  const everyone = { has: () => true } as unknown as ReadonlySet<string>;

  it("keeps at most 256 sessions by default: the session past the limit gets 503 with Retry-After (CLI-51)", async () => {
    expect(MCP_HTTP_LIMITS.maxSessions).toBe(256);
    const { http, url } = await endpoint({}, () => everyone);
    const statuses = await initializeMany(url, MCP_HTTP_LIMITS.maxSessions);
    expect(statuses.every((status) => status === 200)).toBe(true);
    expect(http.sessions).toBe(MCP_HTTP_LIMITS.maxSessions);
    const full = await fetch(url, { method: "POST", headers: POST_HEADERS, body: JSON.stringify(INITIALIZE) });
    expect(full.status).toBe(503);
    expect(full.headers.get("retry-after")).toBe(String(MCP_HTTP_LIMITS.retryAfterSeconds));
    expect(await full.json()).toMatchObject({ error: { data: { code: "SESSIONS_FULL" } } });
    expect(http.sessions).toBe(MCP_HTTP_LIMITS.maxSessions);
  }, 60_000);

  it("has no session limit with maxSessions: Infinity", async () => {
    const { http, url } = await endpoint({ maxSessions: Number.POSITIVE_INFINITY }, () => everyone);
    const statuses = await initializeMany(url, MCP_HTTP_LIMITS.maxSessions + 1);
    expect(statuses.every((status) => status === 200)).toBe(true);
    expect(http.sessions).toBe(MCP_HTTP_LIMITS.maxSessions + 1);
  }, 60_000);

  it("takes a limit of 1 or more, or Infinity", () => {
    expect(() => createHttpTransport({ maxSessions: Number.POSITIVE_INFINITY }, async () => undefined)).not.toThrow();
    expect(() => createHttpTransport({ maxSessions: 0 }, async () => undefined)).toThrow(RangeError);
    expect(() => createHttpTransport({ maxSessions: 2.5 }, async () => undefined)).toThrow(RangeError);
    expect(() => createHttpTransport({ maxSessions: Number.NaN }, async () => undefined)).toThrow(RangeError);
    expect(() => createHttpTransport({ maxBodyBytes: 0.5 }, async () => undefined)).toThrow(RangeError);
  });

  it("with maxSessions, closes the session that was idle longest, and keeps a busy session", async () => {
    let busy = new Set<string>();
    const { http, url } = await endpoint({ maxSessions: 1 }, () => busy);
    const first = (await initialize(url)).headers.get("mcp-session-id")!;
    const second = (await initialize(url)).headers.get("mcp-session-id")!;
    expect(http.sessions).toBe(1);
    // The second session closed the first one: its next request finds no session
    const gone = await fetch(url, { method: "POST", headers: { ...POST_HEADERS, "mcp-session-id": first }, body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "ping" }) });
    expect(gone.status).toBe(404);
    // Each session has a task in progress: a new session waits, and the answer says when to try again
    busy = new Set([second]);
    const full = await initialize(url);
    expect(full.status).toBe(503);
    expect(full.headers.get("retry-after")).toBe("5");
    expect(http.sessions).toBe(1);
  });

  it("keeps a session with an open GET stream: a client that only listens is not idle", async () => {
    const { http, url } = await endpoint({ maxSessions: 1 });
    const id = (await initialize(url)).headers.get("mcp-session-id")!;
    const listening = new AbortController();
    const stream = await fetch(url, { headers: { accept: "text/event-stream", "mcp-session-id": id }, signal: listening.signal });
    expect(stream.status).toBe(200);
    expect((await initialize(url)).status).toBe(503);
    // The stream closes: the session is idle, so a new session closes it
    listening.abort();
    await stream.body?.cancel().catch(() => undefined);
    let next = 503;
    for (let tries = 0; tries < 100 && next === 503; tries++) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      next = (await initialize(url)).status;
    }
    expect(next).toBe(200);
    expect(http.sessions).toBe(1);
  });

  it("does not pass the limit when sessions start at the same time", async () => {
    // Every session is busy, so no session closes: of five at the same time, two start and three get 503
    const everyone = { has: () => true } as unknown as ReadonlySet<string>;
    const { http, url } = await endpoint({ maxSessions: 2 }, () => everyone);
    const statuses = await Promise.all(Array.from({ length: 5 }, async () => (await initialize(url)).status));
    expect(statuses.filter((status) => status === 200)).toHaveLength(2);
    expect(statuses.filter((status) => status === 503)).toHaveLength(3);
    expect(http.sessions).toBe(2);
  });

  it("passes the allowed hosts of the policy to the face of a host", async () => {
    const host = createMcpHost({ modules: [], faces: { http: {} }, policy: { browser: { allowedHosts: ["box.local"] } } });
    await host.start();
    cleanups.push(() => host.stop());
    const url = new URL(await listenFor((req, res) => host.handleHttp(req, res)));
    const response = await fetch(url, { method: "POST", headers: { ...POST_HEADERS, host: `box.local:${url.port}` }, body: JSON.stringify(INITIALIZE) });
    expect(response.status).toBe(200);
    await response.text();
  });
});

describe("the tasks of sessions over Streamable HTTP", () => {
  function waitModule(state: { started: number; aborted: number }) {
    const wait = createProcedure()
      .path(["crawl", "wait"])
      .input(z.object({}).passthrough())
      .output(z.object({ aborted: z.boolean() }))
      .meta({ description: "wait", effects: { reads: [], writes: [] }, taskSupport: "optional" })
      .handler((async (_input: unknown, ctx: { signal?: AbortSignal }) => {
        state.started++;
        await new Promise<void>((resolve) => ctx.signal?.addEventListener("abort", () => resolve(), { once: true }));
        state.aborted++;
        return { aborted: true };
      }) as never)
      .build() as AnyProcedure;
    return defineModule("http-task", [wait]);
  }

  async function host(maxRunning?: number) {
    const state = { started: 0, aborted: 0 };
    const mcpHost = createMcpHost({ modules: [waitModule(state)], faces: { http: {} }, tasks: maxRunning ? { maxRunning } : {} });
    await mcpHost.start();
    cleanups.push(() => mcpHost.stop());
    return { host: mcpHost, state, url: new URL(await listenFor((req, res) => mcpHost.handleHttp(req, res))) };
  }

  async function connect(url: URL) {
    const client = new McpClient({ name: "test", version: "0" });
    const transport = new StreamableHTTPClientTransport(url);
    await client.connect(transport as never);
    cleanups.push(() => client.close());
    return { client, transport };
  }

  const startTask = (client: McpClient) =>
    client.request({ method: "tools/call", params: { name: "crawl.wait", arguments: {}, task: {} } }, CreateTaskResultSchema).then((created) => created.task);

  it("cancels the tasks of a session that closes", async () => {
    const { host: mcpHost, state, url } = await host();
    const { client, transport } = await connect(url);
    await startTask(client);
    await until(() => state.started === 1);
    expect(mcpHost.tasks?.running()).toHaveLength(1);
    await transport.terminateSession();
    await until(() => state.aborted === 1);
    await until(() => mcpHost.tasks?.running().length === 0);
  });

  it("applies the task limit across sessions", async () => {
    const { host: mcpHost, state, url } = await host(1);
    const one = await connect(url);
    const two = await connect(url);
    expect(mcpHost.state().faces[0]?.sessions).toBe(2);
    expect((await startTask(one.client)).status).toBe("working");
    const refused = await startTask(two.client);
    expect(refused.status).toBe("failed");
    const reason = await two.client.experimental.tasks.getTaskResult(refused.taskId, CallToolResultSchema);
    expect(JSON.stringify(reason.content)).toMatch(/its limit/);
    // A session sees only its own tasks
    await expect(one.client.experimental.tasks.getTask(refused.taskId)).rejects.toThrow();
    await until(() => state.started === 1);
    expect(mcpHost.tasks?.running()).toHaveLength(1);
  });
});
