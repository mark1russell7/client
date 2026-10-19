/**
 * CSRF with cookies (CLI-2a review): ambient credentials are trusted only from a named origin. A
 * CORS or browser-check origin "*" does not let another site send a request with the cookies of the
 * user, at run time. A server that reads the cookies of each request (`principalOf`) with "*" is
 * refused at construction.
 */

import { describe, it, expect, afterEach } from "vitest";
import { createServer, request, type IncomingMessage, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { z } from "zod";
import { WebSocket as WsClient } from "ws";
import { createProcedure } from "../procedures/define.js";
import { createRegistry } from "../procedures/module.js";
import { ProcedureServer, type ProcedureServerOptions } from "./procedure-server.js";
import { checkBrowserRequest, hasAmbientCredentials } from "./browser-guard.js";
import { procedureHandler, type ProcedureHandlerOptions } from "../adapters/http/server/handler.js";
import { HttpServerTransport } from "../adapters/http/server/transport.js";
import { upgradeHandler, type UpgradeHandlerOptions } from "../adapters/websocket/server/upgrade.js";
import { WebSocketServerTransport } from "../adapters/websocket/server/transport.js";
import type { WebSocketServerTransportOptions } from "../adapters/websocket/server/types.js";

const FOREIGN = "https://evil.example";
const APP = "https://app.example";
const COOKIE = "session=s-1";

function procedureServer(options: ProcedureServerOptions = {}): { server: ProcedureServer; runs: () => number } {
  let runs = 0;
  const registry = createRegistry({
    name: "csrf",
    procedures: [
      createProcedure()
        .path(["csrf", "write"])
        .input(z.unknown())
        .output(z.number())
        .meta({ effects: { writes: ["data"] } })
        .handler(async () => ++runs)
        .build(),
    ],
  });
  const server = new ProcedureServer({ registry, ...options });
  server.registerFromRegistry();
  return { server, runs: () => runs };
}

/** A cookie session: the cookie of the user gives the principal. */
const cookieSession: ProcedureServerOptions = {
  principalOf: ({ cookies = {} }) => (cookies["session"] === "s-1" ? { principal: { id: "user:1", via: "session" } } : undefined),
};

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

async function startHandler(server: ProcedureServer, options: ProcedureHandlerOptions): Promise<number> {
  const handler = procedureHandler(server, options);
  cleanups.push(() => handler.close());
  return listen(
    createServer((req, res) => {
      if (!handler(req, res)) res.end("app");
    })
  );
}

/** One POST: the status and the reason or the code of the body. */
function post(port: number, headers: Record<string, string>, body = "{}"): Promise<{ status: number; code?: string; reason?: string }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, method: "POST", path: "/api/csrf/write", headers }, (res: IncomingMessage) => {
      let text = "";
      res.setEncoding("utf8");
      res.on("data", (chunk: string) => (text += chunk));
      res.on("end", () => {
        const parsed = (() => {
          try {
            return JSON.parse(text) as { code?: string; reason?: string };
          } catch {
            return {};
          }
        })();
        resolve({ status: res.statusCode ?? 0, ...(parsed.code ? { code: parsed.code } : {}), ...(parsed.reason ? { reason: parsed.reason } : {}) });
      });
    });
    req.on("error", reject);
    req.end(body);
  });
}

const JSON_TYPE = { "content-type": "application/json" };

