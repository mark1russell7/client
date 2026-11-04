/**
 * The request checks of a peer, against a real peer on 127.0.0.1 (deep dive TRN-1, CLI-1, CLI-2, CLI-2b).
 *
 * Before: CORS `*` by default, no Host check, no token. Any web page could call a loopback
 * server, and with `mark --server` that included `shell.exec`.
 *
 * Since CLI-2b the peer has no checks of its own. The browser checks of the core and the admission
 * of the server of its host check each request one time. The origin rule of the peer (a loopback
 * origin, or an origin of the list) is data for the browser checks of the core.
 */

import { describe, it, expect, afterEach } from "vitest";
import { randomBytes } from "node:crypto";
import { request } from "node:http";
import { ProcedureRegistry, defineProcedure, hostPolicy, outputSchema, type HostPolicy } from "@procedures/client";
import { createPeer, type Peer } from "./index.js";

const TOKEN = "test-token-0123456789";

/**
 * The port of a face of a started peer. Each transport of the peer listens on port 0, so no other
 * test or process takes the port between a probe and the listen (EADDRINUSE on CI). Faces with port
 * 0 do not share a listener, so the HTTP face and the WebSocket face have different ports.
 */
function portOf(peer: Peer, type: "http" | "websocket"): number {
  const endpoint = peer.getEndpoints().find((candidate) => candidate.type === type);
  const port = Number(new URL(endpoint!.address).port);
  expect(port).toBeGreaterThan(0);
  return port;
}

