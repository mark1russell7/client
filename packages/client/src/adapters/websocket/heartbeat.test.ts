/**
 * The time limits of a WebSocket connection (roadmap R3): the handshake has a limit, the
 * reconnect delay has jitter, the client drops the connection after `misses` pings without a
 * pong, and the server closes a connection that does not answer its pings.
 */

import { describe, it, expect, afterEach } from "vitest";
import { createServer, type Server as HttpServer } from "node:http";
import { createServer as createTcpServer, type Server as TcpServer, type Socket } from "node:net";
import type { AddressInfo } from "node:net";
import { WebSocket as WsClient, WebSocketServer } from "ws";
import { Server } from "../../server/server.js";
import { WebSocketTransport, reconnectDelay } from "./client/transport.js";
import { WebSocketServerTransport } from "./server/transport.js";
import { WebSocketState } from "./client/types.js";
import { ms } from "../../duration.js";
import type { Duration } from "../../duration.js";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const cleanup of cleanups.reverse()) await Promise.resolve(cleanup()).catch(() => {});
  cleanups = [];
});

async function waitFor(check: () => boolean, ms = 2000): Promise<void> {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error("waitFor: condition not met");
    await sleep(5);
  }
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

describe("the handshake has a time limit", () => {
  it("closes a socket that does not open in time, and reconnects", async () => {
    const url = await blackHole();
    const reasons: Array<string | undefined> = [];
    let reconnects = 0;
    const transport = new WebSocketTransport({
      url,
      connectionTimeout: ms(80),
      heartbeat: { enabled: false },
      reconnect: { initialDelay: ms(1000), jitter: 0 },
      onDisconnect: (reason) => reasons.push(reason),
      onReconnecting: () => reconnects++,
    });
    cleanups.push(() => transport.close());
    expect(transport.getState()).toBe(WebSocketState.CONNECTING);
    await waitFor(() => reconnects === 1, 1000);
    expect(reasons).toEqual(["Handshake timeout"]);
    expect(transport.getState()).toBe(WebSocketState.RECONNECTING);
  });

  it("ends in DISCONNECTED when reconnect is off", async () => {
    const url = await blackHole();
    const transport = new WebSocketTransport({ url, connectionTimeout: ms(50), heartbeat: { enabled: false }, reconnect: { enabled: false } });
    cleanups.push(() => transport.close());
    await waitFor(() => transport.getState() === WebSocketState.DISCONNECTED, 1000);
  });
});

describe("reconnectDelay", () => {
  const options = { initialDelay: 1000, backoffMultiplier: 2, maxDelay: 5000 };
  it("gives a random delay from 0 to the backoff with full jitter", () => {
    expect(reconnectDelay(1, { ...options, jitter: 1 }, () => 0)).toBe(1000);
    expect(reconnectDelay(1, { ...options, jitter: 1 }, () => 0.75)).toBe(250);
    expect(reconnectDelay(3, { ...options, jitter: 1 }, () => 0.5)).toBe(2000);
  });

  it("gives the backoff exactly without jitter, up to maxDelay", () => {
    expect(reconnectDelay(2, { ...options, jitter: 0 }, () => 0.9)).toBe(2000);
    expect(reconnectDelay(10, { ...options, jitter: 0 }, () => 0.9)).toBe(5000);
  });
});

/** A plain `ws` server that counts the heartbeat pings of the client and never answers them. */
async function silentServer(): Promise<{ url: string; pings: () => number; connections: () => number }> {
  const http: HttpServer = createServer();
  const wss = new WebSocketServer({ server: http, path: "/ws" });
  let pings = 0;
  let connections = 0;
  wss.on("connection", (socket) => {
    connections++;
    socket.on("message", (data) => {
      if (JSON.parse(String(data)).type === "ping") pings++;
    });
  });
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", () => resolve()));
  cleanups.push(async () => {
    for (const client of wss.clients) client.terminate();
    await new Promise<void>((resolve) => wss.close(() => resolve()));
    await new Promise<void>((resolve) => http.close(() => resolve()));
  });
  return { url: `ws://127.0.0.1:${(http.address() as AddressInfo).port}/ws`, pings: () => pings, connections: () => connections };
}

describe("the heartbeat of the client", () => {
  for (const misses of [1, 3]) {
    it(`drops the connection after ${misses} pings without a pong`, async () => {
      const server = await silentServer();
      const reasons: Array<string | undefined> = [];
      const transport = new WebSocketTransport({
        url: server.url,
        heartbeat: { interval: ms(30), timeout: ms(10), misses },
        reconnect: { enabled: false },
        onDisconnect: (reason) => reasons.push(reason),
      });
      cleanups.push(() => transport.close());
      await waitFor(() => reasons.length > 0, 2000);
      expect(reasons).toEqual(["Heartbeat timeout"]);
      expect(server.pings()).toBe(misses);
    });
  }
});

describe("a dropped socket (finding of R36)", () => {
  it("ends at once with terminate() when its class has it, not with close()", async () => {
    const server = await silentServer();
    const calls: string[] = [];
    class Recording extends WsClient {
      override terminate(): void {
        calls.push("terminate");
        super.terminate();
      }
      override close(...args: Parameters<WsClient["close"]>): void {
        calls.push("close");
        super.close(...args);
      }
    }
    const reasons: Array<string | undefined> = [];
    const transport = new WebSocketTransport({
      url: server.url,
      webSocket: Recording,
      heartbeat: { interval: ms(30), timeout: ms(10), misses: 1 },
      reconnect: { enabled: false },
      onDisconnect: (reason) => reasons.push(reason),
    });
    cleanups.push(() => transport.close());
    await waitFor(() => reasons.length > 0, 2000);
    expect(reasons).toEqual(["Heartbeat timeout"]);
    expect(calls).toEqual(["terminate"]);
  });
});

describe("the heartbeat of the server", () => {
  async function startServer(heartbeat: { interval: Duration; misses: number }) {
    const rpc = new Server();
    const http: HttpServer = createServer();
    const wsServer = new WebSocketServerTransport(rpc, { server: http, path: "/ws", heartbeat });
    await wsServer.start();
    await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", () => resolve()));
    let disconnects = 0;
    wsServer.onDisconnect(() => disconnects++);
    cleanups.push(async () => {
      await wsServer.stop();
      await new Promise<void>((resolve) => http.close(() => resolve()));
    });
    return { url: `ws://127.0.0.1:${(http.address() as AddressInfo).port}/ws`, disconnects: () => disconnects };
  }

  it("closes a connection that does not answer its pings", async () => {
    const server = await startServer({ interval: ms(20), misses: 2 });
    // A client that never sends a pong: a peer that went silent
    const silent = new WsClient(server.url, { autoPong: false });
    cleanups.push(() => silent.terminate());
    await new Promise((resolve) => silent.once("open", resolve));
    await waitFor(() => server.disconnects() === 1, 1000);
  });

  it("keeps a connection that answers", async () => {
    const server = await startServer({ interval: ms(20), misses: 2 });
    const transport = new WebSocketTransport({ url: server.url, heartbeat: { enabled: false }, reconnect: { enabled: false } });
    cleanups.push(() => transport.close());
    await waitFor(() => transport.getState() === WebSocketState.CONNECTED);
    await sleep(150);
    expect(server.disconnects()).toBe(0);
    expect(transport.getState()).toBe(WebSocketState.CONNECTED);
  });
});
