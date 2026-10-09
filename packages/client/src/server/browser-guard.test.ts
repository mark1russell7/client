/**
 * The browser checks of the server transports. Before, a "simple" cross-site POST with a
 * text/plain body ran any procedure on a loopback server, and any web page could open a
 * WebSocket connection to it.
 */

import { describe, it, expect, afterEach } from "vitest";
import { createServer, request, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { WebSocket as WsSocket } from "ws";
import { HttpServerTransport } from "../adapters/http/server/index.js";
import { WebSocketServerTransport } from "../adapters/websocket/server/transport.js";
import { ProcedureServer } from "./procedure-server.js";
import { ProcedureRegistry } from "../procedures/registry.js";
import { defineProcedure } from "../procedures/define.js";
import { outputSchema } from "../procedures/core/schemas.js";
import { checkBrowserRequest, isLoopbackAddress, type BrowserGuardOptions } from "./browser-guard.js";

let cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup().catch(() => {});
  cleanups = [];
});

/** A server whose one procedure counts its calls. */
function makeServer(): { server: ProcedureServer; calls: { count: number } } {
  const calls = { count: 0 };
  const registry = new ProcedureRegistry();
  registry.register(
    defineProcedure({
      path: ["t", "run"],
      input: outputSchema<unknown>(),
      output: outputSchema<unknown>(),
      handler: (input: unknown) => {
        calls.count++;
        return { ran: input ?? null };
      },
    })
  );
  return { server: new ProcedureServer({ registry, autoRegister: true }), calls };
}

async function listen(http: HttpServer): Promise<number> {
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", () => resolve()));
  cleanups.push(async () => {
    http.closeAllConnections();
    await new Promise<void>((resolve) => http.close(() => resolve()));
  });
  return (http.address() as AddressInfo).port;
}

async function startHttp(options: Partial<ConstructorParameters<typeof HttpServerTransport>[1]> = {}) {
  const { server, calls } = makeServer();
  const app = express();
  const http = createServer(app);
  server.addTransport(new HttpServerTransport(server, { app, httpServer: http, ...options }));
  await server.start();
  const port = await listen(http);
  return { port, calls };
}