/** A raw HTTP request, so the test controls the Host and Origin headers. */
function send(port: number, path: string, headers: Record<string, string>, body?: string): Promise<{ status: number; body: string; headers: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, path, method: body === undefined ? "GET" : "POST", headers }, (res) => {
      let text = "";
      res.on("data", (chunk: Buffer) => (text += chunk.toString()));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: text, headers: res.headers }));
    });
    req.on("error", reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

/** The status of an upgrade: 101 when the connection opens, else the status of the refusal. */
function upgrade(port: number, path: string, headers: Record<string, string>): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = request({
      host: "127.0.0.1",
      port,
      path,
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

let peers: Peer[] = [];
afterEach(async () => {
  for (const peer of peers) await peer.stop();
  peers = [];
});

/** A peer with an HTTP transport and a WebSocket transport, with the token. It gives the port of each. */
async function startPeer(options: { policy?: HostPolicy; corsOrigins?: string[] } = {}): Promise<{ port: number; wsPort: number }> {
  const registry = new ProcedureRegistry();
  registry.register(
    defineProcedure({
      path: ["test", "echo"],
      input: outputSchema<{ text: string }>(),
      output: outputSchema<string>(),
      handler: (input: { text: string }) => input.text,
    }),
  );
  const peer = await createPeer({
    id: "peer-test",
    registry,
    autoRegister: true,
    ...(options.policy ? { policy: options.policy } : {}),
    transports: [
      { type: "http", port: 0, host: "127.0.0.1", token: TOKEN, ...(options.corsOrigins ? { corsOrigins: options.corsOrigins } : {}) },
      { type: "websocket", port: 0, host: "127.0.0.1", token: TOKEN },
    ],
  });
  await peer.start();
  peers.push(peer);
  return { port: portOf(peer, "http"), wsPort: portOf(peer, "websocket") };
}

const json = { "Content-Type": "application/json" };
const call = JSON.stringify({ text: "hi" });

describe("peer request checks", () => {
  it("answers a call with the token", async () => {
    const { port } = await startPeer();
    const response = await send(port, "/api/test/echo", { ...json, Host: `127.0.0.1:${port}`, Authorization: `Bearer ${TOKEN}` }, call);
    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toBe("hi");
  });

  it("refuses a call without the token, or with a wrong one", async () => {
    const { port, wsPort } = await startPeer();
    expect((await send(port, "/api/test/echo", { ...json, Host: `127.0.0.1:${port}` }, call)).status).toBe(401);
    expect((await send(port, "/api/test/echo", { ...json, Host: `127.0.0.1:${port}`, Authorization: "Bearer wrong" }, call)).status).toBe(401);
    expect(await upgrade(wsPort, "/ws", { Host: `127.0.0.1:${wsPort}` })).toBe(401);
    expect(await upgrade(wsPort, "/ws?token=wrong", { Host: `127.0.0.1:${wsPort}` })).toBe(401);
    expect(await upgrade(wsPort, `/ws?token=${TOKEN}`, { Host: `127.0.0.1:${wsPort}` })).toBe(101);
  });

  it("refuses a request addressed to another host name (DNS rebinding)", async () => {
    const { port, wsPort } = await startPeer();
    const response = await send(port, "/api/test/echo", { ...json, Host: `attacker.example:${port}`, Authorization: `Bearer ${TOKEN}` }, call);
    expect(response.status).toBe(403);
    expect(await upgrade(wsPort, `/ws?token=${TOKEN}`, { Host: `attacker.example:${wsPort}` })).toBe(403);
  });

  it("refuses a request from a web page of another origin, and sends no CORS header", async () => {
    const { port, wsPort } = await startPeer();
    const response = await send(
      port,
      "/api/test/echo",
      { ...json, Host: `127.0.0.1:${port}`, Origin: "https://evil.example", Authorization: `Bearer ${TOKEN}` },
      call,
    );
    expect(response.status).toBe(403);
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    expect(await upgrade(wsPort, `/ws?token=${TOKEN}`, { Host: `127.0.0.1:${wsPort}`, Origin: "https://evil.example" })).toBe(403);
  });

  it("permits a web page of a loopback origin, and an origin of the list: the rule of the peer is data for the core check", async () => {
    const { port, wsPort } = await startPeer({ corsOrigins: ["https://mark1russell7.github.io"] });
    const headers = { ...json, Host: `127.0.0.1:${port}`, Authorization: `Bearer ${TOKEN}` };
    for (const origin of ["http://localhost:5173", "http://127.0.0.1:8080", "http://[::1]:3000", "https://mark1russell7.github.io"]) {
      expect((await send(port, "/api/test/echo", { ...headers, Origin: origin }, call)).status, origin).toBe(200);
    }
    expect((await send(port, "/api/test/echo", { ...headers, Origin: "https://mark1russell7.github.io.evil.example" }, call)).status).toBe(403);
    expect((await send(port, "/api/test/echo", { ...headers, Origin: "not a url" }, call)).status).toBe(403);
    // The WebSocket face has the same rule for loopback origins
    expect(await upgrade(wsPort, `/ws?token=${TOKEN}`, { Host: `127.0.0.1:${wsPort}`, Origin: "http://localhost:5173" })).toBe(101);
  });

  it("checks each request one time: one admission and one browser check for each call and each upgrade (CLI-2b)", async () => {
    const counts = { hook: 0, origins: 0 };
    const policy = hostPolicy({
      // The request hook of the server: it counts the admissions, and the token check of the server follows it
      principalOf: () => {
        counts.hook++;
        return {};
      },
      browser: {
        allowedOrigins: (origin: string) => {
          counts.origins++;
          return origin === "http://app.test";
        },
      },
    });
    const { port, wsPort } = await startPeer({ policy });
    const page = { Host: `127.0.0.1:${port}`, Origin: "http://app.test" };
    expect((await send(port, "/api/test/echo", { ...json, ...page, Authorization: `Bearer ${TOKEN}` }, call)).status).toBe(200);
    expect(counts).toEqual({ hook: 1, origins: 1 });
    expect((await send(port, "/api/test/echo", { ...json, ...page }, call)).status).toBe(401);
    expect(counts).toEqual({ hook: 2, origins: 2 });
    expect(await upgrade(wsPort, `/ws?token=${TOKEN}`, page)).toBe(101);
    expect(counts).toEqual({ hook: 3, origins: 3 });
    expect(await upgrade(wsPort, "/ws", page)).toBe(401);
    expect(counts).toEqual({ hook: 4, origins: 4 });
    // A refusal of the browser check comes before the admission
    expect((await send(port, "/api/test/echo", { ...json, ...page, Origin: "https://evil.example", Authorization: `Bearer ${TOKEN}` }, call)).status).toBe(403);
    expect(counts).toEqual({ hook: 4, origins: 5 });
  });

  it("answers host.info with the token, and has no /health route (CLI-7)", async () => {
    const { port } = await startPeer();
    // The probes come from the runner: the peer has no static /health route of its own
    expect((await send(port, "/health", { Host: `localhost:${port}` })).status).toBe(404);
    // A client checks a lockfile with host.info and the token of the lockfile
    const info = await send(port, "/api/host/info", { ...json, Host: `localhost:${port}`, Authorization: `Bearer ${TOKEN}` }, "{}");
    expect(info.status).toBe(200);
    expect(JSON.parse(info.body).peerId).toBe("peer-test");
    expect((await send(port, "/api/host/info", { ...json, Host: `localhost:${port}` }, "{}")).status).toBe(401);
  });
});
