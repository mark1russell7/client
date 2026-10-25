/**
 * One check for each request, on each face of the procedures host (CLI-2b).
 *
 * The browser checks (the Host header and the origin) run one time for each HTTP request and for
 * each upgrade. The checks of the credentials (the request hook, the token check) run one time for
 * each request too: the admission of the server. A call of the MCP face uses the admission of its
 * HTTP request, so the request hook does not run again for it. A call over an open WebSocket is a
 * request of its own, so it gets one admission. The test counts each run, and a request without a
 * token, or with a foreign Host or Origin, is still refused.
 *
 * A jarvis-style cookie (the token in a cookie) gives a principal on the faces. A Graph-style
 * request hook has the shape of `graphPrincipalOf` of Graph: in the accounts mode a session gives
 * its user and no session gives the anonymous principal, accounts that are not ready refuse the
 * request, and in the mode `on` a tenant token gives the tenant.
 *
 * Each request path of an MCP session has its check: a tool call, the DELETE of the session,
 * OPTIONS, and `tasks/get` and `tasks/result` of a task. The MCP face takes `allowedOrigins: "*"`
 * of the policy, as the HTTP face does, and sends no CORS header.
 */

import { describe, it, expect, afterEach } from "vitest";
import { randomBytes } from "node:crypto";
import { request, type IncomingHttpHeaders } from "node:http";
import { z } from "zod";
import { service, type ServiceBuilder } from "@mark1russell7/service";
import { fakeClock, fakeProcess, seeded } from "@mark1russell7/service/testing";
import {
  WebSocketTransport,
  createProcedure,
  createRegistry,
  hostPolicy,
  ms,
  pathToMethod,
  seconds,
  type BrowserGuardOptions,
  type HostPolicy,
  type PrincipalOf,
} from "@procedures/client";
import { mcpFace } from "@procedures/mcp-server";
import { createProcedureHost, LOCAL_LISTENER_KNOBS } from "./index.js";

const TOKEN = "one-check-token-0123456789";
/** The web page that the browser checks permit. */
const APP = "http://app.test";

let cleanups: Array<() => Promise<unknown> | unknown> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

/** A service with short stages. */
function serviceOf(name: string): ServiceBuilder {
  return service(name)
    .readiness({ type: "debounce", interval: seconds(5), failAfter: 3, recoverAfter: 1 })
    .liveness({ type: "window", failAfter: seconds(45) })
    .startup(seconds(10))
    .phase("fail readiness", ms(10))
    .phase("stop intake", ms(500))
    .phase("drain", ms(1000))
    .phase("close transports", ms(500))
    .phase("stop the poller", ms(100))
    .phase("tear down dependencies", ms(500))
    .phase("close the health server", ms(100))
    .cooperativeWindow(ms(500))
    .onRepeatSignal("ignore");
}

/** The counts of the checks: the request hook (the admission), the origin rule and the rule of the Host header. */
interface Counts {
  hook: number;
  origins: number;
  hosts: number;
}

/**
 * The browser checks of the policy, with counts: the origin rule is a function, and the host names
 * are a list that counts each lookup. The core check calls each one time for a request.
 */
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

/** A jarvis-style request hook: the token of the cookie `jarvis_token`, else the bearer token. It counts its runs. */
function jarvisHook(counts: Counts): PrincipalOf {
  return ({ cookies = {}, bearer }) => {
    counts.hook++;
    const presented = cookies["jarvis_token"] ?? bearer;
    return presented !== undefined ? { bearer: presented } : {};
  };
}

/** The anonymous principal of Graph. */
const ANONYMOUS = { id: "anonymous", via: "anonymous", claims: {} };

/** The modes of the Graph-style hook, as the AUTH_MODE of Graph. */
type GraphDeps =
  | { readonly mode: "off" }
  | { readonly mode: "on"; readonly tenantTokens: Readonly<Record<string, string>> }
  | { readonly mode: "accounts"; readonly ready: () => boolean; readonly sessions: ReadonlyMap<string, string>; readonly agentToken?: string };

/**
 * A Graph-style request hook, with the shape of `graphPrincipalOf` of Graph. It counts its runs.
 * - `off`: each request is anonymous.
 * - `on`: a tenant token gives the tenant. Without it, the hook refuses the request.
 * - `accounts`: accounts that are not ready throw `UNAVAILABLE`. The agent token gives the agent.
 *   A session cookie gives its user, and a request without a session is anonymous.
 */
