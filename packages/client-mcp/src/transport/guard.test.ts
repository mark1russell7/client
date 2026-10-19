/**
 * The checks of a request to the Streamable HTTP face (CLI-35): the browser checks and the token
 * in one function, the body limit, the initialize rule, the session limit, and the cancel of the
 * tasks of a session that closes.
 */

import { describe, it, expect, afterEach } from "vitest";
import { createServer } from "node:net";
import { Readable } from "node:stream";
import { z } from "zod";
import { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Server as SdkServer } from "@modelcontextprotocol/sdk/server/index.js";
import type { Transport as SdkTransport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { CreateTaskResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { createProcedure, defineModule, type AnyProcedure } from "@procedures/client";
import { createMcpHost } from "../host.js";
import { MCP_HTTP_LIMITS, McpBodyError, assertLoopbackBind, guardMcpRequest, readMcpBody, sameToken } from "./guard.js";
import { createHttpTransport } from "./http.js";

async function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(typeof address === "object" && address ? address.port : 0));
    });
  });
}

let cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup().catch(() => {});
  cleanups = [];
});

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

describe("guardMcpRequest", () => {
  it("passes a local request with the token", () => {
    expect(guardMcpRequest(request({ host: "127.0.0.1:3003", authorization: "Bearer secret-token-0123" }), { token: "secret-token-0123" })).toEqual({ ok: true });
    expect(guardMcpRequest(request({ host: "localhost:3003" }))).toEqual({ ok: true });
  });

  it("refuses a request without the token or with a wrong one, and names the scheme", () => {
    for (const authorization of [undefined, "Bearer wrong", "Bearer secret-token-01234", "Basic secret-token-0123"]) {
      const result = guardMcpRequest(request({ host: "127.0.0.1", ...(authorization ? { authorization } : {}) }), { token: "secret-token-0123" });
      expect(result).toMatchObject({ ok: false, status: 401, code: "UNAUTHORIZED", headers: { "www-authenticate": 'Bearer realm="mcp"' } });
    }
  });

  it("refuses DNS rebinding and a web page of another origin before it reads the token", () => {
    expect(guardMcpRequest(request({ host: "attacker.example" }), { token: "t" })).toMatchObject({ ok: false, status: 403, code: "FORBIDDEN_HOST" });
    expect(guardMcpRequest(request({ host: "127.0.0.1", origin: "https://evil.example" }))).toMatchObject({ ok: false, status: 403, code: "FORBIDDEN_ORIGIN" });
    expect(guardMcpRequest(request({ host: "127.0.0.1", origin: "https://app.example" }), { allowedOrigins: ["https://app.example"] })).toEqual({ ok: true });
    // A request with a cookie needs a named origin: "*" does not permit it (CSRF)
    expect(guardMcpRequest(request({ host: "127.0.0.1", origin: "https://app.example", cookie: "s=1" }), { allowedOrigins: "*", ambient: true })).toMatchObject({ ok: false, status: 403 });
  });
});

describe("the other guards", () => {
  it("compares tokens of any length", () => {
    expect(sameToken("secret-token-0123", "secret-token-0123")).toBe(true);
    expect(sameToken("secret", "secret-token-0123")).toBe(false);
    expect(sameToken(undefined, "secret-token-0123")).toBe(false);
  });

  it("reads a JSON body to its limit", async () => {
    await expect(readMcpBody(Readable.from([Buffer.from('{"a":'), Buffer.from("1}")]))).resolves.toEqual({ a: 1 });
    await expect(readMcpBody(Readable.from([Buffer.alloc(11)]), 10)).rejects.toMatchObject({ status: 413 });
    await expect(readMcpBody(Readable.from([Buffer.from("not json")]))).rejects.toBeInstanceOf(McpBodyError);
  });

  it("refuses a listener that is not loopback, unless it is allowed", () => {
    expect(() => assertLoopbackBind("127.0.0.1")).not.toThrow();
    expect(() => assertLoopbackBind("localhost")).not.toThrow();
    expect(() => assertLoopbackBind("0.0.0.0")).toThrow(/not a loopback address/);
    expect(() => assertLoopbackBind("0.0.0.0", true)).not.toThrow();
  });
});

