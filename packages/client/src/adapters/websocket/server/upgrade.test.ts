/**
 * The procedure upgrade handler of WebSocket (CLI-3): two endpoints share one `node:http` server,
 * an upgrade of another path goes on to the application, and the handler has the stop parts of a
 * service transport.
 */

import { describe, it, expect, afterEach } from "vitest";
import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { z } from "zod";
import { WebSocket as WsClient, WebSocketServer } from "ws";
import { createProcedure } from "../../../procedures/define.js";
import { createRegistry } from "../../../procedures/module.js";
import { ProcedureServer } from "../../../server/procedure-server.js";
import { pathToMethod } from "../../../server/method.js";
import { Client } from "../../../client/client.js";
import { WebSocketTransport } from "../client/node.js";
import { WebSocketServerTransport } from "./transport.js";
import { upgradeHandler, type NodeUpgradeHandler } from "./upgrade.js";

function makeServer(): { server: ProcedureServer; release: () => void } {
  let release: () => void = () => undefined;
  const read = { reads: [], writes: [] };
  const registry = createRegistry({
    name: "up",
    procedures: [
      createProcedure()
        .path(["up", "echo"])
        .input(z.object({ text: z.string() }))
        .output(z.object({ text: z.string() }))
        .meta({ effects: read })
        .handler(async (input) => ({ text: input.text }))
        .build(),
      createProcedure()
        .path(["up", "wait"])
        .input(z.object({}))
        .output(z.string())
        .meta({ effects: read })
        .handler(() => new Promise<string>((resolve) => (release = () => resolve("released"))))
        .build(),
    ],
  });
  const server = new ProcedureServer({ registry });
  server.registerFromRegistry();
  return { server, release: () => release() };
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

/** "open", or the HTTP status of a refused upgrade, or "error" for a socket that closed. */
function connect(port: number, path: string): Promise<string | number> {
  return new Promise((resolve) => {
    const ws = new WsClient(`ws://127.0.0.1:${port}${path}`);
    ws.on("open", () => {
      ws.close();
      resolve("open");
    });
    ws.on("unexpected-response", (_req, res) => resolve(res.statusCode ?? 0));
    ws.on("error", () => resolve("error"));
  });
}

/** An open socket and its frames. */
async function open(port: number, path: string): Promise<{ ws: WsClient; next: (id: string) => Promise<Record<string, unknown>> }> {
  const ws = new WsClient(`ws://127.0.0.1:${port}${path}`);
  const frames: Array<Record<string, unknown>> = [];
  const waiters: Array<() => void> = [];
  ws.on("message", (data: Buffer) => {
    frames.push(JSON.parse(data.toString()) as Record<string, unknown>);
    for (const waiter of waiters.splice(0)) waiter();
  });
  await new Promise<void>((resolve, reject) => {
    ws.once("open", () => resolve());
    ws.once("error", reject);
  });
  cleanups.push(() => ws.terminate());
  const next = async (id: string): Promise<Record<string, unknown>> => {
    for (;;) {
      const index = frames.findIndex((frame) => frame["id"] === id);
      if (index >= 0) return frames.splice(index, 1)[0]!;
      await new Promise<void>((resolve) => waiters.push(resolve));
    }
  };
  return { ws, next };
}

const request = (id: string, path: string[], payload: unknown = {}) => JSON.stringify({ id, type: "request", method: pathToMethod(path), payload });

describe("upgradeHandler: two endpoints on one node:http server (CLI-3)", () => {
  it("serves /ws and /live, and an upgrade of another path goes on to the application", async () => {
    const { server } = makeServer();
    const events = upgradeHandler(server, { path: "/ws", heartbeat: false });
    const live = upgradeHandler(server, { path: "/live", heartbeat: false });
    cleanups.push(() => events.close(), () => live.close());
    const others: string[] = [];
    const http = createServer();
    http.on("upgrade", (req, socket, head) => {
      if (events(req, socket, head) || live(req, socket, head)) return;
      others.push(req.url ?? "");
      socket.destroy();
    });
    const port = await listen(http);

    for (const path of ["/ws", "/live?x=1"]) {
      const { ws, next } = await open(port, path);
      ws.send(request("e1", ["up", "echo"], { text: path }));
      expect((await next("e1"))["payload"]).toEqual({ text: path });
    }
    expect(await connect(port, "/other")).toBe("error");
    expect(others).toEqual(["/other"]);
    expect([events.path, live.path]).toEqual(["/ws", "/live"]);
    expect(events.transport.getConnectionCount()).toBeGreaterThanOrEqual(1);
  });

  it("is the server of a Client with the WebSocketTransport of Node", async () => {
    const { server } = makeServer();
    const handler = upgradeHandler(server, { path: "/ws", heartbeat: false });
    cleanups.push(() => handler.close());
    const http = createServer();
    http.on("upgrade", (req, socket, head) => {
      if (!handler(req, socket, head)) socket.destroy();
    });
    const port = await listen(http);
    const transport = new WebSocketTransport({ url: `ws://127.0.0.1:${port}/ws` });
    cleanups.push(() => transport.close());
    const client = new Client(transport);
    expect(await client.call(pathToMethod(["up", "echo"]), { text: "client" })).toEqual({ text: "client" });
  });
});

describe("WebSocketServerTransport with a server: the upgrade router (CLI-3)", () => {
  it("lets two transports of different paths share one server, and refuses another path with 400", async () => {
    const { server } = makeServer();
    const http = createServer();
    const first = new WebSocketServerTransport(server, { server: http, path: "/ws", heartbeat: false });
    const second = new WebSocketServerTransport(server, { server: http, path: "/admin", heartbeat: false });
    await first.start();
    await second.start();
    cleanups.push(() => first.stop(), () => second.stop());
    const port = await listen(http);
    expect(await connect(port, "/ws")).toBe("open");
    expect(await connect(port, "/admin")).toBe("open");
    expect(await connect(port, "/nothing")).toBe(400);
    expect(http.listenerCount("upgrade")).toBe(1);
    await first.stop();
    await second.stop();
    expect(http.listenerCount("upgrade")).toBe(0);
  });

  it("leaves an upgrade of another path to the upgrade listener of the application", async () => {
    const { server } = makeServer();
    const http = createServer();
    const transport = new WebSocketServerTransport(server, { server: http, path: "/ws", heartbeat: false });
    await transport.start();
    cleanups.push(() => transport.stop());
    const app = new WebSocketServer({ noServer: true });
    cleanups.push(() => new Promise<void>((resolve) => app.close(() => resolve())));
    http.on("upgrade", (req, socket, head) => {
      if (req.url === "/app") app.handleUpgrade(req, socket, head, (ws) => ws.close());
    });
    const port = await listen(http);
    expect(await connect(port, "/app")).toBe("open");
    expect(await connect(port, "/ws")).toBe("open");
  });

  it("starts one time: a second start() attaches nothing more", async () => {
    const { server } = makeServer();
    const http = createServer();
    const transport = new WebSocketServerTransport(server, { server: http, path: "/ws", heartbeat: false });
    await transport.start();
    await transport.start();
    cleanups.push(() => transport.stop());
    expect(http.listenerCount("upgrade")).toBe(1);
  });
});

describe("upgradeHandler: the stop parts of a service transport (CLI-3)", () => {
  async function startOne(): Promise<{ port: number; handler: NodeUpgradeHandler; release: () => void }> {
    const { server, release } = makeServer();
    const handler = upgradeHandler(server, { path: "/ws", heartbeat: false });
    cleanups.push(() => handler.close());
    const http = createServer();
    http.on("upgrade", (req, socket, head) => {
      if (!handler(req, socket, head)) socket.destroy();
    });
    return { port: await listen(http), handler, release };
  }

  it("counts a call in flight, refuses new upgrades and calls after stopIntake(), and drains", async () => {
    const { port, handler, release } = await startOne();
    const { ws, next } = await open(port, "/ws");
    ws.send(request("w1", ["up", "wait"]));
    await expect.poll(() => handler.inFlight()).toBe(1);

    handler.stopIntake();
    expect(await connect(port, "/ws")).toBe(503);
    ws.send(request("e2", ["up", "echo"], { text: "late" }));
    expect(await next("e2")).toMatchObject({ type: "error", error: { code: "UNAVAILABLE", retryable: true } });

    let drained = false;
    const drain = handler.drain(performance.now() + 60_000).then(() => (drained = true));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(drained).toBe(false);
    release();
    expect((await next("w1"))["payload"]).toBe("released");
    await drain;
    expect(handler.inFlight()).toBe(0);

    handler.start();
    expect(await connect(port, "/ws")).toBe("open");
  });

  it("ends a drain at its deadline, and close() closes the connections", async () => {
    const { port, handler } = await startOne();
    const { ws } = await open(port, "/ws");
    ws.send(request("w1", ["up", "wait"]));
    await expect.poll(() => handler.inFlight()).toBe(1);
    await handler.drain(performance.now() + 20);
    const closed = new Promise<void>((resolve) => ws.once("close", () => resolve()));
    await handler.close();
    await closed;
    expect(handler.inFlight()).toBe(0);
    // A closed handler gives false: the listener can give the upgrade to another handler
    expect(await connect(port, "/ws")).toBe("error");
  });
});