function graphHook(counts: Counts, deps: GraphDeps): PrincipalOf {
  return async ({ bearer, cookies = {} }) => {
    counts.hook++;
    if (deps.mode === "off") return { principal: ANONYMOUS };
    if (deps.mode === "on") {
      for (const [tenant, token] of Object.entries(deps.tenantTokens)) {
        if (bearer === token) return { principal: { id: `tenant:${tenant}`, via: "tenant-token", claims: { tenant } } };
      }
      return undefined;
    }
    if (!deps.ready()) throw Object.assign(new Error("accounts are not ready"), { code: "UNAVAILABLE", retryable: true });
    if (deps.agentToken !== undefined && bearer === deps.agentToken) return { principal: { id: "agent", via: "agent-token", claims: { graph: { agent: true } } } };
    const user = deps.sessions.get(cookies["better-auth.session_token"] ?? "");
    return { principal: user !== undefined ? { id: user, via: "better-auth", claims: { graph: { user } } } : ANONYMOUS };
  };
}

/** A host with the HTTP, WebSocket and MCP faces on one listener, under `run()` on a fake clock. */
async function runHost(policy: HostPolicy): Promise<{ address: (type: string) => string; port: number }> {
  const clock = fakeClock();
  const host = createProcedureHost({
    name: "one-check",
    registry: createRegistry({
      name: "one-check",
      procedures: [
        createProcedure()
          .path(["who", "am"])
          .input(z.object({}).passthrough())
          .output(z.unknown())
          .meta({ effects: { reads: [], writes: [] } })
          .handler(async (_input, ctx) => ({ principal: ctx.principal ?? null }))
          .build(),
        // A tool that can run as an MCP task (CLI-35)
        createProcedure()
          .path(["who", "later"])
          .input(z.object({}).passthrough())
          .output(z.unknown())
          .meta({ effects: { reads: [], writes: [] }, taskSupport: "optional" })
          .handler(async (_input, ctx) => ({ principal: ctx.principal ?? null }))
          .build(),
      ],
    }),
    clock,
    policy,
    faces: { http: true, ws: true, mcp: mcpFace({ serverInfo: { name: "one-check", version: "0.0.0" }, tasks: {} }) },
    listen: [{ port: 0, knobs: LOCAL_LISTENER_KNOBS }],
  });
  const svc = host.declare(serviceOf("one-check"));
  await svc.run({ clock, process: fakeProcess({ clock }), random: seeded(7) });
  await clock.advance(0);
  cleanups.push(async () => {
    for (const part of [...host.parts].reverse()) await part.impl.close();
  });
  const address = (type: string): string => host.info.endpoints().find((endpoint) => endpoint.type === type)!.address;
  return { address, port: Number(new URL(address("http")).port) };
}

/** The headers of a web page of the permitted origin, on the permitted host name. */
const browserHeaders = (port: number): Record<string, string> => ({ host: `app.test:${port}`, origin: APP });

/** The counts since the last call of the function. */
function delta(counts: Counts): () => Counts {
  let last = { ...counts };
  return () => {
    const now = { hook: counts.hook - last.hook, origins: counts.origins - last.origins, hosts: counts.hosts - last.hosts };
    last = { ...counts };
    return now;
  };
}

/** The answer of a raw HTTP request: the status, the headers and the text of the body. */
interface Answer {
  readonly status: number;
  readonly headers: IncomingHttpHeaders;
  readonly text: string;
}

/**
 * A raw HTTP request of `node:http`, on a new connection. Unlike `fetch`, it sends the `Host`
 * header that the test gives, so the test can send a foreign host name.
 */
function send(url: string, method: string, headers: Record<string, string>, body?: string): Promise<Answer> {
  const target = new URL(url);
  const length = body !== undefined ? { "content-length": String(Buffer.byteLength(body)) } : {};
  return new Promise((resolve, reject) => {
    const req = request({ host: target.hostname, port: target.port, path: target.pathname, method, headers: { ...headers, ...length }, agent: false }, (res) => {
      let text = "";
      res.setEncoding("utf8");
      res.on("data", (chunk: string) => (text += chunk));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, text }));
    });
    req.on("error", reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

/** A procedure call on the HTTP face: the status and the body. */
async function callHttp(address: string, headers: Record<string, string>): Promise<{ status: number; body: Record<string, unknown> }> {
  const answer = await send(`${address}/who/am`, "POST", { "content-type": "application/json", ...headers }, "{}");
  return { status: answer.status, body: JSON.parse(answer.text) as Record<string, unknown> };
}

/** The status of an upgrade of the WebSocket face: 101 when the connection opens, else the status of the refusal. */
function upgrade(port: number, headers: Record<string, string>): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = request({
      host: "127.0.0.1",
      port,
      path: "/ws",
      headers: { Connection: "Upgrade", Upgrade: "websocket", "Sec-WebSocket-Version": "13", "Sec-WebSocket-Key": randomBytes(16).toString("base64"), ...headers },
    });
    req.on("upgrade", (res, socket) => {
      socket.destroy();
      resolve(res.statusCode ?? 101);
    });
    req.on("response", (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    req.on("error", reject);
    req.end();
  });
}