describe("CSRF: procedureHandler with cookies (CLI-2a)", () => {
  it("refuses a foreign origin with a cookie when CORS is \"*\", for JSON and for a simple form request", async () => {
    const { server, runs } = procedureServer();
    const port = await startHandler(server, { cors: true });
    expect(await post(port, { ...JSON_TYPE, origin: FOREIGN, cookie: COOKIE })).toEqual({ status: 403, code: "FORBIDDEN", reason: "origin-not-allowed" });
    const form = await post(port, { "content-type": "application/x-www-form-urlencoded", origin: FOREIGN, cookie: COOKIE }, "a=1");
    expect(form).toEqual({ status: 403, code: "FORBIDDEN", reason: "origin-not-allowed" });
    // A browser request without an Origin header: the fetch site tells that another site sent it
    expect(await post(port, { ...JSON_TYPE, "sec-fetch-site": "cross-site", cookie: COOKIE })).toEqual({ status: 403, code: "FORBIDDEN", reason: "origin-not-allowed" });
    expect(runs()).toBe(0);
  });

  it("accepts a cookie-free bearer request from each origin with \"*\", as before", async () => {
    const { server, runs } = procedureServer({ token: "t-1" });
    const port = await startHandler(server, { cors: true });
    expect((await post(port, { ...JSON_TYPE, origin: FOREIGN, authorization: "Bearer t-1" })).status).toBe(200);
    expect(runs()).toBe(1);
  });

  it("accepts the cookie of a named origin, from a list or from a function, and refuses another origin", async () => {
    const { server, runs } = procedureServer(cookieSession);
    const listed = await startHandler(server, { cors: { origin: [APP], credentials: true } });
    expect((await post(listed, { ...JSON_TYPE, origin: APP, cookie: COOKIE })).status).toBe(200);
    expect(await post(listed, { ...JSON_TYPE, origin: FOREIGN, cookie: COOKIE })).toMatchObject({ status: 403, reason: "origin-not-allowed" });
    // With principalOf, a request without a cookie from another origin is refused too
    expect(await post(listed, { ...JSON_TYPE, origin: FOREIGN })).toMatchObject({ status: 403, reason: "origin-not-allowed" });
    const decided = await startHandler(server, { cors: { origin: (origin) => origin === APP } });
    expect((await post(decided, { ...JSON_TYPE, origin: APP, cookie: COOKIE })).status).toBe(200);
    expect(runs()).toBe(2);
  });

  it("accepts the cookie of a program without an Origin header, and of the server's own origin", async () => {
    const { server } = procedureServer(cookieSession);
    const port = await startHandler(server, { cors: { origin: [APP] } });
    expect((await post(port, { ...JSON_TYPE, cookie: COOKIE })).status).toBe(200);
    expect((await post(port, { ...JSON_TYPE, cookie: COOKIE, origin: `http://127.0.0.1:${port}`, host: `127.0.0.1:${port}` })).status).toBe(200);
  });

  it("refuses principalOf with the origin \"*\" at construction, and names the fix", () => {
    const { server } = procedureServer(cookieSession);
    expect(() => procedureHandler(server, { cors: true })).toThrow(/principalOf.*"\*".*cors\.origin or allowedOrigins/);
    expect(() => procedureHandler(server, { cors: { origin: "*" } })).toThrow(/CSRF/);
    expect(() => procedureHandler(server, { allowedOrigins: "*" })).toThrow(/CSRF/);
    expect(() => procedureHandler(server, { cors: true, allowedOrigins: [APP] })).not.toThrow();
    expect(() => procedureHandler(server)).not.toThrow();
  });
});

describe("CSRF: the Express shim HttpServerTransport (CLI-2a)", () => {
  async function startShim(server: ProcedureServer): Promise<number> {
    const app = express();
    const http = createServer(app);
    const transport = new HttpServerTransport(server, { app, httpServer: http, cors: true });
    await transport.start();
    cleanups.push(() => transport.stop());
    return listen(http);
  }

  it("keeps its former checks for a server that reads no cookies", async () => {
    const { server } = procedureServer();
    const port = await startShim(server);
    expect((await post(port, { ...JSON_TYPE, origin: FOREIGN, cookie: COOKIE })).status).toBe(200);
  });

  it("refuses a foreign origin with a cookie when authenticate can read it, with FORBIDDEN and its reason (CLI-4)", async () => {
    const { server } = procedureServer({ authenticate: () => ({ id: "user", via: "test" }) });
    expect(server.ambientCredentials).toBe("cookies");
    const port = await startShim(server);
    expect(await post(port, { ...JSON_TYPE, origin: FOREIGN, cookie: COOKIE })).toEqual({ status: 403, code: "FORBIDDEN", reason: "origin-not-allowed" });
    expect((await post(port, { ...JSON_TYPE, origin: FOREIGN })).status).toBe(200);
  });

  it("keeps the former checks when the server says that it reads no cookies", async () => {
    const { server } = procedureServer({ authenticate: () => ({ id: "user", via: "test" }), ambientCredentials: false });
    expect(server.ambientCredentials).toBeUndefined();
    const port = await startShim(server);
    expect((await post(port, { ...JSON_TYPE, origin: FOREIGN, cookie: COOKIE })).status).toBe(200);
  });

  it("refuses principalOf with the CORS origin \"*\" at construction", () => {
    const { server } = procedureServer(cookieSession);
    expect(server.ambientCredentials).toBe("always");
    expect(() => new HttpServerTransport(server, { app: express(), cors: true })).toThrow(/HttpServerTransport.*corsOptions\.origin or allowedOrigins/);
    expect(() => new HttpServerTransport(server, { app: express(), cors: true, corsOptions: { origin: [APP] } })).not.toThrow();
  });
});

