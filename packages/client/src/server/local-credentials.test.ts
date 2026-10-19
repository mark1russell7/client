/**
 * The local marker of credentials (CLI-1). A server with a token refuses a request without
 * credentials: before, such a request skipped the token. Each local face sets the marker
 * (`LOCAL_CREDENTIALS`), and the token does not apply to it. A network face never sets it, and no
 * part of a network request (a header, a cookie, the query, the body, the metadata, a WebSocket
 * upgrade, a port frame) can carry it: the key of the marker is a symbol.
 */

import { describe, it, expect, afterEach } from "vitest";
import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { MessageChannel } from "node:worker_threads";
import { z } from "zod";
import { Client } from "../client/client.js";
import { createProcedure } from "../procedures/define.js";
import { createRegistry } from "../procedures/module.js";
import type { ProcedureContext } from "../procedures/types.js";
import { procedureHandler } from "../adapters/http/server/handler.js";
import { WebSocketServerTransport } from "../adapters/websocket/server/transport.js";
import { WebSocketTransport } from "../node.js";
import { PortTransport } from "../adapters/port/transport.js";
import { ProcedureServer, type ProcedureServerOptions } from "./procedure-server.js";
import { LOCAL_CREDENTIALS, isLocalCredentials, requestCredentials } from "./request-auth.js";
import { pathToMethod } from "./method.js";
import { LOCAL_MARKER, type Credentials, type ServerRequest } from "./types.js";

const TOKEN = "local-credentials-token-0123456789";
const read = { reads: [], writes: [] };

/** The id of the principal of a call, or null. */
const principalOf = (ctx: ProcedureContext): string | null => ctx.principal?.id ?? null;

function server(options: Omit<ProcedureServerOptions, "registry" | "autoRegister"> = {}): ProcedureServer {
  return new ProcedureServer({
    autoRegister: true,
    registry: createRegistry({
      name: "local",
      procedures: [
        createProcedure()
          .path(["who", "ami"])
          .input(z.object({}))
          .output(z.object({ principal: z.string().nullable() }))
          .meta({ effects: read })
          .handler(async (_input, ctx) => ({ principal: principalOf(ctx) }))
          .build(),
        // A nested call does not go through the token check again: it keeps the principal of its caller
        createProcedure()
          .path(["who", "nested"])
          .input(z.object({}))
          .output(z.object({ outer: z.string().nullable(), inner: z.object({ principal: z.string().nullable() }) }))
          .meta({ effects: read })
          .handler(async (_input, ctx) => ({
            outer: principalOf(ctx),
            inner: await ctx.client.call<unknown, { principal: string | null }>(["who", "ami"], {}),
          }))
          .build(),
      ],
    }),
    ...options,
  });
}

const request = (credentials?: Credentials, path: readonly string[] = ["who", "ami"]): ServerRequest => ({
  id: "r1",
  method: pathToMethod(path),
  payload: {},
  metadata: {},
  ...(credentials !== undefined ? { credentials } : {}),
});

let cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const cleanup of cleanups.reverse()) await Promise.resolve(cleanup()).catch(() => {});
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

describe("a request without credentials (CLI-1)", () => {
  it("is refused with UNAUTHORIZED by a server with a token", async () => {
    const response = await server({ token: TOKEN }).handle(request());
    expect(response.status).toMatchObject({ type: "error", code: "UNAUTHORIZED", retryable: false });
    expect(response.status.type === "error" && response.status.message).toMatch(/requires its token/);
  });

  it("passes a server without a token, as before", async () => {
    const response = await server().handle(request());
    expect(response.payload).toEqual({ principal: null });
  });

  it("does not open a connection of a server with a token", async () => {
    const value = server({ token: TOKEN });
    expect(await value.admits({})).toBe(false);
    expect(await value.admits({ bearer: TOKEN })).toBe(true);
  });
});

