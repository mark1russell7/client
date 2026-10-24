/**
 * One check for each request on the MCP faces (CLI-2b).
 *
 * The standalone face is an MCP host that serves Streamable HTTP on a listener of the service
 * (`httpTransport(...).mount()`), without the procedures host: `mark mcp --http` and
 * `mcp-dev-tools`. Before, the token of that face was checked only by the face itself. Now the
 * token of the face is the token of the server of the host, and the admission of the server
 * checks each HTTP request one time. A tool call uses the admission of its HTTP request.
 *
 * The test counts each run of the checks: the browser checks (the Host header and the origin) and
 * the admission (the request hook, or the authenticate function). A request without a token, or
 * with a foreign Host or Origin, is still refused.
 */

import { describe, it, expect, afterEach } from "vitest";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { z } from "zod";
import { localDev, service } from "@mark1russell7/service";
import { httpTransport } from "@mark1russell7/service/http";
import { fakeProcess } from "@mark1russell7/service/testing";
import {
  ProcedureServer,
  createProcedure,
  createRegistry,
  defineModule,
  hostPolicy,
  procedureServerOptions,
  seconds,
  type AnyProcedure,
  type BrowserGuardOptions,
  type PrincipalOf,
} from "@procedures/client";
import { createMcpHost, type McpHostOptions } from "../host.js";
import { mcpFace } from "../face.js";

const TOKEN = "one-check-token-0123456789";
const APP = "http://app.test";

const whoAmI: AnyProcedure = createProcedure()
  .path(["who", "am"])
  .input(z.object({}).passthrough())
  .output(z.unknown())
  .meta({ description: "who am I", effects: { reads: [], writes: [] } })
  .handler(async (_input, ctx) => ({ principal: ctx.principal ?? null }))
  .build() as AnyProcedure;

const whoModule = defineModule("one-check", [whoAmI]);

let cleanups: Array<() => Promise<unknown> | unknown> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

interface Counts {
  admissions: number;
  origins: number;
  hosts: number;
}

/** The browser checks of the policy, with counts. The core check calls each rule one time for a request. */
function countedBrowser(counts: Counts): BrowserGuardOptions {
  const allowedHosts = new Proxy(["app.test"], {
    get(target, key, receiver) {
      if (key === "includes") counts.hosts++;
      return Reflect.get(target, key, receiver) as unknown;
    },
  });
  return {
    allowedOrigins: (origin: string) => {
      counts.origins++;
      return origin === APP;
    },
    allowedHosts,
  };
}

/**
 * The standalone face: an MCP host with Streamable HTTP on a listener of the service, as
 * `runDevToolsServer()` builds it for `mark mcp --http`. It gives the URL of the endpoint.
 */
