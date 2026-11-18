/**
 * The flow of the frames of a WebSocket server: the server does not read the frames of a peer that
 * does not read the answers, the heartbeat ends such a peer, and `maxBufferedBytes` bounds the send
 * buffer of a connection.
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { WebSocket as WsClient } from "ws";
import type { WebSocket } from "ws";
import { Server } from "../../server/server.js";
import { WebSocketServerTransport } from "./server/transport.js";
import type { WebSocketServerTransportOptions } from "./server/types.js";
import { ms } from "../../duration.js";

const sleep = (time: number) => new Promise((resolve) => setTimeout(resolve, time));

let cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const cleanup of cleanups.reverse()) await Promise.resolve(cleanup()).catch(() => {});
  cleanups = [];
  vi.restoreAllMocks();
});

async function waitFor(check: () => boolean, time = 5000): Promise<void> {
  const end = Date.now() + time;
  while (!check()) {
    if (Date.now() > end) throw new Error("waitFor: condition not met");
    await sleep(5);
  }
}

/** This function starts a server transport on a free port. `sockets` holds the server side of each connection. */
async function startServer(options: Omit<WebSocketServerTransportOptions, "server" | "path" | "onConnection">) {
  const http: HttpServer = createServer();
  const sockets: WebSocket[] = [];
  const transport = new WebSocketServerTransport(new Server(), { ...options, server: http, path: "/ws", onConnection: (ws) => sockets.push(ws) });
  await transport.start();
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", () => resolve()));
  let disconnects = 0;
  transport.onDisconnect(() => disconnects++);
  cleanups.push(async () => {
    await transport.stop();
    await new Promise<void>((resolve) => http.close(() => resolve()));
  });
  return { transport, url: `ws://127.0.0.1:${(http.address() as AddressInfo).port}/ws`, sockets, disconnects: () => disconnects };
}

/** This function opens a client that sends frames and does not read: its socket is paused, so the answers stay in the buffers. */
async function deafClient(url: string): Promise<WsClient> {
  const client = new WsClient(url, { autoPong: false });
  cleanups.push(() => client.terminate());
  await new Promise((resolve) => client.once("open", resolve));
  client.pause();
  return client;
}

/** This function sends `count` ping frames with an id of `size` characters. The server answers each with a pong of the same id. */
function sendPings(client: WsClient, count: number, size: number): void {
  const id = "x".repeat(size);
  for (let i = 0; i < count; i++) client.send(JSON.stringify({ id, type: "ping" }));
}

const KIB = 1024;