describe("the local marker (CLI-1)", () => {
  it("passes a server with a token, without the request hook, and gives no principal", async () => {
    let hookCalls = 0;
    const value = server({ token: TOKEN, principalOf: () => (hookCalls++, undefined) });
    const response = await value.handle(request(LOCAL_CREDENTIALS));
    expect(response.payload).toEqual({ principal: null });
    expect(hookCalls).toBe(0);
  });

  it("lets the nested calls of a local request pass, with the principal of the caller", async () => {
    const response = await server({ token: TOKEN }).handle(request(LOCAL_CREDENTIALS, ["who", "nested"]));
    expect(response.payload).toEqual({ outer: null, inner: { principal: null } });
  });

  it("lets the nested calls of a network request pass, with the principal of the token", async () => {
    const response = await server({ token: TOKEN }).handle(request({ bearer: TOKEN }, ["who", "nested"]));
    expect(response.payload).toEqual({ outer: "token", inner: { principal: "token" } });
  });

  it("gives the credentials to the authenticate function, which can tell a local request", async () => {
    const value = server({ token: TOKEN, authenticate: (req) => (isLocalCredentials(req.credentials) ? { id: "local", via: "local" } : undefined) });
    expect((await value.handle(request(LOCAL_CREDENTIALS))).payload).toEqual({ principal: "local" });
    expect((await value.handle(request({ bearer: TOKEN }))).status).toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("is frozen", () => {
    expect(Object.isFrozen(LOCAL_CREDENTIALS)).toBe(true);
    expect(isLocalCredentials(LOCAL_CREDENTIALS)).toBe(true);
    expect(isLocalCredentials(undefined)).toBe(false);
    expect(isLocalCredentials({})).toBe(false);
  });
});

describe("a remote request cannot claim the local marker (CLI-1)", () => {
  it("does not survive JSON or structured clone, and no field named local is the marker", async () => {
    const json = JSON.parse(JSON.stringify(LOCAL_CREDENTIALS)) as Credentials;
    const cloned = structuredClone(LOCAL_CREDENTIALS);
    const named = JSON.parse('{"local":true,"LOCAL_MARKER":true,"@procedures/client.local-credentials":true}') as Credentials;
    for (const credentials of [json, cloned, named]) {
      expect(isLocalCredentials(credentials)).toBe(false);
      expect((await server({ token: TOKEN }).handle(request(credentials))).status).toMatchObject({ code: "UNAUTHORIZED" });
    }
  });

  it("is not in the credentials of a header, a cookie or a query that names it", () => {
    const credentials = requestCredentials(
      { headers: { local: "true", cookie: "local=true", "x-local": "1" }, url: "/api/who/ami?local=true&token=x" },
      { tokenQuery: "token" },
    );
    expect(isLocalCredentials(credentials)).toBe(false);
    expect(Object.getOwnPropertySymbols(credentials)).toEqual([]);
  });

  it("is refused over HTTP: a header, a cookie, the query, the metadata and the body cannot claim it", async () => {
    const value = server({ token: TOKEN });
    const http = createServer();
    const handler = procedureHandler(value);
    http.on("request", (req, res) => {
      if (!handler(req, res)) res.writeHead(404).end();
    });
    const port = await listen(http);
    const post = async (path: string, headers: Record<string, string>, body: unknown) => {
      const response = await fetch(`http://127.0.0.1:${port}${path}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
      return { status: response.status, body: (await response.json()) as Record<string, unknown> };
    };
    const metadata = encodeURIComponent(JSON.stringify({ credentials: { local: true }, local: true }));
    const attempts = [
      post("/api/who/ami", { local: "true" }, {}),
      post("/api/who/ami", { cookie: "local=true" }, {}),
      post("/api/who/ami?local=true", {}, {}),
      post("/api/who/ami", { "x-metadata": metadata }, {}),
      post("/api/who/ami", {}, { credentials: { local: true }, local: true }),
    ];
    for (const attempt of await Promise.all(attempts)) expect(attempt).toMatchObject({ status: 401, body: { code: "UNAUTHORIZED" } });
    // The token passes, and the call has the principal of the token
    expect(await post("/api/who/ami", { authorization: `Bearer ${TOKEN}` }, {})).toMatchObject({ status: 200 });
  });

  it("is refused over WebSocket: the query of the upgrade cannot claim it", async () => {
    const value = server({ token: TOKEN });
    const http = createServer();
    const ws = new WebSocketServerTransport(value, { server: http, path: "/ws" });
    value.addTransport(ws);
    await value.start();
    cleanups.push(() => value.stop());
    const port = await listen(http);
    const transport = new WebSocketTransport({ url: `ws://127.0.0.1:${port}/ws?local=true`, heartbeat: { enabled: false }, reconnect: { enabled: false } });
    cleanups.push(() => transport.close());
    const client = new Client({ transport, throwOnError: true });
    await expect(client.call(pathToMethod(["who", "ami"]), {})).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("the faces of the core (CLI-1)", () => {
  function portPair(serve: ProcedureServer, credentials?: Credentials) {
    const channel = new MessageChannel();
    const worker = new PortTransport(channel.port1, { serve, ...(credentials ? { credentials } : {}) });
    const page = new PortTransport(channel.port2);
    cleanups.push(async () => {
      await page.close();
      await worker.close();
      channel.port1.close();
      channel.port2.close();
    });
    return { channel, client: new Client({ transport: page, throwOnError: true }) };
  }

  it("PortTransport is a local face: a server with a token serves its calls", async () => {
    const { client } = portPair(server({ token: TOKEN }));
    expect(await client.call(pathToMethod(["who", "ami"]), {})).toEqual({ principal: null });
    expect(await client.call(pathToMethod(["who", "nested"]), {})).toEqual({ outer: null, inner: { principal: null } });
  });

  it("PortTransport with empty credentials is not local: the token applies, and a frame cannot claim the marker", async () => {
    const { channel, client } = portPair(server({ token: TOKEN }), {});
    await expect(client.call(pathToMethod(["who", "ami"]), {})).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    // A raw frame with credentials of its own: the side of the server sets the credentials
    const answer = new Promise<unknown>((resolve) => channel.port2.once("message", resolve));
    channel.port2.postMessage({ id: "raw", type: "request", method: pathToMethod(["who", "ami"]), payload: {}, metadata: {}, credentials: { local: true } });
    expect(await answer).toMatchObject({ id: "raw", type: "error", error: { code: "UNAUTHORIZED" } });
  });

  it("the calls of a WebSocket server to its client are not local: a server with a token refuses them", async () => {
    const remote = server();
    const http = createServer();
    const ws = new WebSocketServerTransport(remote, { server: http, path: "/ws" });
    remote.addTransport(ws);
    await remote.start();
    cleanups.push(() => remote.stop());
    const port = await listen(http);

    const connect = async (serve: ProcedureServer) => {
      const transport = new WebSocketTransport({ url: `ws://127.0.0.1:${port}/ws`, serve, heartbeat: { enabled: false }, reconnect: { enabled: false } });
      cleanups.push(() => transport.close());
      const before = new Set(ws.getTrackedConnections().map((connection) => connection.id));
      await new Client({ transport, throwOnError: true }).call(pathToMethod(["who", "ami"]), {});
      const id = ws.getTrackedConnections().find((connection) => !before.has(connection.id))!.id;
      return new Client({ transport: ws.transportFor(id), throwOnError: true });
    };
    const withToken = await connect(server({ token: TOKEN }));
    await expect(withToken.call(pathToMethod(["who", "ami"]), {})).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    const withoutToken = await connect(server());
    expect(await withoutToken.call(pathToMethod(["who", "ami"]), {})).toEqual({ principal: null });
  });

  it("the key of the marker is one symbol for each copy of the package", () => {
    expect(LOCAL_MARKER).toBe(Symbol.for("@procedures/client.local-credentials"));
  });
});
