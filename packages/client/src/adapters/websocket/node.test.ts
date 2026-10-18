/**
 * The WebSocket client transport of the Node entry (finding of roadmap R36). Its sockets are of
 * the `WebSocket` class of the `ws` package by default. The tests use real servers: the text
 * frames, the `readyState` and the `send` of that class, a drop with `terminate()`, and the end
 * of a socket during its handshake. The last test pins that the browser entries do not import
 * `ws`.
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { createServer, type Server as HttpServer } from "node:http";
import { createServer as createTcpServer, type Server as TcpServer, type Socket } from "node:net";
import type { AddressInfo } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { WebSocket as WsClient, WebSocketServer } from "ws";
import { Client } from "../../client/client.js";
import { createProcedure } from "../../procedures/define.js";
import { createRegistry } from "../../procedures/module.js";
import { ProcedureServer } from "../../server/procedure-server.js";
import { pathToMethod } from "../../server/method.js";
import { ms } from "../../duration.js";
import { WebSocketTransport } from "../../node.js";
import { WebSocketTransport as PortableWebSocketTransport } from "./client/transport.js";
import { WebSocketServerTransport } from "./server/transport.js";
import { WebSocketState } from "./client/types.js";

const sleep = (time: number) => new Promise((resolve) => setTimeout(resolve, time));

let cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const cleanup of cleanups.reverse()) await Promise.resolve(cleanup()).catch(() => {});
  cleanups = [];
});

async function waitFor(check: () => boolean, time = 2000): Promise<void> {
  const end = Date.now() + time;
  while (!check()) {
    if (Date.now() > end) throw new Error("waitFor: condition not met");
    await sleep(5);
  }
}

/** The socket that a transport uses now. */
function socketOf(transport: PortableWebSocketTransport): unknown {
  return (transport as unknown as { ws: unknown }).ws;
}

const read = { reads: [], writes: [] };

/** A ProcedureServer over WebSocket with a value procedure and a stream procedure. */
async function procedureServer(): Promise<{ url: string; ws: WebSocketServerTransport }> {
  const registry = createRegistry({
    name: "node-test",
    procedures: [
      createProcedure()
        .path(["math", "double"])
        .input(z.object({ n: z.number() }))
        .output(z.number())
        .meta({ effects: read })
        .handler(async (input) => input.n * 2)
        .build(),
      createProcedure()
        .path(["math", "count"])
        .input(z.object({ to: z.number() }))
        .output(z.number())
        .meta({ effects: read })
        .handler(async function* (input: { to: number }) {
          for (let n = 1; n <= input.to; n++) yield n;
        } as never)
        .build(),
    ],
  });
  const rpc = new ProcedureServer({ registry });
  rpc.registerFromRegistry();
  const http: HttpServer = createServer();
  const ws = new WebSocketServerTransport(rpc, { server: http, path: "/ws" });
  rpc.addTransport(ws);
  await rpc.start();
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", () => resolve()));
  cleanups.push(async () => {
    await rpc.stop();
    http.closeAllConnections();
    await new Promise<void>((resolve) => http.close(() => resolve()));
  });
  return { url: `ws://127.0.0.1:${(http.address() as AddressInfo).port}/ws`, ws };
}

/** A plain `ws` server that never answers the heartbeat pings of the client. */
async function silentServer(): Promise<{ url: string; closes: () => number }> {
  const http: HttpServer = createServer();
  const wss = new WebSocketServer({ server: http, path: "/ws" });
  let closes = 0;
  wss.on("connection", (socket) => socket.on("close", () => closes++));
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", () => resolve()));
  cleanups.push(async () => {
    for (const client of wss.clients) client.terminate();
    await new Promise<void>((resolve) => wss.close(() => resolve()));
    await new Promise<void>((resolve) => http.close(() => resolve()));
  });
  return { url: `ws://127.0.0.1:${(http.address() as AddressInfo).port}/ws`, closes: () => closes };
}

