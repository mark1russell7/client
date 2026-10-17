/**
 * Each server has a registry of its own (roadmap 3.1): two servers in one process serve only
 * their own packages, also when a package of the old kind registered in the global registry.
 */

import { describe, it, expect, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";
import { HttpTransport, WebSocketTransport, subscribeRemote, type RemoteEvent } from "@procedures/client";
import { parseConfig } from "./config.js";
import { startServer, type RunningServer } from "./run.js";

const FIXTURE = pathToFileURL(fileURLToPath(new URL("../test/fixture-procedures.mjs", import.meta.url))).href;
const PUBLISH_FIXTURE = pathToFileURL(fileURLToPath(new URL("../test/fixture-publish.mjs", import.meta.url))).href;
const READ_FIXTURE = pathToFileURL(fileURLToPath(new URL("../test/fixture-read.mjs", import.meta.url))).href;

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
  return (await post(port, path, {})).status;
}

/** A call over HTTP with the token: the status and the JSON body. */
async function post(port: number, path: string, input: unknown): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`http://127.0.0.1:${port}/api/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer t" },
    body: JSON.stringify(input),
  });
  return { status: response.status, body: await response.json().catch(() => undefined) };
}

/** A server with an HTTP and a WebSocket transport, each on a free port. */
async function startBoth(args: string[]): Promise<{ server: RunningServer; http: number; ws: number }> {
  const http = await freePort();
  const ws = await freePort();
  const config = parseConfig(["--port", String(http), "--token", "t", "-t", "http,websocket", ...args]);
  config.transports[1] = { ...config.transports[1]!, port: ws };
  const server = await startServer(config, () => {});
  running.push(server);
  return { server, http, ws };
}

const cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

/** A WebSocket transport to a server, with the token in the URL. */
function webSocketTo(port: number): WebSocketTransport {
  const transport = new WebSocketTransport({ url: `ws://127.0.0.1:${port}/ws?token=t`, heartbeat: { enabled: false }, reconnect: { enabled: false } });
  cleanups.push(() => transport.close());
  return transport;
}

/** An HTTP transport to a server, with the token. */
function httpTo(port: number): HttpTransport {
  return new HttpTransport({ baseUrl: `http://127.0.0.1:${port}/api`, defaultHeaders: { Authorization: "Bearer t" } });
}

