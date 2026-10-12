/**
 * Each server has a registry of its own (roadmap 3.1): two servers in one process serve only
 * their own packages, also when a package of the old kind registered in the global registry.
 */

import { describe, it, expect, afterEach } from "vitest";
import { createServer } from "node:net";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";
import { parseConfig } from "./config.js";
import { startServer, type RunningServer } from "./run.js";

const FIXTURE = pathToFileURL(fileURLToPath(new URL("../test/fixture-procedures.mjs", import.meta.url))).href;

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

const running: RunningServer[] = [];
afterEach(async () => {
  for (const server of running.splice(0)) await server.peer.stop();
});

async function start(args: string[]): Promise<{ server: RunningServer; port: number }> {
  const port = await freePort();
  const server = await startServer(parseConfig(["--port", String(port), "--token", "t", ...args]), () => {});
  running.push(server);
  return { server, port };
}

async function call(port: number, path: string): Promise<number> {
  const response = await fetch(`http://127.0.0.1:${port}/api/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer t" },
    body: "{}",
  });
  await response.arrayBuffer();
  return response.status;
}

describe("startServer", () => {
  it("serves the procedures of its own packages only", async () => {
    const withFixture = await start(["--procedures", FIXTURE]);
    const without = await start([]);
    expect(withFixture.server.registry.has(["fixture", "hello"])).toBe(true);
    expect(without.server.registry.has(["fixture", "hello"])).toBe(false);
    expect(await call(withFixture.port, "fixture/hello")).toBe(200);
    expect(await call(without.port, "fixture/hello")).toBe(404);
    // Both have the server procedures and the core
    expect(await call(without.port, "server/connections")).toBe(200);
  });

  it("applies the host policy: the token and the expose list", async () => {
    const { server, port } = await start(["--procedures", FIXTURE, "--expose", "server.connections"]);
    expect(server.policy.token).toBe("t");
    expect(await call(port, "server/connections")).toBe(200);
    expect(await call(port, "fixture/hello")).toBe(404);
  });
});
