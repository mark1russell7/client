/**
 * The request hook of a server (CLI-2a): `principalOf` reads the credentials of a network request
 * from a cookie, a header or the query, and gives a bearer token, a principal and a narrowing.
 * The secret headers stay out of the metadata.
 */

import { describe, it, expect, afterEach } from "vitest";
import { createServer, request, type IncomingMessage, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { z } from "zod";
import { WebSocket as WsClient } from "ws";
import { createProcedure } from "../procedures/define.js";
import { createRegistry } from "../procedures/module.js";
import { ladder, joinNarrowing } from "../procedures/capability.js";
import { ProcedureServer, type ProcedureServerOptions } from "./procedure-server.js";
import { hostPolicy, procedureServerOptions } from "./host-policy.js";
import { pathToMethod } from "./method.js";
import { LOCAL_CREDENTIALS, cookiesOf, requestCredentials, withoutSecretHeaders } from "./request-auth.js";
import type { Credentials, PrincipalOf } from "./types.js";
import { procedureHandler } from "../adapters/http/server/handler.js";
import { upgradeHandler } from "../adapters/websocket/server/upgrade.js";

type Audience = "public" | "guest" | "intimate";
const AUDIENCES: readonly Audience[] = ["public", "guest", "intimate"];

function registry() {
  const read = { reads: [], writes: [] };
  return createRegistry({
    name: "who",
    procedures: [
      createProcedure()
        .path(["who", "am"])
        .input(z.object({}))
        .output(z.unknown())
        .meta({ effects: read })
        .handler(async (_input, ctx) => ({
          principal: ctx.principal ?? null,
          clearance: ctx.capability.clearance ?? null,
          writes: ctx.capability.effects?.writes ?? null,
          metadata: ctx.metadata,
        }))
        .build(),
      createProcedure()
        .path(["who", "nested"])
        .input(z.object({}))
        .output(z.unknown())
        .meta({ effects: read, calls: ["who.am"] })
        .handler(async (_input, ctx) => ctx.client.call(["who", "am"], {}))
        .build(),
    ],
  });
}

let cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup();
  cleanups = [];
});

async function listen(http: HttpServer): Promise<number> {
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", () => resolve()));
  cleanups.push(async () => {
    http.closeAllConnections();
    await new Promise<void>((resolve) => http.close(() => resolve()));
  });
  return (http.address() as AddressInfo).port;
}

/** A raw node:http server with the procedure handler at /api/proc, and an upgrade handler at /ws. */
async function start(options: ProcedureServerOptions, secretHeaders: readonly string[] = []): Promise<number> {
  const server = new ProcedureServer({ registry: registry(), ...options });
  server.registerFromRegistry();
  const handler = procedureHandler(server, { basePath: "/api/proc", secretHeaders });
  const upgrade = upgradeHandler(server, { path: "/ws", heartbeat: false, secretHeaders });
  const http = createServer((req, res) => {
    if (!handler(req, res)) res.end("app");
  });
  http.on("upgrade", (req, socket, head) => {
    if (!upgrade(req, socket, head)) socket.destroy();
  });
  cleanups.push(() => upgrade.close());
  return listen(http);
}

/** One call over HTTP, with any headers: the status and the body. */
function call(port: number, path = "/api/proc/who/am", headers: Record<string, string> = {}): Promise<{ status: number; body: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, method: "POST", path, headers: { "content-type": "application/json", ...headers } }, (res: IncomingMessage) => {
      let text = "";
      res.setEncoding("utf8");
      res.on("data", (chunk: string) => (text += chunk));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: JSON.parse(text) as Record<string, unknown> }));
    });
    req.on("error", reject);
    req.end("{}");
  });
}

/** One call over WebSocket, with the headers and the URL query of the upgrade. */
function callWs(port: number, query = "", headers: Record<string, string> = {}): Promise<{ type: string; payload?: unknown; error?: { code: string } }> {
  return new Promise((resolve, reject) => {
    const ws = new WsClient(`ws://127.0.0.1:${port}/ws${query}`, { headers });
    ws.on("open", () => ws.send(JSON.stringify({ id: "c1", type: "request", method: pathToMethod(["who", "am"]), payload: {} })));
    ws.on("message", (data: Buffer) => {
      const frame = JSON.parse(data.toString()) as { id: string; type: string; payload?: unknown; error?: { code: string } };
      if (frame.id !== "c1") return;
      ws.close();
      resolve(frame);
    });
    ws.on("error", reject);
  });
}

