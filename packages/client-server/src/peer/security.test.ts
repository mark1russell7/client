/**
 * The request checks of a peer, against a real peer on 127.0.0.1 (deep dive TRN-1, CLI-1, CLI-2).
 *
 * Before: CORS `*` by default, no Host check, no token. Any web page could call a loopback
 * server, and with `mark --server` that included `shell.exec`.
 */

import { describe, it, expect, afterEach } from "vitest";
import { createServer } from "node:net";
import { request } from "node:http";
import { ProcedureRegistry, defineProcedure, outputSchema } from "@procedures/client";
import { createPeer, type Peer } from "./index.js";
import { hostAllowed, hostName, originAllowed, tokenMatches } from "./security.js";

const TOKEN = "test-token-0123456789";

async function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(typeof address === "object" && address ? address.port : 0));
    });
  });
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

let peers: Peer[] = [];
afterEach(async () => {
  for (const peer of peers) await peer.stop();
  peers = [];
});

async function startPeer(): Promise<number> {
  const registry = new ProcedureRegistry();
  registry.register(
    defineProcedure({
      path: ["test", "echo"],
      input: outputSchema<{ text: string }>(),
      output: outputSchema<string>(),
      handler: (input: { text: string }) => input.text,
    }),
  );
  const port = await freePort();
  const peer = await createPeer({
    id: "peer-test",
    registry,
    autoRegister: true,
    transports: [{ type: "http", port, host: "127.0.0.1", token: TOKEN }],
  });
  await peer.start();
  peers.push(peer);
  return port;
}

const json = { "Content-Type": "application/json" };
const call = JSON.stringify({ text: "hi" });

describe("peer request checks", () => {
  it("answers a call with the token", async () => {
    const port = await startPeer();
    const response = await send(port, "/api/test/echo", { ...json, Host: `127.0.0.1:${port}`, Authorization: `Bearer ${TOKEN}` }, call);
    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toBe("hi");
  });

  it("refuses a call without the token, or with a wrong one", async () => {
    const port = await startPeer();
    expect((await send(port, "/api/test/echo", { ...json, Host: `127.0.0.1:${port}` }, call)).status).toBe(401);
    expect((await send(port, "/api/test/echo", { ...json, Host: `127.0.0.1:${port}`, Authorization: "Bearer wrong" }, call)).status).toBe(401);
  });

  it("refuses a request addressed to another host name (DNS rebinding)", async () => {
    const port = await startPeer();
    const response = await send(port, "/api/test/echo", { ...json, Host: `attacker.example:${port}`, Authorization: `Bearer ${TOKEN}` }, call);
    expect(response.status).toBe(403);
  });

  it("refuses a request from a web page of another origin, and sends no CORS header", async () => {
    const port = await startPeer();
    const response = await send(
      port,
      "/api/test/echo",
      { ...json, Host: `127.0.0.1:${port}`, Origin: "https://evil.example", Authorization: `Bearer ${TOKEN}` },
      call,
    );
    expect(response.status).toBe(403);
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("answers host.info with the token, and has no /health route (CLI-7)", async () => {
    const port = await startPeer();
    // The probes come from the runner: the peer has no static /health route of its own
    expect((await send(port, "/health", { Host: `localhost:${port}` })).status).toBe(404);
    // A client checks a lockfile with host.info and the token of the lockfile
    const info = await send(port, "/api/host/info", { ...json, Host: `localhost:${port}`, Authorization: `Bearer ${TOKEN}` }, "{}");
    expect(info.status).toBe(200);
    expect(JSON.parse(info.body).peerId).toBe("peer-test");
    expect((await send(port, "/api/host/info", { ...json, Host: `localhost:${port}` }, "{}")).status).toBe(401);
  });
});

describe("check helpers", () => {
  it("reads host names and compares origins and tokens", () => {
    expect([hostName("localhost:3000"), hostName("[::1]:80"), hostName("Example.COM")]).toEqual(["localhost", "[::1]", "example.com"]);
    expect(hostAllowed("127.0.0.1", "localhost:1")).toBe(true);
    expect(hostAllowed("127.0.0.1", "evil.example")).toBe(false);
    expect(hostAllowed("0.0.0.0", "my-machine:3000")).toBe(true);
    expect(originAllowed(undefined)).toBe(true);
    expect(originAllowed("http://localhost:5173")).toBe(true);
    expect(originAllowed("https://evil.example")).toBe(false);
    expect(originAllowed("https://mark1russell7.github.io", ["https://mark1russell7.github.io"])).toBe(true);
    expect(tokenMatches(undefined, undefined)).toBe(true);
    expect(tokenMatches("abc", "abc")).toBe(true);
    expect(tokenMatches("abc", "abd")).toBe(false);
    expect(tokenMatches("abc", undefined)).toBe(false);
    // Another length gives false through the same digest comparison
    expect(tokenMatches("abc", "abcd")).toBe(false);
    expect(tokenMatches("abcd", "abc")).toBe(false);
    expect(tokenMatches("abc", "")).toBe(false);
    expect(tokenMatches("t\u00f6ken", "t\u00f6ken")).toBe(true);
  });
});
