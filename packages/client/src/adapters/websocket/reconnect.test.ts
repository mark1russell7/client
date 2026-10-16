/**
 * The WebSocket client under network faults (roadmap R30). An in-process TCP proxy sits between
 * the client and the server, and gives the faults: a reset, a black hole and a pause.
 *
 * - After a reset, the client reconnects with a backoff that grows, and the count starts again
 *   after a connection.
 * - A black hole sends no close and no reset: only the heartbeat finds it, after `misses` pings
 *   without a pong.
 * - A pause shorter than the limit of the heartbeat keeps the connection, and the held call
 *   arrives.
 * - A drop fails the calls in flight. Their outcome is indeterminate, so a retry sends only an
 *   idempotent call again.
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { z } from "zod";
import { Client } from "../../client/client.js";
import { createRetryMiddleware } from "../../client/middleware/retry.js";
import { deliveryOf, isNetworkError, isNotSentError, thrownItem } from "../../client/middleware/items.js";
import { ms } from "../../duration.js";
import { createProcedure } from "../../procedures/define.js";
import { idempotentIn } from "../../procedures/idempotency.js";
import { createRegistry } from "../../procedures/module.js";
import { ProcedureServer } from "../../server/procedure-server.js";
import { pathToMethod } from "../../server/method.js";
import { WebSocketTransport } from "./client/transport.js";
import { WebSocketServerTransport } from "./server/transport.js";
import { WebSocketState, type WebSocketTransportOptions } from "./client/types.js";
import { TcpProxy } from "../../../test/faults/tcp-proxy.js";

const sleep = (time: number) => new Promise((resolve) => setTimeout(resolve, time));

let cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const cleanup of cleanups.reverse()) await Promise.resolve(cleanup()).catch(() => {});
  cleanups = [];
  vi.restoreAllMocks();
});

/** This function waits until `check` is true. `state` describes the state in the failure message. */
async function waitFor(check: () => boolean, limit = 3000, state: () => unknown = () => undefined): Promise<void> {
  const end = Date.now() + limit;
  while (!check()) {
    if (Date.now() > end) throw new Error(`waitFor: condition not met ${JSON.stringify(state())}`);
    await sleep(5);
  }
}

/** What the handlers saw: the runs of each key, and the aborted runs. */
interface Seen {
  runs: Map<string, number>;
  aborted: number;
}

/** This function waits until the signal aborts. */
function aborted(signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve) => {
    if (!signal || signal.aborted) return resolve();
    signal.addEventListener("abort", () => resolve(), { once: true });
  });
}

function registryOf(seen: Seen) {
  /** The first run of a key waits until its call stops. A later run answers at once. */
  const hold = async (input: { key: string }, signal: AbortSignal | undefined): Promise<string> => {
    const run = (seen.runs.get(input.key) ?? 0) + 1;
    seen.runs.set(input.key, run);
    if (run > 1) return "done";
    await aborted(signal);
    seen.aborted++;
    return "stopped";
  };
  return createRegistry({
    name: "reconnect",
    procedures: [
      createProcedure()
        .path(["rc", "echo"])
        .input(z.object({ text: z.string() }))
        .output(z.string())
        .meta({ effects: { reads: [], writes: [] } })
        .handler(async (input) => input.text)
        .build(),
      createProcedure()
        .path(["rc", "readHold"])
        .input(z.object({ key: z.string() }))
        .output(z.string())
        .meta({ effects: { reads: ["data"], writes: [] } })
        .handler(async (input, ctx) => hold(input, ctx.signal))
        .build(),
      createProcedure()
        .path(["rc", "writeHold"])
        .input(z.object({ key: z.string() }))
        .output(z.string())
        .meta({ effects: { reads: [], writes: ["data"] } })
        .handler(async (input, ctx) => hold(input, ctx.signal))
        .build(),
    ],
  });
}

interface Setup {
  server: ProcedureServer;
  wsServer: WebSocketServerTransport;
  proxy: TcpProxy;
  transport: WebSocketTransport;
  client: Client;
  seen: Seen;
  registry: ReturnType<typeof registryOf>;
  serverDisconnects: () => number;
}

/** A server, a proxy in front of it, and a client of the proxy. */
async function setup(
  client: Partial<WebSocketTransportOptions> = {},
  serverHeartbeat: { interval: ReturnType<typeof ms>; misses: number } | false = false,
): Promise<Setup> {
  const seen: Seen = { runs: new Map(), aborted: 0 };
  const registry = registryOf(seen);
  const server = new ProcedureServer({ registry, autoRegister: true });
  const http: HttpServer = createServer();
  const wsServer = new WebSocketServerTransport(server, { server: http, path: "/ws", heartbeat: serverHeartbeat });
  server.addTransport(wsServer);
  await server.start();
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", () => resolve()));
  let disconnects = 0;
  wsServer.onDisconnect(() => disconnects++);
  const proxy = await TcpProxy.start({ host: "127.0.0.1", port: (http.address() as AddressInfo).port });
  const transport = new WebSocketTransport({
    url: `ws://127.0.0.1:${proxy.port}/ws`,
    heartbeat: { enabled: false },
    reconnect: { initialDelay: ms(20), backoffMultiplier: 2, maxDelay: ms(1000), jitter: 0 },
    ...client,
  });
  cleanups.push(async () => {
    await transport.close();
    await proxy.close();
    await server.stop();
    http.closeAllConnections();
    await new Promise<void>((resolve) => http.close(() => resolve()));
  });
  await waitFor(() => transport.isConnected());
  return {
    server,
    wsServer,
    proxy,
    transport,
    client: new Client({ transport, throwOnError: true }),
    seen,
    registry,
    serverDisconnects: () => disconnects,
  };
}