async function standalone(options: McpHostOptions): Promise<{ url: string; port: number }> {
  const host = createMcpHost({ modules: [whoModule], ...options });
  const listener = httpTransport(
    createServer(),
    { server_idle_close: seconds(5), server_idle_sweep_interval: seconds(1), server_retry_after: seconds(1) },
    { listen: { port: 0, host: "127.0.0.1" } },
  );
  listener.mount((req, res) => host.handleHttp(req, res));
  const svc = host
    .declare(service("one-check").profile(localDev))
    .readiness({ type: "debounce", interval: seconds(5), failAfter: 3, recoverAfter: 1 })
    .liveness({ type: "window", failAfter: seconds(45) })
    .startup(seconds(30));
  svc.server("one-check.listen", listener.knobs, listener);
  const proc = fakeProcess();
  const life = await svc.run({ process: proc });
  cleanups.push(async () => {
    proc.signal("SIGTERM");
    await life.done;
  });
  const { port } = listener.server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}/mcp`, port };
}

const MCP_HEADERS = { "content-type": "application/json", accept: "application/json, text/event-stream" };
const INITIALIZE = { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "one-check", version: "0" } } };
const INITIALIZED = { jsonrpc: "2.0", method: "notifications/initialized" };
const CALL = { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "who.am", arguments: {} } };

/** A JSON-RPC request to the endpoint: the status, the session and the message of the answer (JSON, or one server-sent event). */
async function post(url: string, body: unknown, headers: Record<string, string>): Promise<{ status: number; session: string | null; wwwAuthenticate: string | null; message: Record<string, unknown> | undefined }> {
  const response = await fetch(url, { method: "POST", headers: { ...MCP_HEADERS, ...headers }, body: JSON.stringify(body) });
  const text = await response.text();
  const data = text.split(/\r?\n/).find((line) => line.startsWith("data: "));
  const json = text.startsWith("{") ? text : data?.slice("data: ".length);
  return {
    status: response.status,
    session: response.headers.get("mcp-session-id"),
    wwwAuthenticate: response.headers.get("www-authenticate"),
    message: json ? (JSON.parse(json) as Record<string, unknown>) : undefined,
  };
}

/** The principal that the tool `who.am` gives in an answer. */
function principalOfTool(message: Record<string, unknown> | undefined): unknown {
  const result = message?.["result"] as { content?: Array<{ text?: string }> } | undefined;
  return (JSON.parse(result?.content?.[0]?.text ?? "null") as { principal?: unknown } | null)?.principal;
}

/** The counts since the last call of the function. */
function delta(counts: Counts): () => Counts {
  let last = { ...counts };
  return () => {
    const now = { admissions: counts.admissions - last.admissions, origins: counts.origins - last.origins, hosts: counts.hosts - last.hosts };
    last = { ...counts };
    return now;
  };
}

describe("one check for each request on the standalone MCP face (CLI-2b)", () => {
  it("gives the token of the face to the server: one browser check and one admission for each HTTP request, and none more for a tool call", async () => {
    const counts: Counts = { admissions: 0, origins: 0, hosts: 0 };
    // As mcp-dev-tools: the token only on the HTTP face. The authenticate function counts the admissions that pass.
    const { url, port } = await standalone({
      policy: { browser: countedBrowser(counts) },
      serverOptions: {
        authenticate: () => {
          counts.admissions++;
          return { id: "agent", via: "token" };
        },
      },
      faces: { http: { token: TOKEN } },
    });
    const since = delta(counts);
    const page = { host: `app.test:${port}`, origin: APP };
    const signed = { ...page, authorization: `Bearer ${TOKEN}` };

    const opened = await post(url, INITIALIZE, signed);
    expect(opened.status).toBe(200);
    expect(since()).toEqual({ admissions: 1, origins: 1, hosts: 1 });
    const session = { ...signed, "mcp-session-id": opened.session! };
    expect((await post(url, INITIALIZED, session)).status).toBe(202);
    expect(since()).toEqual({ admissions: 1, origins: 1, hosts: 1 });
    const called = await post(url, CALL, session);
    expect(principalOfTool(called.message)).toEqual({ id: "agent", via: "token" });
    // The tool call uses the admission of its HTTP request: one admission, not two
    expect(since()).toEqual({ admissions: 1, origins: 1, hosts: 1 });

    // Without the token or with a wrong one: 401 with the scheme, and no admission passes
    for (const headers of [page, { ...page, authorization: "Bearer wrong" }]) {
      const refused = await post(url, INITIALIZE, headers);
      expect(refused).toMatchObject({ status: 401, wwwAuthenticate: 'Bearer realm="mcp"', message: { error: { data: { code: "UNAUTHORIZED" } } } });
    }
    expect(since()).toEqual({ admissions: 0, origins: 2, hosts: 2 });
    // Each request of a session keeps its check: a call and the GET stream without the token
    const { authorization: _authorization, ...withoutToken } = session;
    expect((await post(url, CALL, withoutToken)).status).toBe(401);
    const stream = await fetch(url, { headers: { ...withoutToken, accept: "text/event-stream" } });
    expect(stream.status).toBe(401);
    await stream.body?.cancel();
    expect(since().admissions).toBe(0);
    // A foreign Host or Origin: the browser check refuses the request before the admission
    expect((await post(url, INITIALIZE, { ...signed, host: `attacker.example:${port}` })).status).toBe(403);
    expect(since()).toEqual({ admissions: 0, origins: 0, hosts: 1 });
    expect((await post(url, INITIALIZE, { ...signed, origin: "https://evil.example" })).status).toBe(403);
    expect(since()).toEqual({ admissions: 0, origins: 1, hosts: 1 });
  });

  it("gives a jarvis-style cookie and a Graph-style session their principal, with one run of the request hook for each HTTP request", async () => {
    let runs = 0;
    const sessions = new Map([["session-of-alice", "alice"]]);
    // A cookie with the token (jarvis), or a session cookie (Graph)
    const principalOf: PrincipalOf = ({ cookies = {} }) => {
      runs++;
      const user = sessions.get(cookies["graph.session_token"] ?? "");
      if (user !== undefined) return { bearer: TOKEN, principal: { id: user, via: "session" } };
      const token = cookies["jarvis_token"];
      return token !== undefined ? { bearer: token } : undefined;
    };
    const { url } = await standalone({ policy: { token: TOKEN, principalOf, browser: { allowedOrigins: [APP] } }, faces: { http: {} } });
    for (const [cookie, principal] of [
      [`jarvis_token=${TOKEN}`, { id: "token", via: "token" }],
      ["graph.session_token=session-of-alice", { id: "alice", via: "session" }],
    ] as const) {
      const before = runs;
      const opened = await post(url, INITIALIZE, { cookie, origin: APP });
      expect(opened.status, cookie).toBe(200);
      const session = { cookie, origin: APP, "mcp-session-id": opened.session! };
      await post(url, INITIALIZED, session);
      expect(principalOfTool((await post(url, CALL, session)).message), cookie).toEqual(principal);
      // Three HTTP requests: three runs of the hook, and the tool call adds none
      expect(runs - before, cookie).toBe(3);
    }
    expect((await post(url, INITIALIZE, { cookie: "jarvis_token=wrong", origin: APP })).status).toBe(401);
    expect((await post(url, INITIALIZE, { cookie: "graph.session_token=forged", origin: APP })).status).toBe(401);
    // A cookie needs a named origin (CSRF): a page of another origin is refused before the hook
    const before = runs;
    expect((await post(url, INITIALIZE, { cookie: `jarvis_token=${TOKEN}`, origin: "https://evil.example" })).status).toBe(403);
    expect(runs).toBe(before);
  });

  it("refuses two tokens for one host, and gives the token of the face to the policy", () => {
    expect(() => createMcpHost({ modules: [whoModule], policy: { token: "one" }, faces: { http: { token: "two" } } })).toThrow(/one token/);
    expect(createMcpHost({ modules: [whoModule], faces: { http: { token: TOKEN } } }).policy.token).toBe(TOKEN);
    expect(createMcpHost({ modules: [whoModule], policy: { token: TOKEN }, faces: { http: { token: TOKEN } } }).policy.token).toBe(TOKEN);
  });
});

describe("one check for each request on the MCP face of a host (CLI-2b)", () => {
  it("refuses a token of the face that is not the token of the policy, and a handler without admission() when the policy checks credentials", () => {
    const registry = createRegistry(whoModule);
    const policy = hostPolicy({ token: TOKEN });
    const server = new ProcedureServer(procedureServerOptions(policy, registry));
    expect(() => mcpFace({ token: "another-token" })({ handler: server, registry, policy })).toThrow(/token of the host policy/);
    expect(() => mcpFace({ token: TOKEN })({ handler: server, registry, policy })).not.toThrow();
    // A handler without admission() cannot check each request: the face does not start without a check
    const bare = { handle: server.handle.bind(server) };
    expect(() => mcpFace()({ handler: bare, registry, policy })).toThrow(/needs admission\(\)/);
    expect(() => mcpFace()({ handler: bare, registry, policy: hostPolicy({}) })).not.toThrow();
  });
});