async function waitFor(check: () => boolean, what: string): Promise<void> {
  const end = Date.now() + 5000;
  while (!check()) {
    if (Date.now() > end) throw new Error(`waitFor: ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
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
    // server.start, server.stop and server.status come from the module of this package
    for (const name of ["start", "stop", "status"]) {
      expect(without.server.registry.has(["server", name]), `server.${name}`).toBe(true);
    }
  });

  it("applies the host policy: the token and the expose list", async () => {
    const { server, port } = await start(["--procedures", FIXTURE, "--expose", "server.connections"]);
    expect(server.policy.token).toBe("t");
    expect(await call(port, "server/connections")).toBe(200);
    expect(await call(port, "fixture/hello")).toBe(404);
  });
});

describe("the remote events of the server (--events, EVENTS.md)", () => {
  it("serves a subscription over WebSocket and HTTP, and a procedure publishes on its bus", async () => {
    // The expose list does not apply to events.subscribe: the topic rule is its expose rule
    const { server, http, ws } = await startBoth(["--procedures", PUBLISH_FIXTURE, "--events", "run-test.orders.*", "--expose", "fixture.*"]);
    expect(server.policy.events?.topics).toEqual(["run-test.orders.*"]);
    const overWs: RemoteEvent[] = [];
    const overHttp: RemoteEvent[] = [];
    const wsSubscription = subscribeRemote(webSocketTo(ws), ["run-test.orders.created"], (_data, event) => {
      overWs.push(event);
    });
    const httpSubscription = subscribeRemote(httpTo(http), ["run-test.orders.created"], (_data, event) => {
      overHttp.push(event);
    });
    cleanups.push(() => wsSubscription(), () => httpSubscription());
    await Promise.all([wsSubscription.ready, httpSubscription.ready]);

    // fixture.publish emits on ctx.bus: the bus of the events of the host
    const published = await post(http, "fixture/publish", { topic: "run-test.orders.created", data: { order: 1 } });
    expect(published).toEqual({ status: 200, body: { published: "run-test.orders.created" } });
    server.peer.getServer().publish("run-test.orders.created", { order: 2 });
    await waitFor(() => overWs.length === 2 && overHttp.length === 2, "two events on each face");
    for (const events of [overWs, overHttp]) {
      expect(events.map((event) => [event.topic, event.data, event.seq])).toEqual([
        ["run-test.orders.created", { order: 1 }, 1],
        ["run-test.orders.created", { order: 2 }, 2],
      ]);
    }
  });

  it("refuses a topic outside the patterns, and each topic without --events (TOPIC_NOT_FOUND)", async () => {
    const withTopics = await startBoth(["--events", "run-test.audit.*"]);
    const outside = subscribeRemote(webSocketTo(withTopics.ws), ["run-test.other"], () => {});
    await expect(outside.ready).rejects.toMatchObject({ code: "TOPIC_NOT_FOUND", retryable: false });

    const without = await startBoth([]);
    expect(without.server.policy.events?.topics).toEqual([]);
    const overWs = subscribeRemote(webSocketTo(without.ws), ["run-test.audit.created"], () => {});
    await expect(overWs.ready).rejects.toMatchObject({ code: "TOPIC_NOT_FOUND" });
    const overHttp = subscribeRemote(httpTo(without.http), ["run-test.audit.created"], () => {});
    await expect(overHttp.ready).rejects.toMatchObject({ code: "TOPIC_NOT_FOUND" });
    // The plain HTTP status of the code
    const response = await fetch(`http://127.0.0.1:${without.http}/api/events/subscribe`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/x-ndjson", authorization: "Bearer t" },
      body: JSON.stringify({ topics: ["run-test.audit.created"] }),
    });
    await response.arrayBuffer();
    expect(response.status).toBe(404);
  });
});

describe("the root of the file procedures (--fs-root, roadmap R33)", () => {
  it("confines fs.* and the nested fs calls of the other procedures", async () => {
    const base = mkdtempSync(join(tmpdir(), "server-fs-root-"));
    cleanups.push(() => rmSync(base, { recursive: true, force: true }));
    const root = join(base, "root");
    mkdirSync(root);
    writeFileSync(join(root, "inside.txt"), "inside");
    writeFileSync(join(base, "outside.txt"), "outside");

    const { server, port } = await start(["--procedures", `@procedures/fs,${READ_FIXTURE}`, "--fs-root", root]);
    expect(server.fsRoot).toBe(root);
    expect(await post(port, "fs/read", { path: "inside.txt" })).toMatchObject({ status: 200, body: { content: "inside" } });
    const refused = await post(port, "fs/read", { path: join(base, "outside.txt") });
    expect(refused.status).toBe(403);
    expect(JSON.stringify(refused.body)).toContain("outside the root");
    // A nested call of another procedure goes through the confined fs.read
    expect(await post(port, "fixture/readFile", { path: join(root, "inside.txt") })).toMatchObject({ status: 200, body: { content: "inside" } });
    expect((await post(port, "fixture/readFile", { path: join(base, "outside.txt") })).status).toBe(403);
  });

  it("does not start with a root that does not exist", async () => {
    const port = await freePort();
    const missing = join(tmpdir(), `server-fs-root-missing-${Date.now()}`);
    const config = parseConfig(["--port", String(port), "--token", "t", "--procedures", "@procedures/fs", "--fs-root", missing]);
    await expect(startServer(config, () => {})).rejects.toThrow("does not exist");
  });
});