/** The transport logs each connection change: the tests keep the output clean. */
function quiet(): void {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
}

const echo = pathToMethod(["rc", "echo"]);

/** The type of a frame that the client sends, or undefined. */
function frameType(data: unknown): string | undefined {
  if (typeof data !== "string") return undefined;
  try {
    return (JSON.parse(data) as { type?: string }).type;
  } catch {
    return undefined;
  }
}

describe("a reset (R30)", () => {
  it("the client reconnects with a backoff that grows, and the count starts again after a connection", async () => {
    quiet();
    const attempts: number[] = [];
    const env = await setup({ onReconnecting: (attempt) => attempts.push(attempt) });
    const firstAttempt = env.proxy.accepted.length;
    const state = () => ({ attempts, accepted: env.proxy.accepted.length - firstAttempt, state: env.transport.getState() });

    // The first two reconnects meet a refused connection
    env.proxy.refuseNew = true;
    env.proxy.reset();
    await waitFor(() => attempts.length === 3, 3000, state);
    env.proxy.refuseNew = false;
    await waitFor(() => env.transport.isConnected());
    expect(attempts).toEqual([1, 2, 3]);

    // The delays are 20, 40 and 80 ms (jitter 0): each try comes at least its delay after the one before
    const tries = env.proxy.accepted.slice(firstAttempt);
    expect(tries).toHaveLength(3);
    expect(tries[1]! - tries[0]!).toBeGreaterThanOrEqual(40 - 5);
    expect(tries[2]! - tries[1]!).toBeGreaterThanOrEqual(80 - 5);
    expect(await env.client.call(echo, { text: "back" })).toBe("back");

    // A connection sets the count to zero: the next reset starts at attempt 1
    env.proxy.reset();
    await waitFor(() => attempts.length === 4);
    expect(attempts[3]).toBe(1);
    await waitFor(() => env.transport.isConnected());
    expect(await env.client.call(echo, { text: "again" })).toBe("again");
  });
});

/**
 * A WebSocket like the one of Node 22: a failed handshake gives an error event and no close
 * event, and the socket stays in CONNECTING.
 */
class ErrorOnlyWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static created = 0;
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: unknown) => void) | null = null;
  onclose: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  constructor(readonly url: string) {
    ErrorOnlyWebSocket.created++;
    setTimeout(() => this.onerror?.({ type: "error" }), 5);
  }
  send(): void {
    throw new Error("The socket is not open");
  }
  close(): void {
    this.readyState = 3;
  }
}