// The jarvis style: the token in a cookie (the /login page sets it), an application header or
// ?token=, and a guest switch in a cookie or a header that can only make the audience narrower
const TOKEN = "s3cret-token";
const jarvisPrincipalOf: PrincipalOf = ({ cookies = {}, headers = {}, query = {} }) => {
  const bearer = cookies["jarvis_token"] ?? headers["x-jarvis-token"] ?? query["token"];
  const audiences = [headers["x-jarvis-audience"], cookies["jarvis_audience"]].filter((value): value is Audience => AUDIENCES.includes(value as Audience));
  const narrowest = audiences.reduce<Audience | undefined>((a, b) => (a === undefined || AUDIENCES.indexOf(b) < AUDIENCES.indexOf(a) ? b : a), undefined);
  return { ...(bearer !== undefined ? { bearer } : {}), ...(narrowest !== undefined ? { narrowing: { clearance: narrowest } } : {}) };
};
const jarvisOptions: ProcedureServerOptions = {
  token: TOKEN,
  principalOf: jarvisPrincipalOf,
  capability: { clearance: "intimate" },
  clearanceOrder: ladder(AUDIENCES),
};

describe("principalOf: a jarvis-style cookie (CLI-2a)", () => {
  it("takes the token of the cookie, of the application header and of the query, and refuses without it", async () => {
    const port = await start(jarvisOptions, ["X-Jarvis-Token"]);
    for (const [path, headers] of [
      ["/api/proc/who/am", { cookie: `theme=dark; jarvis_token=${TOKEN}` }],
      ["/api/proc/who/am", { "x-jarvis-token": TOKEN }],
      [`/api/proc/who/am?token=${TOKEN}`, {}],
    ] as const) {
      const res = await call(port, path, headers);
      expect(res.status, path).toBe(200);
      expect(res.body["principal"]).toEqual({ id: "token", via: "token" });
      expect(res.body["clearance"]).toBe("intimate");
      // No secret reaches the procedure: not the cookie, not the header, not the query
      expect(JSON.stringify(res.body["metadata"])).not.toContain(TOKEN);
    }
    expect((await call(port)).status).toBe(401);
    expect((await call(port, "/api/proc/who/am", { cookie: "jarvis_token=wrong" })).body["code"]).toBe("UNAUTHORIZED");
  });

  it("narrows the capability with the guest switch of a cookie or a header, and never widens it", async () => {
    const port = await start(jarvisOptions);
    const guest = await call(port, "/api/proc/who/am", { cookie: `jarvis_token=${TOKEN}; jarvis_audience=guest` });
    expect(guest.body["clearance"]).toBe("guest");
    const narrowest = await call(port, "/api/proc/who/am", { cookie: `jarvis_token=${TOKEN}; jarvis_audience=guest`, "x-jarvis-audience": "public" });
    expect(narrowest.body["clearance"]).toBe("public");
    // The capability of the server is "guest": a request for "intimate" gets "guest"
    const capped = await start({ ...jarvisOptions, capability: { clearance: "guest" } });
    const wider = await call(capped, "/api/proc/who/am", { cookie: `jarvis_token=${TOKEN}; jarvis_audience=intimate` });
    expect(wider.body["clearance"]).toBe("guest");
  });

  it("reads the cookie of a WebSocket upgrade, and the token query of a browser WebSocket", async () => {
    const port = await start(jarvisOptions);
    const cookie = await callWs(port, "", { cookie: `jarvis_token=${TOKEN}; jarvis_audience=guest` });
    expect(cookie.type).toBe("response");
    expect(cookie.payload).toMatchObject({ principal: { id: "token", via: "token" }, clearance: "guest" });
    const query = await callWs(port, `?token=${TOKEN}`);
    expect(query.payload).toMatchObject({ principal: { id: "token", via: "token" }, clearance: "intimate" });
    const refused = await callWs(port);
    expect(refused.error?.code).toBe("UNAUTHORIZED");
  });
});