/** A raw HTTP request, with the headers that a browser would send. */
function send(
  port: number,
  method: string,
  headers: Record<string, string>,
  body?: string
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, method, path: "/api/t/run", headers }, (res) => {
      let text = "";
      res.on("data", (chunk) => (text += chunk));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: text }));
    });
    req.on("error", reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

describe("HTTP server transport: browser checks", () => {
  it("answers a JSON POST from a program (no Origin)", async () => {
    const { port, calls } = await startHttp();
    const res = await send(port, "POST", { "content-type": "application/json" }, '{"a":1}');
    expect(res.status).toBe(200);
    expect(calls.count).toBe(1);
  });

  it("refuses a text/plain body, the cross-site 'simple' POST, and runs nothing", async () => {
    const { port, calls } = await startHttp();
    const res = await send(port, "POST", { "content-type": "text/plain" }, '{"command":"calc"}');
    expect(res.status).toBe(415);
    expect(calls.count).toBe(0);
  });

  it("refuses a page of another origin, and accepts the server's own origin", async () => {
    const { port, calls } = await startHttp();
    const json = { "content-type": "application/json" };
    expect((await send(port, "POST", { ...json, origin: "https://evil.example" }, "{}")).status).toBe(403);
    expect((await send(port, "POST", { ...json, origin: `http://localhost:${port}`, host: `localhost:${port}` }, "{}")).status).toBe(200);
    expect(calls.count).toBe(1);
  });

  it("refuses a cross-site request that has no Origin (an image tag or a form)", async () => {
    const { port, calls } = await startHttp({ allowGet: true });
    const res = await send(port, "GET", { "sec-fetch-site": "cross-site" });
    expect(res.status).toBe(403);
    expect(calls.count).toBe(0);
  });

  it("refuses a GET call unless allowGet is set", async () => {
    const closed = await startHttp();
    expect((await send(closed.port, "GET", {})).status).toBe(405);
    expect(closed.calls.count).toBe(0);
    const open = await startHttp({ allowGet: true });
    expect((await send(open.port, "GET", {})).status).toBe(200);
  });

  it("refuses another host name on a loopback address (DNS rebinding)", async () => {
    const { port, calls } = await startHttp();
    const res = await send(port, "POST", { "content-type": "application/json", host: `rebind.evil.example:${port}` }, "{}");
    expect(res.status).toBe(403);
    expect(calls.count).toBe(0);
  });

  it("accepts the origins of allowedOrigins and of the CORS list", async () => {
    const json = { "content-type": "application/json", origin: "https://app.example" };
    const listed = await startHttp({ allowedOrigins: ["https://app.example"] });
    expect((await send(listed.port, "POST", json, "{}")).status).toBe(200);
    const cors = await startHttp({ cors: true, corsOptions: { origin: ["https://app.example"] } });
    expect((await send(cors.port, "POST", json, "{}")).status).toBe(200);
    expect((await send(cors.port, "POST", { ...json, origin: "https://other.example" }, "{}")).status).toBe(403);
  });
});

describe("WebSocket server transport: browser checks", () => {
  async function startWs(options: Partial<ConstructorParameters<typeof WebSocketServerTransport>[1]> = {}) {
    const { server } = makeServer();
    const http = createServer();
    const transport = new WebSocketServerTransport(server, { server: http, path: "/ws", ...options });
    server.addTransport(transport);
    await server.start();
    const port = await listen(http);
    cleanups.push(() => transport.stop());
    return port;
  }

  /** "open" or the HTTP status of the refused upgrade. */
  function connect(port: number, headers: Record<string, string> = {}): Promise<string | number> {
    return new Promise((resolve) => {
      const ws = new WsSocket(`ws://127.0.0.1:${port}/ws`, { headers });
      ws.on("open", () => {
        ws.close();
        resolve("open");
      });
      ws.on("unexpected-response", (_req, res) => resolve(res.statusCode ?? 0));
      ws.on("error", () => resolve("error"));
    });
  }

  it("refuses a connection from a page of another origin", async () => {
    const port = await startWs();
    expect(await connect(port, { origin: "https://evil.example" })).toBe(403);
  });

  it("accepts a program, the server's own origin and an allowed origin", async () => {
    const port = await startWs({ allowedOrigins: ["https://app.example"] });
    expect(await connect(port)).toBe("open");
    expect(await connect(port, { origin: `http://127.0.0.1:${port}` })).toBe("open");
    expect(await connect(port, { origin: "https://app.example" })).toBe("open");
  });

  it("refuses another host name on a loopback address, and runs authenticate after the checks", async () => {
    let authenticated = 0;
    const port = await startWs({
      authenticate: () => {
        authenticated++;
        return true;
      },
    });
    expect(await connect(port, { host: "rebind.evil.example" })).toBe(403);
    expect(authenticated).toBe(0);
    expect(await connect(port)).toBe("open");
    expect(authenticated).toBe(1);
  });
});

describe("checkBrowserRequest", () => {
  const loopback = { localAddress: "127.0.0.1" };
  const check = (headers: Record<string, string>, options: BrowserGuardOptions = {}, method = "POST") =>
    checkBrowserRequest({ method, headers, socket: loopback }, options, true);

  it("reads loopback addresses, also IPv4 in IPv6", () => {
    expect(isLoopbackAddress("127.0.0.1")).toBe(true);
    expect(isLoopbackAddress("::1")).toBe(true);
    expect(isLoopbackAddress("::ffff:127.0.0.1")).toBe(true);
    expect(isLoopbackAddress("192.168.1.5")).toBe(false);
  });

  it("checks the host only on a loopback address", () => {
    expect(check({ host: "evil.example" }).ok).toBe(false);
    expect(check({ host: "evil.example" }, { allowedHosts: ["evil.example"] }).ok).toBe(true);
    expect(checkBrowserRequest({ method: "POST", headers: { host: "my-server.lan" }, socket: { localAddress: "192.168.1.5" } }, {}, true).ok).toBe(true);
  });

  it("refuses the origin 'null' (a sandboxed frame or a file) unless every origin is allowed", () => {
    expect(check({ host: "localhost", origin: "null" }).ok).toBe(false);
    expect(check({ host: "localhost", origin: "null" }, { allowedOrigins: "*" }).ok).toBe(true);
  });

  it("accepts JSON types with parameters and +json types", () => {
    expect(check({ host: "localhost", "content-type": "application/json; charset=utf-8", "content-length": "2" }).ok).toBe(true);
    expect(check({ host: "localhost", "content-type": "application/merge-patch+json", "content-length": "2" }).ok).toBe(true);
    expect(check({ host: "localhost", "content-type": "application/x-www-form-urlencoded", "content-length": "2" }).ok).toBe(false);
  });
});