const MCP_HEADERS = { "content-type": "application/json", accept: "application/json, text/event-stream" };
const INITIALIZE = { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "one-check", version: "0" } } };
const INITIALIZED = { jsonrpc: "2.0", method: "notifications/initialized" };

/** A JSON-RPC request to the MCP face: the status, the session and the message of the answer (JSON, or one server-sent event). */
async function postMcp(address: string, body: unknown, headers: Record<string, string>): Promise<{ status: number; session: string | null; message: Record<string, unknown> | undefined }> {
  const answer = await send(address, "POST", { ...MCP_HEADERS, ...headers }, JSON.stringify(body));
  const data = answer.text.split(/\r?\n/).find((line) => line.startsWith("data: "));
  const json = answer.text.startsWith("{") ? answer.text : data?.slice("data: ".length);
  const session = [answer.headers["mcp-session-id"]].flat()[0] ?? null;
  return { status: answer.status, session, message: json ? (JSON.parse(json) as Record<string, unknown>) : undefined };
}

/** The principal that the tool `who.am` gives in an answer of the MCP face. */
function principalOfTool(message: Record<string, unknown> | undefined): unknown {
  const result = message?.["result"] as { content?: Array<{ text?: string }> } | undefined;
  return (JSON.parse(result?.content?.[0]?.text ?? "null") as { principal?: unknown } | null)?.principal;
}