// The Graph style: a session cookie of an auth library. The server looks the session up, and a
// request without a session is a signed-out principal that can read only
const SESSIONS: Record<string, { user: string; groups: string[] }> = { "sess-1": { user: "u_mark", groups: ["core"] } };
const graphPrincipalOf: PrincipalOf = async ({ cookies = {} }) => {
  const session = SESSIONS[cookies["better-auth.session_token"] ?? ""];
  await Promise.resolve();
  if (!session) return {};
  return { principal: { id: `user:${session.user}`, via: "session", claims: { groups: session.groups } } };
};
const graphOptions: ProcedureServerOptions = {
  principalOf: graphPrincipalOf,
  capability: (request) => (request.principal ? undefined : { effects: { writes: [] } }),
};

describe("principalOf: a Graph-style session (CLI-2a)", () => {
  it("gives the principal of the session to the procedure and to its nested calls", async () => {
    const port = await start(graphOptions);
    const signedIn = await call(port, "/api/proc/who/nested", { cookie: "better-auth.session_token=sess-1" });
    expect(signedIn.status).toBe(200);
    expect(signedIn.body["principal"]).toEqual({ id: "user:u_mark", via: "session", claims: { groups: ["core"] } });
    expect(signedIn.body["writes"]).toBeNull();
    expect(JSON.stringify(signedIn.body["metadata"])).not.toContain("sess-1");
  });

  it("accepts a request without a session as signed out, with the capability of a reader", async () => {
    const port = await start(graphOptions);
    const signedOut = await call(port);
    expect(signedOut.status).toBe(200);
    expect(signedOut.body["principal"]).toBeNull();
    expect(signedOut.body["writes"]).toEqual([]);
  });

  it("gives the principal of the session on a WebSocket connection", async () => {
    const port = await start(graphOptions);
    const frame = await callWs(port, "", { cookie: "better-auth.session_token=sess-1" });
    expect(frame.payload).toMatchObject({ principal: { id: "user:u_mark", via: "session" } });
  });
});