describe("CSRF: the WebSocket upgrade (CLI-2a)", () => {
  async function startUpgrade(server: ProcedureServer, options: UpgradeHandlerOptions): Promise<number> {
    const handler = upgradeHandler(server, { path: "/ws", heartbeat: false, ...options });
    cleanups.push(() => handler.close());
    const http = createServer();
    http.on("upgrade", (req, socket, head) => {
      if (!handler(req, socket, head)) socket.destroy();
    });
    return listen(http);
  }

  async function startTransport(server: ProcedureServer, options: Omit<WebSocketServerTransportOptions, "server">): Promise<number> {
    const http = createServer();
    const transport = new WebSocketServerTransport(server, { server: http, path: "/ws", heartbeat: false, ...options });
    await transport.start();
    cleanups.push(() => transport.stop());
    return listen(http);
  }

  /** "open" or the HTTP status of the refused upgrade. */
  function connect(port: number, headers: Record<string, string>): Promise<string | number> {
    return new Promise((resolve) => {
      const ws = new WsClient(`ws://127.0.0.1:${port}/ws`, { headers });
      ws.on("open", () => {
        ws.close();
        resolve("open");
      });
      ws.on("unexpected-response", (_req, res) => resolve(res.statusCode ?? 0));
      ws.on("error", () => resolve("error"));
    });
  }

  it("upgradeHandler: refuses a foreign origin with a cookie for \"*\", and accepts it without a cookie", async () => {
    const { server } = procedureServer();
    const port = await startUpgrade(server, { allowedOrigins: "*" });
    expect(await connect(port, { origin: FOREIGN, cookie: COOKIE })).toBe(403);
    expect(await connect(port, { origin: FOREIGN })).toBe("open");
  });

  it("upgradeHandler with principalOf: refuses \"*\" at construction, and accepts the cookie of a named origin", async () => {
    const { server } = procedureServer(cookieSession);
    expect(() => upgradeHandler(server, { path: "/ws", allowedOrigins: "*" })).toThrow(/WebSocketServerTransport.*CSRF/);
    const port = await startUpgrade(server, { allowedOrigins: [APP] });
    expect(await connect(port, { origin: APP, cookie: COOKIE })).toBe("open");
    expect(await connect(port, { origin: FOREIGN, cookie: COOKIE })).toBe(403);
  });

  it("WebSocketServerTransport: keeps its former checks without an auth path, and refuses the cookie for authenticate", async () => {
    const { server } = procedureServer();
    const open = await startTransport(server, { allowedOrigins: "*" });
    expect(await connect(open, { origin: FOREIGN, cookie: COOKIE })).toBe("open");
    const guarded = await startTransport(server, { allowedOrigins: "*", authenticate: () => true });
    expect(await connect(guarded, { origin: FOREIGN, cookie: COOKIE })).toBe(403);
    expect(await connect(guarded, { origin: FOREIGN })).toBe("open");
  });
});

describe("CSRF: the browser checks (CLI-2a)", () => {
  const loopback = { localAddress: "127.0.0.1" };
  it("does not let \"*\" allow another origin for a request with ambient credentials", () => {
    const headers = { host: "localhost:3000", origin: FOREIGN, "content-type": "application/json" };
    expect(checkBrowserRequest({ method: "POST", headers, socket: loopback }, { allowedOrigins: "*" }, true).ok).toBe(true);
    expect(checkBrowserRequest({ method: "POST", headers, socket: loopback }, { allowedOrigins: "*" }, true, true)).toMatchObject({ ok: false, status: 403, code: "FORBIDDEN", reason: "origin-not-allowed" });
    expect(checkBrowserRequest({ method: "POST", headers, socket: loopback }, { allowedOrigins: [FOREIGN] }, true, true).ok).toBe(true);
    const site = { host: "localhost:3000", "sec-fetch-site": "cross-site" };
    expect(checkBrowserRequest({ method: "POST", headers: site, socket: loopback }, { allowedOrigins: "*" }, true, true).ok).toBe(false);
  });

  it("finds ambient credentials in a Cookie header", () => {
    expect(hasAmbientCredentials({ cookie: "a=1" })).toBe(true);
    expect(hasAmbientCredentials({ cookie: " " })).toBe(false);
    expect(hasAmbientCredentials({ authorization: "Bearer x" })).toBe(false);
  });
});