/** A TCP server that accepts each connection and never answers: the handshake never ends. */
async function blackHole(): Promise<string> {
  const sockets = new Set<Socket>();
  const server: TcpServer = createTcpServer((socket) => sockets.add(socket));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  cleanups.push(async () => {
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  return `ws://127.0.0.1:${(server.address() as AddressInfo).port}/ws`;
}

describe("the WebSocketTransport of @procedures/client/node", () => {
  it("is a WebSocketTransport whose sockets are of the ws class, unless the option webSocket gives another class", async () => {
    const server = await procedureServer();
    const transport = new WebSocketTransport({ url: server.url, heartbeat: { enabled: false }, reconnect: { enabled: false } });
    cleanups.push(() => transport.close());
    expect(transport).toBeInstanceOf(PortableWebSocketTransport);
    await waitFor(() => transport.getState() === WebSocketState.CONNECTED);
    expect(socketOf(transport)).toBeInstanceOf(WsClient);

    class Marked extends WsClient {}
    const other = new WebSocketTransport({ url: server.url, webSocket: Marked, heartbeat: { enabled: false }, reconnect: { enabled: false } });
    cleanups.push(() => other.close());
    await waitFor(() => other.getState() === WebSocketState.CONNECTED);
    expect(socketOf(other)).toBeInstanceOf(Marked);
  });

  it("reads the text frames of the server: a value, a stream and the hello", async () => {
    const server = await procedureServer();
    const transport = new WebSocketTransport({ url: server.url, heartbeat: { enabled: false }, reconnect: { enabled: false } });
    cleanups.push(() => transport.close());
    const client = new Client({ transport, throwOnError: true });

    expect(await client.call(pathToMethod(["math", "double"]), { n: 21 })).toBe(42);
    const items: number[] = [];
    for await (const item of client.stream<unknown, number>(pathToMethod(["math", "count"]), { to: 100 })) items.push(item);
    expect(items).toEqual(Array.from({ length: 100 }, (_, n) => n + 1));
    // The hello of the server came as a text frame too
    expect(transport.getServerProtocol()).toBe(1);
  });

  it("serves the calls of the server: the send and the readyState of a ws socket", async () => {
    const server = await procedureServer();
    const served = new ProcedureServer({
      registry: createRegistry({
        name: "ui",
        procedures: [
          createProcedure()
            .path(["ui", "greet"])
            .input(z.object({ name: z.string() }))
            .output(z.string())
            .meta({ effects: read })
            .handler(async (input) => `hello ${input.name}`)
            .build(),
        ],
      }),
    });
    served.registerFromRegistry();
    const transport = new WebSocketTransport({ url: server.url, serve: served, heartbeat: { enabled: false }, reconnect: { enabled: false } });
    cleanups.push(() => transport.close());
    await waitFor(() => server.ws.getTrackedConnections().length === 1);
    const id = server.ws.getTrackedConnections()[0]!.id;
    const toClient = new Client({ transport: server.ws.transportFor(id), throwOnError: true });
    expect(await toClient.call(pathToMethod(["ui", "greet"]), { name: "node" })).toBe("hello node");
  });

  it("ends a dropped socket with terminate(), so the server sees the end at once", async () => {
    const server = await silentServer();
    const terminate = vi.spyOn(WsClient.prototype, "terminate");
    const close = vi.spyOn(WsClient.prototype, "close");
    const reasons: Array<string | undefined> = [];
    const transport = new WebSocketTransport({
      url: server.url,
      heartbeat: { interval: ms(30), timeout: ms(10), misses: 1 },
      reconnect: { enabled: false },
      onDisconnect: (reason) => reasons.push(reason),
    });
    cleanups.push(() => transport.close());
    await waitFor(() => reasons.length > 0);
    expect(reasons).toEqual(["Heartbeat timeout"]);
    expect(terminate).toHaveBeenCalledTimes(1);
    expect(close).not.toHaveBeenCalled();
    await waitFor(() => server.closes() === 1, 1000);
  });

  it("survives the end of a socket in its handshake: the time limit, and a close() of the caller", async () => {
    // A ws socket that ends in its handshake emits an error. Before, the transport removed its
    // error handler first, and the error ended the process.
    const url = await blackHole();
    let reconnects = 0;
    const transport = new WebSocketTransport({
      url,
      connectionTimeout: ms(40),
      heartbeat: { enabled: false },
      reconnect: { initialDelay: ms(10), maxDelay: ms(10), jitter: 0 },
      onReconnecting: () => reconnects++,
    });
    cleanups.push(() => transport.close());
    await waitFor(() => reconnects >= 2);

    const early = new WebSocketTransport({ url, heartbeat: { enabled: false }, reconnect: { enabled: false } });
    expect(early.getState()).toBe(WebSocketState.CONNECTING);
    await early.close();
    expect(early.getState()).toBe(WebSocketState.DISCONNECTED);
    // The error of the ws socket comes in a later tick
    await sleep(50);
  });
});

describe("the browser entries do not import ws", () => {
  const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

  /** The bare module names that a source file and its relative imports load at run time. */
  function runtimeImports(entry: string): Set<string> {
    const bare = new Set<string>();
    const seen = new Set<string>();
    const queue = [entry];
    // An import or an export with a module name. A type-only import loads nothing at run time.
    const pattern = /^\s*(import|export)\s+(?!type\b)(?:[^"';]*?\sfrom\s+)?["']([^"']+)["']/gm;
    while (queue.length > 0) {
      const file = queue.pop()!;
      if (seen.has(file)) continue;
      seen.add(file);
      for (const match of readFileSync(file, "utf8").matchAll(pattern)) {
        const specifier = match[2]!;
        if (!specifier.startsWith(".")) {
          bare.add(specifier);
          continue;
        }
        const target = join(dirname(file), specifier.replace(/\.js$/, ".ts"));
        queue.push(existsSync(target) ? target : join(dirname(file), specifier, "index.ts"));
      }
    }
    return bare;
  }

  it("the entries browser and client load no ws, and the node entry loads it", () => {
    for (const entry of ["browser.ts", "client/index.ts"]) {
      expect([...runtimeImports(join(SRC, entry))], entry).not.toContain("ws");
    }
    expect([...runtimeImports(join(SRC, "node.ts"))]).toContain("ws");
  });

  it("the browser entry and the procedure handler of HTTP load no Node module at run time (CLI-3)", async () => {
    const { builtinModules } = await import("node:module");
    const nodeModules = new Set([...builtinModules, ...builtinModules.map((name) => `node:${name}`), "ws", "express"]);
    for (const entry of ["browser.ts", "adapters/http/server/handler.ts", "adapters/http/server/cors.ts"]) {
      const loaded = [...runtimeImports(join(SRC, entry))].filter((name) => nodeModules.has(name) || name.startsWith("node:"));
      expect(loaded, entry).toEqual([]);
    }
  });
});