describe("principalOf: ?token= on HTTP (CLI-2a)", () => {
  it("takes the token of the query of an HTTP request, through the host policy", async () => {
    const policy = hostPolicy({ token: TOKEN, principalOf: ({ query = {} }) => (query["token"] ? { bearer: query["token"] } : {}) });
    const port = await start(procedureServerOptions(policy, registry()));
    const res = await call(port, `/api/proc/who/am?token=${TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body["principal"]).toEqual({ id: "token", via: "token" });
    expect(JSON.stringify(res.body["metadata"])).not.toContain(TOKEN);
    expect((await call(port, "/api/proc/who/am?token=wrong")).status).toBe(401);
    // The bearer token of the Authorization header still works
    expect((await call(port, "/api/proc/who/am", { authorization: `Bearer ${TOKEN}` })).status).toBe(200);
  });
});

describe("principalOf: the admit path (CLI-2a)", () => {
  function server(options: ProcedureServerOptions): ProcedureServer {
    const value = new ProcedureServer({ registry: registry(), ...options });
    value.registerFromRegistry();
    return value;
  }
  const request = (credentials?: Credentials) => ({ id: "r1", method: pathToMethod(["who", "am"]), payload: {}, metadata: {}, ...(credentials ? { credentials } : {}) });

  it("refuses a request when the hook gives undefined or throws", async () => {
    for (const principalOf of [() => undefined, () => Promise.reject(new Error("no session store"))] as PrincipalOf[]) {
      const response = await server({ principalOf }).handle(request({}));
      expect(response.status).toMatchObject({ type: "error", code: "UNAUTHORIZED" });
    }
  });

  it("does not call the hook for a local request, or for a request without credentials", async () => {
    let calls = 0;
    const value = server({ principalOf: () => (calls++, {}) });
    expect((await value.handle(request(LOCAL_CREDENTIALS))).status.type).toBe("success");
    // Without a token, a request without credentials passes, as before (CLI-1 refuses it only with a token)
    expect((await value.handle(request())).status.type).toBe("success");
    expect(calls).toBe(0);
  });

  it("runs authenticate after the hook: authenticate reads the principal of the hook", async () => {
    let seen: unknown;
    const response = await server({
      principalOf: () => ({ principal: { id: "alice", via: "cookie" } }),
      authenticate: (req) => {
        seen = req.principal;
        return { id: "alice", via: "authenticate", claims: { checked: true } };
      },
    }).handle(request({}));
    expect(seen).toEqual({ id: "alice", via: "cookie" });
    expect((response.payload as { principal: unknown }).principal).toEqual({ id: "alice", via: "authenticate", claims: { checked: true } });
  });

  it("joins the narrowing of the hook with a narrowing of the request", async () => {
    const value = server({ principalOf: () => ({ narrowing: { clearance: "guest", effects: { writes: [] } } }), clearanceOrder: ladder(AUDIENCES) });
    const response = await value.handle({ ...request({}), narrowing: { clearance: "public" } });
    expect(response.payload).toMatchObject({ clearance: "public", writes: [] });
  });

  it("answers INTERNAL_ERROR when two clearances have no order", async () => {
    const value = server({ principalOf: () => ({ narrowing: { clearance: "guest" } }), capability: { clearance: "intimate" } });
    const response = await value.handle(request({}));
    expect(response.status).toMatchObject({ type: "error", code: "INTERNAL_ERROR" });
  });
});

describe("the credentials of a request (CLI-2a)", () => {
  it("reads the bearer token, the cookies, each header and the first value of each query parameter", () => {
    const credentials = requestCredentials({
      headers: { authorization: "Bearer b-1", cookie: "a=1; b=%7Bx%7D; a=2; c=\"q\"", "x-list": ["one", "two"], "x-missing": undefined },
      url: "/api/x?token=t-1&page=1&page=2",
    });
    expect(credentials).toEqual({
      bearer: "b-1",
      cookies: { a: "1", b: "{x}", c: "q" },
      headers: { authorization: "Bearer b-1", cookie: "a=1; b=%7Bx%7D; a=2; c=\"q\"", "x-list": "one, two" },
      query: { token: "t-1", page: "1" },
    });
    expect(requestCredentials({ headers: {}, url: "/ws?token=t-2" }, { tokenQuery: "token" }).bearer).toBe("t-2");
    expect(requestCredentials({ headers: {}, url: "/ws?token=t-2" }).bearer).toBeUndefined();
  });

  it("parses a cookie header without errors for odd parts, and changes no prototype", () => {
    expect(cookiesOf(undefined)).toEqual({});
    expect(cookiesOf("novalue; =x; bad=%E0%A4%A; __proto__=p")).toEqual(Object.fromEntries([["bad", "%E0%A4%A"], ["__proto__", "p"]]));
    expect(({} as Record<string, unknown>)["p"]).toBeUndefined();
    expect(cookiesOf(["a=1", "b=2"])).toEqual({ a: "1", b: "2" });
  });

  it("leaves the default and the named secret headers out of the metadata headers", () => {
    const headers = { authorization: "a", cookie: "c", "x-api-key": "k", "proxy-authorization": "p", "X-Jarvis-Token": "j", accept: "*/*" };
    expect(withoutSecretHeaders(headers)).toEqual({ "X-Jarvis-Token": "j", accept: "*/*" });
    expect(withoutSecretHeaders(headers, ["x-jarvis-token"])).toEqual({ accept: "*/*" });
  });

  it("joins two narrowings: the meet of the clearances, the intersection of the effects, the shorter time", () => {
    const order = ladder(AUDIENCES);
    expect(joinNarrowing<Audience>({ clearance: "guest", timeoutMs: 50 }, { clearance: "public", effects: { writes: [] }, timeoutMs: 20 }, order)).toEqual({
      clearance: "public",
      effects: { writes: [] },
      timeoutMs: 20,
    });
    expect(joinNarrowing({ effects: { reads: ["a", "b"] } }, { effects: { reads: ["b"] } })).toEqual({ effects: { reads: ["b"] } });
    expect(() => joinNarrowing({ clearance: "a" }, { clearance: "b" })).toThrow(/clearance order/);
    expect(joinNarrowing({}, {})).toEqual({});
  });
});
