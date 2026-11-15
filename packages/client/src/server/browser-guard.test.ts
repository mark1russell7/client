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
import { checkBrowserRequest, isLoopbackAddress, type BrowserGuardOptions, type GuardResult } from "./browser-guard.js";

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

/** The status and the error fields of a refused request. */
function refusalOf(res: { status: number; body: string }): { status: number; code?: unknown; reason?: unknown; retryable?: unknown } {
  const body = JSON.parse(res.body) as { code?: unknown; reason?: unknown; retryable?: unknown };
  return { status: res.status, code: body.code, reason: body.reason, retryable: body.retryable };
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
    // CLI-4: FORBIDDEN of wire v1 with its reason. Before, the code was UNSUPPORTED_MEDIA_TYPE (415).
    expect(refusalOf(res)).toEqual({ status: 403, code: "FORBIDDEN", reason: "media-type-not-allowed", retryable: false });
    expect(calls.count).toBe(0);
  });

  it("refuses a page of another origin, and accepts the server's own origin", async () => {
    const { port, calls } = await startHttp();
    const json = { "content-type": "application/json" };
    // CLI-4: before, the code was FORBIDDEN_ORIGIN
    expect(refusalOf(await send(port, "POST", { ...json, origin: "https://evil.example" }, "{}"))).toEqual({ status: 403, code: "FORBIDDEN", reason: "origin-not-allowed", retryable: false });
    expect((await send(port, "POST", { ...json, origin: `http://localhost:${port}`, host: `localhost:${port}` }, "{}")).status).toBe(200);
    expect(calls.count).toBe(1);
  });

  it("refuses a cross-site request that has no Origin (an image tag or a form)", async () => {
    const { port, calls } = await startHttp({ allowGet: true });
    const res = await send(port, "GET", { "sec-fetch-site": "cross-site" });
    expect(refusalOf(res)).toMatchObject({ status: 403, code: "FORBIDDEN", reason: "origin-not-allowed" });
    expect(calls.count).toBe(0);
  });

  it("refuses a GET call unless allowGet is set", async () => {
    const closed = await startHttp();
    // CLI-4: FORBIDDEN of wire v1 with its reason. Before, the code was METHOD_NOT_ALLOWED (405).
    expect(refusalOf(await send(closed.port, "GET", {}))).toEqual({ status: 403, code: "FORBIDDEN", reason: "method-not-allowed", retryable: false });
    expect(closed.calls.count).toBe(0);
    const open = await startHttp({ allowGet: true });
    expect((await send(open.port, "GET", {})).status).toBe(200);
  });

  it("refuses another host name on a loopback address (DNS rebinding)", async () => {
    const { port, calls } = await startHttp();
    const res = await send(port, "POST", { "content-type": "application/json", host: `rebind.evil.example:${port}` }, "{}");
    // CLI-4: before, the code was FORBIDDEN_HOST
    expect(refusalOf(res)).toEqual({ status: 403, code: "FORBIDDEN", reason: "host-header-not-allowed", retryable: false });
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

describe("HTTP server transport: CORS preflight", () => {
  it("allows the headers that HttpTransport sends from the metadata (X-Metadata for pagination)", async () => {
    const { port } = await startHttp({ cors: true, corsOptions: { origin: ["https://app.example"] } });
    const res = await new Promise<{ status: number; allow: string }>((resolve, reject) => {
      const req = request(
        { host: "127.0.0.1", port, method: "OPTIONS", path: "/api/t/run", headers: { origin: "https://app.example", "access-control-request-headers": "x-metadata" } },
        (r) => {
          r.resume();
          r.on("end", () => resolve({ status: r.statusCode ?? 0, allow: String(r.headers["access-control-allow-headers"] ?? "") }));
        }
      );
      req.on("error", reject);
      req.end();
    });
    expect(res.status).toBe(204);
    expect(res.allow.split(", ")).toEqual(expect.arrayContaining(["X-Metadata", "X-Request-Id", "Accept"]));
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

  // A request on a socket with this local address
  const on = (localAddress: string, headers: Record<string, string>, options: BrowserGuardOptions = {}) =>
    checkBrowserRequest({ method: "POST", headers: { "content-type": "application/json", "content-length": "2", ...headers }, socket: { localAddress } }, options, true);
  const reasonOf = (result: GuardResult) => (result.ok ? "ok" : result.reason);

  it("checks the host on a loopback address", () => {
    expect(check({ host: "evil.example" }).ok).toBe(false);
    expect(check({ host: "evil.example" }, { allowedHosts: ["evil.example"] }).ok).toBe(true);
  });

  it("checks the host on a LAN address too: a DNS rebinding page is not the origin of the server", () => {
    // The page http://evil.example:3000 after its name resolves to the LAN address of the host
    const rebound = { host: "evil.example:3000", origin: "http://evil.example:3000" };
    expect(reasonOf(on("192.168.1.20", rebound))).toBe("host-header-not-allowed");
    expect(reasonOf(on("::ffff:192.168.1.20", rebound))).toBe("host-header-not-allowed");
    expect(reasonOf(on("fe80::1", rebound))).toBe("host-header-not-allowed");
    expect(reasonOf(on("192.168.1.5", { host: "my-server.lan" }))).toBe("host-header-not-allowed");
    // A request with no Host header names no permitted host
    expect(reasonOf(on("192.168.1.20", {}))).toBe("host-header-not-allowed");
  });

  it("accepts the loopback names and the IP addresses on each listener", () => {
    for (const local of ["127.0.0.1", "::1", "192.168.1.20", "::ffff:192.168.1.20", "172.17.0.2"]) {
      for (const host of ["localhost:3000", "127.0.0.1:3000", "[::1]:3000", "LOCALHOST", "192.168.1.20:3000", "10.0.0.7", "[fe80::1]:3000", "[::ffff:c0a8:114]"]) {
        expect(reasonOf(on(local, { host })), `${host} on ${local}`).toBe("ok");
      }
    }
    // The page of an IP address is the origin of the server at that address
    expect(reasonOf(on("192.168.1.20", { host: "192.168.1.20:3000", origin: "http://192.168.1.20:3000" }))).toBe("ok");
  });

  it("refuses a name that only looks like an IP address", () => {
    for (const host of ["1.2.3.4.evil.example", "256.1.1.1", "1.2.3", "1.2.3.4.5", "0x7f.0.0.1", "[evil.example]", "[]", "[:]x", "127.0.0.1.nip.io"]) {
      expect(reasonOf(on("192.168.1.20", { host })), host).toBe("host-header-not-allowed");
    }
  });

  it("accepts a name of allowedHosts on each listener, in any case, and each name with '*'", () => {
    const options: BrowserGuardOptions = { allowedHosts: ["My-Server.lan"] };
    expect(reasonOf(on("192.168.1.5", { host: "my-server.lan:3000" }, options))).toBe("ok");
    expect(reasonOf(on("192.168.1.5", { host: "MY-SERVER.LAN" }, options))).toBe("ok");
    expect(reasonOf(on("127.0.0.1", { host: "my-server.lan" }, options))).toBe("ok");
    expect(reasonOf(on("192.168.1.5", { host: "other.lan" }, options))).toBe("host-header-not-allowed");
    expect(reasonOf(on("192.168.1.5", { host: "other.lan" }, { allowedHosts: "*" }))).toBe("ok");
  });

  it("names allowedHosts and --allowed-host in the refusal of a name", () => {
    const refused = on("192.168.1.5", { host: "My-Server.lan:3000" });
    expect(refused.ok === false && refused.message).toBe(
      'Forbidden: the host "my-server.lan" is not allowed. To permit it, add it to allowedHosts of the host policy, or start the server with --allowed-host my-server.lan'
    );
    const noHost = on("192.168.1.5", {});
    expect(noHost.ok === false && noHost.message).toBe("Forbidden: the request has no Host header");
  });

  it("refuses the origin 'null' (a sandboxed frame or a file) unless every origin is allowed", () => {
    expect(check({ host: "localhost", origin: "null" }).ok).toBe(false);
    expect(check({ host: "localhost", origin: "null" }, { allowedOrigins: "*" }).ok).toBe(true);
  });

  it("refuses with FORBIDDEN of wire v1, the status 403 and the reason of the check (CLI-4)", () => {
    const refused = (headers: Record<string, string>, method = "POST") => {
      const result = check(headers, {}, method);
      return result.ok ? result : { status: result.status, code: result.code, reason: result.reason };
    };
    expect(refused({ host: "evil.example" })).toEqual({ status: 403, code: "FORBIDDEN", reason: "host-header-not-allowed" });
    expect(refused({ host: "localhost", origin: "https://evil.example" })).toEqual({ status: 403, code: "FORBIDDEN", reason: "origin-not-allowed" });
    expect(refused({ host: "localhost", "sec-fetch-site": "cross-site" })).toEqual({ status: 403, code: "FORBIDDEN", reason: "origin-not-allowed" });
    expect(refused({ host: "localhost" }, "GET")).toEqual({ status: 403, code: "FORBIDDEN", reason: "method-not-allowed" });
    expect(refused({ host: "localhost", "content-type": "text/plain", "content-length": "2" })).toEqual({ status: 403, code: "FORBIDDEN", reason: "media-type-not-allowed" });
  });

  it("accepts JSON types with parameters and +json types", () => {
    expect(check({ host: "localhost", "content-type": "application/json; charset=utf-8", "content-length": "2" }).ok).toBe(true);
    expect(check({ host: "localhost", "content-type": "application/merge-patch+json", "content-length": "2" }).ok).toBe(true);
    expect(check({ host: "localhost", "content-type": "application/x-www-form-urlencoded", "content-length": "2" }).ok).toBe(false);
  });
});