describe("the sessions of the Streamable HTTP endpoint", () => {
  /** An endpoint on its own port with an SDK server for each session, and a limit of sessions. */
  async function endpoint(limits: Parameters<typeof createHttpTransport>[2] = {}, token?: string) {
    const port = await freePort();
    let made = 0;
    const http = createHttpTransport(
      { port, ...(token ? { token } : {}) },
      async (transport) => {
        made++;
        const server = new SdkServer({ name: "guard", version: "0" }, { capabilities: {} });
        await server.connect(transport as unknown as SdkTransport);
      },
      limits
    );
    const url = await http.listen();
    cleanups.push(() => http.close());
    return { http, url, made: () => made };
  }

  async function connect(url: string, headers: Record<string, string> = {}) {
    const client = new McpClient({ name: "test", version: "0" });
    const transport = new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers } });
    await client.connect(transport as never);
    cleanups.push(() => client.close());
    return { client, transport };
  }

  it("starts a session only for initialize, so a stray POST makes no server", async () => {
    const { http, url, made } = await endpoint();
    const stray = await fetch(url, { method: "POST", headers: POST_HEADERS, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });
    expect(stray.status).toBe(400);
    expect(made()).toBe(0);
    const bad = await fetch(url, { method: "POST", headers: POST_HEADERS, body: "{" });
    expect(bad.status).toBe(400);
    const ok = await fetch(url, { method: "POST", headers: POST_HEADERS, body: JSON.stringify(INITIALIZE) });
    expect(ok.status).toBe(200);
    expect(made()).toBe(1);
    expect(http.sessions).toBe(1);
  });

  it("refuses a body above the limit", async () => {
    const { url, made } = await endpoint({ maxBodyBytes: 100 });
    const big = await fetch(url, { method: "POST", headers: POST_HEADERS, body: JSON.stringify({ ...INITIALIZE, pad: "x".repeat(200) }) });
    expect(big.status).toBe(413);
    expect(made()).toBe(0);
    expect(MCP_HTTP_LIMITS.maxBodyBytes).toBe(4_194_304);
  });

  it("answers 401 with the scheme for a request without the token", async () => {
    const { url } = await endpoint({}, "secret-token-0123");
    const refused = await fetch(url, { method: "POST", headers: POST_HEADERS, body: JSON.stringify(INITIALIZE) });
    expect(refused.status).toBe(401);
    expect(refused.headers.get("www-authenticate")).toBe('Bearer realm="mcp"');
  });

  it("closes the session that was idle longest at the limit, and keeps a busy session", async () => {
    let busy = new Set<string>();
    const { http, url } = await endpoint({ maxSessions: 1, busySessions: () => busy });
    const first = await connect(url);
    const second = await connect(url);
    // The second session closed the first one: its next request finds no session
    expect(http.sessions).toBe(1);
    await expect(first.client.ping()).rejects.toThrow();
    // Each session has a task in progress: a new session waits
    busy = new Set([second.transport.sessionId ?? ""]);
    const refused = await fetch(url, { method: "POST", headers: POST_HEADERS, body: JSON.stringify(INITIALIZE) });
    expect(refused.status).toBe(503);
    expect(http.sessions).toBe(1);
  });
});

describe("the tasks of a session over Streamable HTTP", () => {
  it("cancels the tasks of a session that closes", async () => {
    let aborted = false;
    let started = false;
    const wait = createProcedure()
      .path(["crawl", "wait"])
      .input(z.object({}).passthrough())
      .output(z.object({ aborted: z.boolean() }))
      .meta({ description: "wait", effects: { reads: [], writes: [] }, taskSupport: "optional" })
      .handler((async (_input: unknown, ctx: { signal?: AbortSignal }) => {
        started = true;
        await new Promise<void>((resolve) => ctx.signal?.addEventListener("abort", () => resolve(), { once: true }));
        aborted = true;
        return { aborted };
      }) as never)
      .build() as AnyProcedure;
    const host = createMcpHost({ modules: [defineModule("http-task", [wait])], faces: { http: { port: await freePort() } }, tasks: {} });
    await host.start();
    cleanups.push(() => host.stop());
    const client = new McpClient({ name: "test", version: "0" });
    const transport = new StreamableHTTPClientTransport(new URL(host.state().faces[0]!.url!));
    await client.connect(transport as never);
    cleanups.push(() => client.close());
    await client.request({ method: "tools/call", params: { name: "crawl.wait", arguments: {}, task: {} } }, CreateTaskResultSchema);
    for (let tries = 0; tries < 200 && !started; tries++) await new Promise((resolve) => setTimeout(resolve, 10));
    expect(host.tasks?.running()).toHaveLength(1);
    await transport.terminateSession();
    for (let tries = 0; tries < 200 && !aborted; tries++) await new Promise((resolve) => setTimeout(resolve, 10));
    expect(aborted).toBe(true);
    expect(host.tasks?.running()).toEqual([]);
  });
});