describe("a failed handshake (R30)", () => {
  it("an error event without a close event (the WebSocket of Node 22) starts the reconnects at once", async () => {
    quiet();
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", ErrorOnlyWebSocket);
    ErrorOnlyWebSocket.created = 0;
    const attempts: number[] = [];
    const reasons: Array<string | undefined> = [];
    const transport = new WebSocketTransport({
      url: "ws://127.0.0.1:9/ws",
      // Without the fix, each try waits for this time limit
      connectionTimeout: ms(5000),
      heartbeat: { enabled: false },
      reconnect: { initialDelay: ms(10), backoffMultiplier: 2, jitter: 0, maxAttempts: 2 },
      onReconnecting: (attempt) => attempts.push(attempt),
      onDisconnect: (reason) => reasons.push(reason),
    });
    try {
      // The tries fail at 5, 20 and 45 ms: two reconnects, then the transport stops
      await vi.advanceTimersByTimeAsync(100);
      expect(attempts).toEqual([1, 2]);
      expect(ErrorOnlyWebSocket.created).toBe(3);
      expect(reasons).toEqual(["Connection failed", "Connection failed", "Connection failed"]);
      expect(transport.getState()).toBe(WebSocketState.DISCONNECTED);
    } finally {
      await transport.close();
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });
});

describe("a black hole (R30)", () => {
  it("only the heartbeat finds it: the client drops the connection after `misses` pings without a pong", async () => {
    quiet();
    const reasons: Array<string | undefined> = [];
    const send = vi.spyOn(WebSocket.prototype, "send");
    const env = await setup(
      {
        heartbeat: { interval: ms(60), timeout: ms(30), misses: 2 },
        connectionTimeout: ms(300),
        onDisconnect: (reason) => reasons.push(reason),
      },
      // The server has a heartbeat too: it closes its side of the dead connection
      { interval: ms(40), misses: 2 },
    );
    const handled = vi.spyOn(env.transport as unknown as { handleMessage(message: { type?: string }): void }, "handleMessage");
    // A heartbeat that works: a pong arrives
    await waitFor(() => handled.mock.calls.some(([message]) => message.type === "pong"));

    env.proxy.blackHole();
    await waitFor(() => reasons.length > 0);
    expect(reasons).toEqual(["Heartbeat timeout"]);
    // The pings after the last pong: exactly `misses`
    const pongs = handled.mock.calls.flatMap(([message], index) => (message.type === "pong" ? [handled.mock.invocationCallOrder[index]!] : []));
    const lastPong = Math.max(...pongs);
    const pings = send.mock.calls.filter(([data], index) => frameType(data) === "ping" && send.mock.invocationCallOrder[index]! > lastPong);
    expect(pings).toHaveLength(2);
    // The server closed the connection too: its pings got no pong
    await waitFor(() => env.serverDisconnects() === 1);

    // The network comes back: the client connects again
    env.proxy.resume();
    await waitFor(() => env.transport.isConnected());
    expect(await env.client.call(echo, { text: "after" })).toBe("after");
  });
});

describe("a pause (R30)", () => {
  it("a pause shorter than the limit of the heartbeat keeps the connection, and the held call arrives", async () => {
    quiet();
    const reasons: Array<string | undefined> = [];
    const send = vi.spyOn(WebSocket.prototype, "send");
    // The client drops after 4 misses (about 190 ms), the server after 4 beats (about 240 ms)
    const env = await setup(
      { heartbeat: { interval: ms(50), timeout: ms(40), misses: 4 }, onDisconnect: (reason) => reasons.push(reason) },
      { interval: ms(60), misses: 4 },
    );
    const pingsBefore = send.mock.calls.filter(([data]) => frameType(data) === "ping").length;

    env.proxy.pause();
    const call = env.client.call(echo, { text: "held" });
    // The pause: 80 ms, so the heartbeat sends a ping during it
    await sleep(80);
    const pingsInPause = send.mock.calls.filter(([data]) => frameType(data) === "ping").length - pingsBefore;
    env.proxy.resume();

    expect(await call).toBe("held");
    expect(pingsInPause).toBeGreaterThanOrEqual(1);
    // Two more rounds of the heartbeat after the pause
    const pingsAfter = send.mock.calls.filter(([data]) => frameType(data) === "ping").length;
    await waitFor(() => send.mock.calls.filter(([data]) => frameType(data) === "ping").length >= pingsAfter + 2);
    expect(reasons).toEqual([]);
    expect(env.serverDisconnects()).toBe(0);
    expect(env.transport.getState()).toBe(WebSocketState.CONNECTED);
    expect(env.proxy.connections).toBe(1);
  });
});

describe("a drop during a call (R30)", () => {
  it("fails the calls in flight with an indeterminate delivery, and the server aborts their handlers", async () => {
    quiet();
    const env = await setup({ reconnect: { enabled: false } });
    const call = env.client.call(pathToMethod(["rc", "writeHold"]), { key: "a" });
    await waitFor(() => env.seen.runs.get("a") === 1);

    env.proxy.reset();
    const error = await call.then(
      () => undefined,
      (failure: unknown) => failure,
    );
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("WebSocket connection closed");
    // The request left, and no answer came: the server can have run it
    expect(isNetworkError(error)).toBe(true);
    expect(isNotSentError(error)).toBe(false);
    expect(deliveryOf(thrownItem("a", error))).toBe("indeterminate");
    await waitFor(() => env.seen.aborted === 1);
    await waitFor(() => env.server.callsInFlight === 0);

    // A call after the drop does not leave: its delivery is "not-sent"
    const later = await env.client.call(echo, { text: "x" }).then(
      () => undefined,
      (failure: unknown) => failure,
    );
    expect((later as Error).message).toBe("WebSocket disconnected");
    expect(deliveryOf(thrownItem("b", later))).toBe("not-sent");
  });

  it("a retry sends an idempotent call again after the reconnect, and not a write", async () => {
    quiet();
    const env = await setup();
    const client = new Client({ transport: env.transport, throwOnError: true }).use(
      createRetryMiddleware({ retryDelay: ms(5), jitter: 0, budget: false, idempotent: idempotentIn(env.registry) }),
    );
    const read = client.call(pathToMethod(["rc", "readHold"]), { key: "read" });
    const write = client.call(pathToMethod(["rc", "writeHold"]), { key: "write" });
    await waitFor(() => env.seen.runs.get("read") === 1 && env.seen.runs.get("write") === 1);

    env.proxy.reset();
    await expect(write).rejects.toThrow("WebSocket connection closed");
    expect(await read).toBe("done");
    // The read ran two times, the write one time
    expect(env.seen.runs.get("read")).toBe(2);
    expect(env.seen.runs.get("write")).toBe(1);
  });
});