describe("one check for each request on each face of the host (CLI-2b)", () => {
  it("the HTTP face: one browser check and one admission for each request, and the refusals stay", async () => {
    const counts: Counts = { hook: 0, origins: 0, hosts: 0 };
    const { address, port } = await runHost(hostPolicy({ token: TOKEN, principalOf: jarvisHook(counts), browser: countedBrowser(counts) }));
    const since = delta(counts);
    const page = browserHeaders(port);

    const passed = await callHttp(address("http"), { ...page, cookie: `jarvis_token=${TOKEN}` });
    expect(passed).toMatchObject({ status: 200, body: { principal: { id: "token", via: "token" } } });
    expect(since()).toEqual({ hook: 1, origins: 1, hosts: 1 });

    // Without the token, or with a wrong one: the one admission refuses the request
    expect((await callHttp(address("http"), page)).status).toBe(401);
    expect(since()).toEqual({ hook: 1, origins: 1, hosts: 1 });
    expect((await callHttp(address("http"), { ...page, cookie: "jarvis_token=wrong" })).body).toMatchObject({ code: "UNAUTHORIZED" });
    expect(since()).toEqual({ hook: 1, origins: 1, hosts: 1 });
    // A foreign Host or Origin: the browser check refuses the request before the admission
    expect((await callHttp(address("http"), { ...page, host: `attacker.example:${port}`, cookie: `jarvis_token=${TOKEN}` })).status).toBe(403);
    expect(since()).toEqual({ hook: 0, origins: 0, hosts: 1 });
    expect((await callHttp(address("http"), { ...page, origin: "https://evil.example", cookie: `jarvis_token=${TOKEN}` })).status).toBe(403);
    expect(since()).toEqual({ hook: 0, origins: 1, hosts: 1 });
  });

  it("the WebSocket face: one browser check and one admission for the upgrade, and one admission for each call", async () => {
    const counts: Counts = { hook: 0, origins: 0, hosts: 0 };
    const { address, port } = await runHost(hostPolicy({ token: TOKEN, principalOf: jarvisHook(counts), browser: countedBrowser(counts) }));
    const since = delta(counts);
    const page = browserHeaders(port);

    expect(await upgrade(port, { ...page, cookie: `jarvis_token=${TOKEN}` })).toBe(101);
    expect(since()).toEqual({ hook: 1, origins: 1, hosts: 1 });
    expect(await upgrade(port, page)).toBe(401);
    expect(since()).toEqual({ hook: 1, origins: 1, hosts: 1 });
    expect(await upgrade(port, { ...page, host: `attacker.example:${port}`, cookie: `jarvis_token=${TOKEN}` })).toBe(403);
    expect(since()).toEqual({ hook: 0, origins: 0, hosts: 1 });
    expect(await upgrade(port, { ...page, origin: "https://evil.example", cookie: `jarvis_token=${TOKEN}` })).toBe(403);
    expect(since()).toEqual({ hook: 0, origins: 1, hosts: 1 });

    // A client that is not a browser: no Origin, a loopback host. Each call is a request with one admission.
    const socket = new WebSocketTransport({ url: `${address("websocket")}?token=${TOKEN}`, heartbeat: { enabled: false }, reconnect: { enabled: false } });
    cleanups.push(() => socket.close());
    for (let count = 0; count < 2; count++) {
      const message = { id: `ws-${count}`, method: pathToMethod(["who", "am"]), payload: {}, metadata: {} };
      for await (const item of socket.send(message)) {
        expect(item.status.type).toBe("success");
        expect(item.payload).toEqual({ principal: { id: "token", via: "token" } });
        break;
      }
    }
    // One admission for the upgrade, and one for each of the two calls
    expect(since()).toEqual({ hook: 3, origins: 0, hosts: 0 });
  });

  it("the MCP face of the host: one browser check and one admission for each HTTP request, and a tool call does not run the hook again", async () => {
    const counts: Counts = { hook: 0, origins: 0, hosts: 0 };
    const { address, port } = await runHost(hostPolicy({ token: TOKEN, principalOf: jarvisHook(counts), browser: countedBrowser(counts) }));
    const since = delta(counts);
    const page = { ...browserHeaders(port), cookie: `jarvis_token=${TOKEN}` };
    const mcp = address("mcp");

    const opened = await postMcp(mcp, INITIALIZE, page);
    expect(opened.status).toBe(200);
    expect(since()).toEqual({ hook: 1, origins: 1, hosts: 1 });
    const session = { ...page, "mcp-session-id": opened.session! };
    expect((await postMcp(mcp, { jsonrpc: "2.0", method: "notifications/initialized" }, session)).status).toBe(202);
    expect(since()).toEqual({ hook: 1, origins: 1, hosts: 1 });
    const listed = await postMcp(mcp, { jsonrpc: "2.0", id: 2, method: "tools/list" }, session);
    expect(JSON.stringify(listed.message)).toContain("who.am");
    expect(since()).toEqual({ hook: 1, origins: 1, hosts: 1 });
    // The tool call uses the admission of its HTTP request: the hook runs one time, not two
    const called = await postMcp(mcp, { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "who.am", arguments: {} } }, session);
    expect(principalOfTool(called.message)).toEqual({ id: "token", via: "token" });
    expect(since()).toEqual({ hook: 1, origins: 1, hosts: 1 });

    // Each request path keeps its check: a request of the session without the token is refused
    const { cookie: _cookie, ...withoutToken } = session;
    const refused = await postMcp(mcp, { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "who.am", arguments: {} } }, withoutToken);
    expect(refused.status).toBe(401);
    expect(refused.message).toMatchObject({ error: { data: { code: "UNAUTHORIZED" } } });
    expect((await send(mcp, "GET", { ...withoutToken, accept: "text/event-stream" })).status).toBe(401);
    expect((await postMcp(mcp, INITIALIZE, { ...browserHeaders(port), cookie: "jarvis_token=wrong" })).status).toBe(401);
    since();
    // A foreign Host or Origin: the browser check refuses the request before the admission
    expect((await postMcp(mcp, INITIALIZE, { ...page, host: `attacker.example:${port}` })).status).toBe(403);
    expect(since()).toEqual({ hook: 0, origins: 0, hosts: 1 });
    expect((await postMcp(mcp, INITIALIZE, { ...page, origin: "https://evil.example" })).status).toBe(403);
    expect(since()).toEqual({ hook: 0, origins: 1, hosts: 1 });
  });

  it("each request path of an MCP session has its check: a task, tasks/get, tasks/result, a tool call, OPTIONS and the DELETE of the session", async () => {
    const counts: Counts = { hook: 0, origins: 0, hosts: 0 };
    const { address, port } = await runHost(hostPolicy({ token: TOKEN, principalOf: jarvisHook(counts), browser: countedBrowser(counts) }));
    const mcp = address("mcp");
    const page = { ...browserHeaders(port), cookie: `jarvis_token=${TOKEN}` };
    const opened = await postMcp(mcp, INITIALIZE, page);
    expect(opened.status).toBe(200);
    const session = { ...page, "mcp-session-id": opened.session! };
    await postMcp(mcp, INITIALIZED, session);
    const since = delta(counts);

    // A tool call as a task: one admission for the HTTP request. The principal of the task
    // (identify) and the call of the task use it, so the hook does not run again for them.
    const created = await postMcp(mcp, { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "who.later", arguments: {}, task: {} } }, session);
    const taskId = (created.message?.["result"] as { task?: { taskId?: string } } | undefined)?.task?.taskId;
    expect(typeof taskId).toBe("string");
    // tasks/result waits for the end of the task
    const result = await postMcp(mcp, { jsonrpc: "2.0", id: 3, method: "tasks/result", params: { taskId } }, session);
    expect(principalOfTool(result.message)).toEqual({ id: "token", via: "token" });
    const got = await postMcp(mcp, { jsonrpc: "2.0", id: 4, method: "tasks/get", params: { taskId } }, session);
    expect(got.message?.["result"]).toMatchObject({ taskId, status: "completed" });
    expect(since()).toEqual({ hook: 3, origins: 3, hosts: 3 });

    // Each request path of the open session, without the token or with a wrong one: 401
    const { cookie: _cookie, ...withoutToken } = session;
    const wrongToken = { ...session, cookie: "jarvis_token=wrong" };
    for (const headers of [withoutToken, wrongToken]) {
      const call = await postMcp(mcp, { jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "who.am", arguments: {} } }, headers);
      expect(call.status).toBe(401);
      expect(call.message).toMatchObject({ error: { data: { code: "UNAUTHORIZED" } } });
      expect((await postMcp(mcp, { jsonrpc: "2.0", id: 6, method: "tasks/get", params: { taskId } }, headers)).status).toBe(401);
      expect((await postMcp(mcp, { jsonrpc: "2.0", id: 7, method: "tasks/result", params: { taskId } }, headers)).status).toBe(401);
      const options = await send(mcp, "OPTIONS", headers);
      expect(options.status).toBe(401);
      expect(options.headers["www-authenticate"]).toBe('Bearer realm="mcp"');
      expect((await send(mcp, "DELETE", headers)).status).toBe(401);
    }
    // Ten requests: ten admissions, and each one refused
    expect(since()).toEqual({ hook: 10, origins: 10, hosts: 10 });

    // The refused DELETE did not close the session. The DELETE with the token closes it.
    const listed = await postMcp(mcp, { jsonrpc: "2.0", id: 8, method: "tools/list" }, session);
    expect(JSON.stringify(listed.message)).toContain("who.am");
    expect((await send(mcp, "DELETE", session)).status).toBe(200);
    expect((await postMcp(mcp, { jsonrpc: "2.0", id: 9, method: "tools/list" }, session)).status).toBe(404);
  });

  it('the MCP face takes allowedOrigins "*" of the policy, as the HTTP face does: no CORS header, and a request with a cookie needs a named origin', async () => {
    // A token and no request hook: the server reads no cookies, so only a request with a cookie is ambient
    const { address, port } = await runHost(hostPolicy({ token: TOKEN, browser: { allowedOrigins: "*" } }));
    const foreign = { host: `127.0.0.1:${port}`, origin: "https://evil.example", authorization: `Bearer ${TOKEN}` };
    const mcp = address("mcp");
    const http = `${address("http")}/who/am`;

    // A foreign origin passes, and the answer has no Access-Control-Allow-Origin header: a web page cannot read it
    const opened = await send(mcp, "POST", { ...MCP_HEADERS, ...foreign }, JSON.stringify(INITIALIZE));
    expect(opened.status).toBe(200);
    expect(opened.headers["access-control-allow-origin"]).toBeUndefined();
    const called = await send(http, "POST", { "content-type": "application/json", ...foreign }, "{}");
    expect(called.status).toBe(200);
    expect(called.headers["access-control-allow-origin"]).toBeUndefined();

    // The same requests with a cookie: 403 (CSRF), with no CORS header
    for (const refused of [
      await send(mcp, "POST", { ...MCP_HEADERS, ...foreign, cookie: "s=1" }, JSON.stringify(INITIALIZE)),
      await send(http, "POST", { "content-type": "application/json", ...foreign, cookie: "s=1" }, "{}"),
    ]) {
      expect(refused.status).toBe(403);
      expect(refused.headers["access-control-allow-origin"]).toBeUndefined();
    }
  });

  it("a Graph-style hook in the accounts mode: a session gives its user, no session is anonymous, and accounts that are not ready give 401 at initialize", async () => {
    const counts: Counts = { hook: 0, origins: 0, hosts: 0 };
    let ready = true;
    const deps: GraphDeps = { mode: "accounts", ready: () => ready, sessions: new Map([["session-of-alice", "alice"]]), agentToken: "graph-agent-token" };
    const { address, port } = await runHost(hostPolicy({ principalOf: graphHook(counts, deps), browser: countedBrowser(counts) }));
    const since = delta(counts);
    const page = browserHeaders(port);
    const signedIn = { ...page, cookie: "better-auth.session_token=session-of-alice" };
    const asAgent = { ...page, authorization: "Bearer graph-agent-token" };
    const alice = { id: "alice", via: "better-auth", claims: { graph: { user: "alice" } } };
    const agent = { id: "agent", via: "agent-token", claims: { graph: { agent: true } } };

    // The HTTP and WebSocket faces: a request without a session is anonymous, not refused
    expect(await callHttp(address("http"), signedIn)).toMatchObject({ status: 200, body: { principal: alice } });
    expect(await callHttp(address("http"), page)).toMatchObject({ status: 200, body: { principal: ANONYMOUS } });
    expect(await upgrade(port, signedIn)).toBe(101);
    expect(await upgrade(port, page)).toBe(101);
    since();

    // The MCP face: no 401 at initialize without a session. The tool call gives the anonymous principal.
    const mcp = address("mcp");
    for (const [headers, principal] of [
      [signedIn, alice],
      [page, ANONYMOUS],
      [asAgent, agent],
    ] as const) {
      const opened = await postMcp(mcp, INITIALIZE, headers);
      expect(opened.status, principal.id).toBe(200);
      const session = { ...headers, "mcp-session-id": opened.session! };
      await postMcp(mcp, INITIALIZED, session);
      const called = await postMcp(mcp, { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "who.am", arguments: {} } }, session);
      expect(principalOfTool(called.message), principal.id).toEqual(principal);
    }
    // Nine HTTP requests of the MCP face: nine admissions, and the tool calls add none
    expect(since()).toEqual({ hook: 9, origins: 9, hosts: 9 });

    // Accounts that are not ready: the hook throws UNAVAILABLE, and the server refuses with 401.
    // On the MCP face the 401 comes at initialize, with WWW-Authenticate: an MCP client can start OAuth discovery on it.
    ready = false;
    expect((await callHttp(address("http"), signedIn)).status).toBe(401);
    expect(await upgrade(port, signedIn)).toBe(401);
    const notReady = await send(mcp, "POST", { ...MCP_HEADERS, ...signedIn }, JSON.stringify(INITIALIZE));
    expect(notReady.status).toBe(401);
    expect(notReady.headers["www-authenticate"]).toBe('Bearer realm="mcp"');
  });

  it("a Graph-style hook in the mode on: a tenant token gives its tenant, and without it the MCP face answers 401 at initialize", async () => {
    const counts: Counts = { hook: 0, origins: 0, hosts: 0 };
    const { address } = await runHost(hostPolicy({ principalOf: graphHook(counts, { mode: "on", tenantTokens: { acme: "tok-acme" } }) }));
    const mcp = address("mcp");
    const tenant = { authorization: "Bearer tok-acme" };
    const opened = await postMcp(mcp, INITIALIZE, tenant);
    expect(opened.status).toBe(200);
    const session = { ...tenant, "mcp-session-id": opened.session! };
    await postMcp(mcp, INITIALIZED, session);
    const called = await postMcp(mcp, { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "who.am", arguments: {} } }, session);
    expect(principalOfTool(called.message)).toEqual({ id: "tenant:acme", via: "tenant-token", claims: { tenant: "acme" } });
    for (const headers of [{}, { authorization: "Bearer tok-beta" }]) {
      const refused = await send(mcp, "POST", { ...MCP_HEADERS, ...headers }, JSON.stringify(INITIALIZE));
      expect(refused.status).toBe(401);
      expect(refused.headers["www-authenticate"]).toBe('Bearer realm="mcp"');
    }
  });
});