describe("the flow of the frames of a connection", () => {
  it("does not read the frames of a peer that does not read the answers, and reads them again when the peer reads", async () => {
    const highWaterMark = 64 * KIB;
    const server = await startServer({ highWaterMark, heartbeat: false });
    const client = await deafClient(server.url);
    let pongs = 0;
    client.on("message", (data) => {
      if ((JSON.parse(String(data)) as { type: string }).type === "pong") pongs += 1;
    });
    const count = 1500;
    sendPings(client, count, 16 * KIB);
    await waitFor(() => server.sockets[0]?.isPaused === true);
    await sleep(200);
    const socket = server.sockets[0]!;
    // The pause keeps the buffer near the mark, also with 24 MB of frames sent
    expect(socket.bufferedAmount).toBeLessThan(highWaterMark + 512 * KIB);
    expect(socket.isPaused).toBe(true);
    client.resume();
    await waitFor(() => pongs === count, 15_000);
    expect(socket.isPaused).toBe(false);
    expect(server.disconnects()).toBe(0);
  }, 30_000);

  it("ends a peer that does not read, also when it sends pong frames", async () => {
    const server = await startServer({ highWaterMark: 16 * KIB, heartbeat: { interval: ms(50), misses: 2 } });
    const client = await deafClient(server.url);
    // Pongs that answer no ping do not keep the connection open
    const pongs = setInterval(() => client.pong(), 10);
    cleanups.push(() => clearInterval(pongs));
    sendPings(client, 1000, 16 * KIB);
    await waitFor(() => server.disconnects() === 1);
  }, 15_000);

  it("keeps a peer that reads slowly: while the reads are paused, a written frame counts as the pong", async () => {
    // A long interval: the test gives each beat itself
    const server = await startServer({ highWaterMark: 16 * KIB, heartbeat: { interval: ms(60_000), misses: 2 } });
    const beat = (): void => (server.transport as unknown as { beat(): void }).beat();
    const client = await deafClient(server.url);
    let stop = (): boolean => false;
    client.on("message", () => {
      // The client stops in the handler: a poll reads megabytes before it stops
      if (stop()) client.pause();
    });
    sendPings(client, 1500, 16 * KIB);
    await waitFor(() => server.sockets[0]?.isPaused === true);
    await sleep(100);
    const socket = server.sockets[0]!;
    /** The count of the frames that the socket of the server wrote. The transport keeps it for each connection. */
    const written = (): number => (server.transport as unknown as { flows: WeakMap<WebSocket, { written: number }> }).flows.get(socket)?.written ?? 0;
    /**
     * The client reads until the socket of the server wrote 4 more frames, then it stops until the
     * server pauses again. A count of the messages that the client read is not sufficient: the
     * client can read them from its own buffers, and then the server writes no frame.
     */
    const readSome = async (): Promise<void> => {
      // New pings in each round: the server has frames to read and answers to write
      sendPings(client, 100, 16 * KIB);
      const target = written() + 4;
      stop = () => written() >= target;
      client.resume();
      await waitFor(() => written() >= target && client.isPaused);
      stop = () => false;
      await waitFor(() => socket.isPaused);
      await sleep(100);
    };
    beat(); // 1 missed pong
    // Five beats, more than misses: the socket wrote frames before each one, so the count starts again at 1
    for (let round = 0; round < 5; round++) {
      await readSome();
      expect(socket.isPaused).toBe(true);
      beat();
      expect(socket.readyState).toBe(WsClient.OPEN);
    }
    expect(server.disconnects()).toBe(0);
    beat(); // No frame written since the last beat: 2 missed pongs
    expect(socket.readyState).toBe(WsClient.OPEN);
    beat(); // 2 missed pongs, as many as misses: the connection closes
    expect(socket.readyState).not.toBe(WsClient.OPEN);
    await waitFor(() => server.disconnects() === 1);
  }, 30_000);

  it("ends a connection whose send buffer holds more than maxBufferedBytes", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const maxBufferedBytes = 256 * KIB;
    const server = await startServer({ highWaterMark: 16 * KIB, maxBufferedBytes, heartbeat: false });
    await deafClient(server.url);
    await waitFor(() => server.sockets.length === 1);
    const socket = server.sockets[0]!;
    const data = "x".repeat(16 * KIB);
    let largest = 0;
    // Frames that the server sends with no request, to a peer that does not read them
    for (let i = 0; i < 2000 && socket.readyState === WsClient.OPEN; i++) {
      server.transport.broadcast({ id: String(i), type: "event", data });
      largest = Math.max(largest, socket.bufferedAmount);
    }
    await waitFor(() => server.disconnects() === 1);
    // The check comes before each frame: the buffer holds at most the limit and one frame
    expect(largest).toBeLessThanOrEqual(maxBufferedBytes + 17 * KIB);
    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0]?.[0])).toContain("more than maxBufferedBytes 262144");
  }, 15_000);

  it("sends each frame while its buffer holds at most maxBufferedBytes, a larger frame too, and ends the connection at the next frame", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const maxBufferedBytes = 64 * KIB;
    const server = await startServer({ highWaterMark: 16 * KIB, maxBufferedBytes, heartbeat: false });
    await deafClient(server.url);
    await waitFor(() => server.sockets.length === 1);
    const socket = server.sockets[0]!;
    // Each frame is larger than the limit. The kernel keeps a part of the bytes that the peer does
    // not read, and the size of that part changes with the platform: on Windows, 8 MiB fit in it.
    // The test sends frames until the buffer of the server holds more than the limit.
    const data = "x".repeat(2 * 1024 * KIB);
    let frames = 0;
    while (socket.bufferedAmount <= maxBufferedBytes && frames < 32) {
      server.transport.broadcast({ id: `large-${frames}`, type: "event", data });
      frames += 1;
      await sleep(50);
      // The buffer held at most the limit before the frame, so the server sent the frame
      expect(socket.readyState).toBe(WsClient.OPEN);
      expect(error).not.toHaveBeenCalled();
    }
    // The peer does not read, so the frames stay in the buffer of the server
    expect(socket.bufferedAmount, `the buffer after ${frames} frames of 2 MiB`).toBeGreaterThan(maxBufferedBytes);
    // The next frame finds a buffer over the limit: the connection ends before the frame
    server.transport.broadcast({ id: "next", type: "event", data: "small" });
    expect(socket.readyState).not.toBe(WsClient.OPEN);
    await waitFor(() => server.disconnects() === 1);
    expect(error).toHaveBeenCalledTimes(1);
  }, 15_000);

  it("refuses a maxBufferedBytes that is not a positive number", () => {
    for (const maxBufferedBytes of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => new WebSocketServerTransport(new Server(), { maxBufferedBytes })).toThrow(RangeError);
    }
  });
});
