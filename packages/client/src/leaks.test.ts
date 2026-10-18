/**
 * Leak tests (roadmap R30): after 1,000 aborted calls, the maps of the servers and the clients
 * are empty.
 *
 * Each face gets the same mix of calls: an abort before the call, an abort while the handler
 * runs, an abort of a stream after its first item, and an abort of a keyed write while its
 * handler runs. A keyed write runs on after its caller goes away (roadmap R1), so the test lets
 * the handlers end. Then it reads the counters and the private maps:
 *
 * - `ProcedureServer.callsInFlight` and the entries of the idempotency cache, which expire.
 * - HTTP: the open requests of the server transport, and its keep-alive timers.
 * - WebSocket: the pending calls of the client, and the calls and the stream credit of each
 *   connection of the server, in the two directions.
 * - Each face: the handlers that run, and the abort listeners on the signal of each call.
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { getEventListeners } from "node:events";
import express from "express";
import { z } from "zod";
import { Client } from "./client/client.js";
import type { Transport } from "./client/types.js";
import { HttpTransport } from "./adapters/http/client/transport.js";
import { HttpServerTransport } from "./adapters/http/server/transport.js";
import { LocalTransport } from "./adapters/local/client/transport.js";
import { WebSocketTransport } from "./adapters/websocket/client/transport.js";
import { WebSocketServerTransport } from "./adapters/websocket/server/transport.js";
import { ms } from "./duration.js";
import { createProcedure } from "./procedures/define.js";
import { createRegistry } from "./procedures/module.js";
import { ProcedureServer } from "./server/procedure-server.js";
import { pathToMethod } from "./server/method.js";
import { createEventBus } from "./events/bus.js";
import { countingClock } from "../test/counting-clock.js";

/** The number of aborted calls of each face. */
const CALLS = 1000;
/** The calls that run at the same time. */
const BATCH = 50;
/** The time to live of the idempotency results, on the clock of the test. */
const TTL = 60_000;

const sleep = (time: number) => new Promise((resolve) => setTimeout(resolve, time));

let cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const cleanup of cleanups.reverse()) await Promise.resolve(cleanup()).catch(() => {});
  cleanups = [];
  vi.restoreAllMocks();
});

async function waitFor(check: () => boolean, what: string, limit = 10_000): Promise<void> {
  const end = Date.now() + limit;
  while (!check()) {
    if (Date.now() > end) throw new Error(`waitFor: ${what}`);
    await sleep(5);
  }
}

/** The handlers: what runs now, and a signal for each call that started. */
class Handlers {
  running = 0;
  private readonly started = new Map<number, () => void>();
  private release: () => void = () => undefined;
  private readonly released = new Promise<void>((resolve) => (this.release = resolve));

  /** A promise that resolves when the handler of call `n` starts. */
  whenStarted(n: number): Promise<void> {
    return new Promise((resolve) => this.started.set(n, resolve));
  }

  start(n: number): void {
    this.running++;
    this.started.get(n)?.();
    this.started.delete(n);
  }

  /** The keyed writes end. */
  releaseWrites(): void {
    this.release();
  }

  /** The handlers wait for this promise, or for the abort of their signal. */
  until(signal: AbortSignal | undefined): Promise<void> {
    return Promise.race([
      this.released,
      new Promise<void>((resolve) => {
        if (!signal || signal.aborted) return resolve();
        signal.addEventListener("abort", () => resolve(), { once: true });
      }),
    ]);
  }
}

function registryOf(handlers: Handlers) {
  const input = z.object({ n: z.number() });
  return createRegistry({
    name: "leak",
    procedures: [
      createProcedure()
        .path(["leak", "wait"])
        .input(input)
        .output(z.string())
        .meta({ effects: { reads: [], writes: [] } })
        .handler(async ({ n }, ctx) => {
          handlers.start(n);
          try {
            await handlers.until(ctx.signal);
            return "ended";
          } finally {
            handlers.running--;
          }
        })
        .build(),
      createProcedure()
        .path(["leak", "ticks"])
        .input(input)
        .output(z.number())
        .meta({ effects: { reads: [], writes: [] } })
        .handler(async function* ({ n }: { n: number }, ctx: { signal?: AbortSignal }) {
          handlers.start(n);
          try {
            for (let tick = 0; tick < 1_000_000 && !ctx.signal?.aborted; tick++) {
              yield tick;
              await new Promise((resolve) => setImmediate(resolve));
            }
          } finally {
            handlers.running--;
          }
        } as never)
        .build(),
      createProcedure()
        .path(["leak", "write"])
        .input(input)
        .output(z.string())
        .meta({ effects: { reads: [], writes: ["data"] } })
        .handler(async ({ n }, ctx) => {
          handlers.start(n);
          try {
            await handlers.until(ctx.signal);
            return "written";
          } finally {
            handlers.running--;
          }
        })
        .build(),
    ],
  });
}

/** One face: a client, its procedures, and the checks of its maps after the calls. */
interface Face {
  client: Client;
  handlers: Handlers;
  /** The servers whose calls in flight must end, and whose idempotency entries must expire */
  servers: ProcedureServer[];
  /** The sizes of the private maps, by name: each must be 0 at the end */
  maps(): Record<string, number>;
}

/** The kind of call `n`: an abort before the call, during the handler, during a stream, during a keyed write. */
type Kind = "before" | "during" | "stream" | "keyed";
const KINDS: readonly Kind[] = ["before", "during", "stream", "keyed"];

/** This function sends call `n` of its kind, aborts it, and gives its signal. */
async function abortedCall(face: Face, n: number): Promise<{ signal: AbortSignal; error: unknown }> {
  const kind = KINDS[n % KINDS.length]!;
  const controller = new AbortController();
  const { signal } = controller;
  const fail = (promise: Promise<unknown>) =>
    promise.then(
      () => new Error(`call ${n} (${kind}) did not fail`),
      (error: unknown) => error,
    );
  if (kind === "before") {
    controller.abort();
    return { signal, error: await fail(face.client.call(pathToMethod(["leak", "wait"]), { n }, { signal })) };
  }
  if (kind === "stream") {
    const read = (async () => {
      for await (const tick of face.client.stream(pathToMethod(["leak", "ticks"]), { n }, { signal })) {
        if (tick === 0) controller.abort();
      }
    })();
    return { signal, error: await fail(read) };
  }
  const started = face.handlers.whenStarted(n);
  const path = kind === "keyed" ? ["leak", "write"] : ["leak", "wait"];
  // The idempotency key of a keyed call: the server runs it one time, and keeps its result
  const context = kind === "keyed" ? { "idempotency-key": `key-${n}` } : {};
  const call = fail(face.client.call(pathToMethod(path), { n }, { signal, context }));
  await started;
  controller.abort();
  return { signal, error: await call };
}

/** This function sends the 1,000 aborted calls, lets the handlers end, and checks each map. */
async function examine(face: Face, clock: { now: number }): Promise<void> {
  const signals: AbortSignal[] = [];
  for (let first = 0; first < CALLS; first += BATCH) {
    const batch = Array.from({ length: BATCH }, (_, index) => abortedCall(face, first + index));
    for (const { signal, error } of await Promise.all(batch)) {
      signals.push(signal);
      // Each call fails with ABORTED
      expect((error as { code?: unknown }).code).toBe("ABORTED");
    }
  }
  face.handlers.releaseWrites();
  await waitFor(() => face.handlers.running === 0, "the handlers end");
  for (const server of face.servers) await waitFor(() => server.callsInFlight === 0, "no call in flight");
  // A map that keeps an entry fails here with its name
  await waitFor(() => Object.values(face.maps()).every((size) => size === 0), "the maps are empty", 2000).catch(() => undefined);
  expect(face.maps()).toEqual(Object.fromEntries(Object.keys(face.maps()).map((name) => [name, 0])));
  // No listener stays on the signal of a call
  expect(signals.filter((signal) => getEventListeners(signal, "abort").length > 0)).toHaveLength(0);

  // The idempotency results of the keyed writes expire: after the time to live, the next keyed
  // call removes them, and the cache holds only its own result
  for (const server of face.servers) {
    const cache = (server as unknown as { idempotency: { size: number } }).idempotency;
    expect(cache.size).toBeGreaterThan(0);
    expect(cache.size).toBeLessThanOrEqual(CALLS / KINDS.length);
  }
  clock.now += TTL + 1;
  const started = face.handlers.whenStarted(CALLS);
  const last = face.client.call(pathToMethod(["leak", "write"]), { n: CALLS }, { context: { "idempotency-key": "last" } });
  await started;
  face.handlers.releaseWrites();
  expect(await last).toBe("written");
  for (const server of face.servers) {
    expect((server as unknown as { idempotency: { size: number } }).idempotency.size).toBe(1);
  }
}

/** A procedure server with the test clock in its idempotency cache. */
function serverOf(handlers: Handlers, clock: { now: number }): ProcedureServer {
  return new ProcedureServer({ registry: registryOf(handlers), autoRegister: true, idempotency: { ttl: ms(TTL), maxEntries: 10 * CALLS, now: () => clock.now } });
}

async function listen(http: HttpServer): Promise<number> {
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", () => resolve()));
  return (http.address() as AddressInfo).port;
}

function quiet(): void {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
}

// The calls take about 3 s on a laptop: the limit leaves room for a slow machine
describe("no leak after 1,000 aborted calls (R30)", { timeout: 30_000 }, () => {
  it("HTTP", async () => {
    quiet();
    const clock = { now: 0 };
    const handlers = new Handlers();
    const server = serverOf(handlers, clock);
    const app = express();
    const http = createServer(app);
    // Each NDJSON stream starts a keep-alive timer: each stream that ends must stop its timer
    const timers = countingClock();
    const transport = new HttpServerTransport(server, { app, httpServer: http, clock: timers });
    server.addTransport(transport);
    await server.start();
    const port = await listen(http);
    cleanups.push(async () => {
      await server.stop();
      http.closeAllConnections();
      await new Promise<void>((resolve) => http.close(() => resolve()));
    });
    const client = new Client({ transport: new HttpTransport({ baseUrl: `http://127.0.0.1:${port}/api` }), throwOnError: true });
    await examine(
      {
        client,
        handlers,
        servers: [server],
        maps: () => ({
          "HttpServerTransport.openRequests": (transport as unknown as { handler: { inFlight(): number } }).handler.inFlight(),
          "HttpServerTransport.keepAliveTimers": timers.live,
        }),
      },
      clock,
    );
    // The streams started keep-alive timers, so the count of 0 above is a real check
    expect(timers.started).toBeGreaterThan(0);
  });

  it("WebSocket", async () => {
    quiet();
    const clock = { now: 0 };
    const handlers = new Handlers();
    const server = serverOf(handlers, clock);
    const http = createServer();
    const wsServer = new WebSocketServerTransport(server, { server: http, path: "/ws", heartbeat: false });
    server.addTransport(wsServer);
    await server.start();
    const port = await listen(http);
    const transport = new WebSocketTransport({ url: `ws://127.0.0.1:${port}/ws`, heartbeat: { enabled: false }, reconnect: { enabled: false } });
    cleanups.push(async () => {
      await transport.close();
      await server.stop();
      http.closeAllConnections();
      await new Promise<void>((resolve) => http.close(() => resolve()));
    });
    await waitFor(() => transport.isConnected(), "the connection");
    await examine(
      { client: new Client({ transport, throwOnError: true }), handlers, servers: [server], maps: () => ({ ...clientMaps(transport), ...serverMaps(wsServer) }) },
      clock,
    );
  });

  it("LocalTransport", async () => {
    quiet();
    const handlers = new Handlers();
    const registry = registryOf(handlers);
    const client = new Client({ transport: new LocalTransport({ registry }), throwOnError: true });
    // The local transport has no server and no idempotency cache: the keyed write stops with its caller
    const signals: AbortSignal[] = [];
    for (let first = 0; first < CALLS; first += BATCH) {
      const face: Face = { client, handlers, servers: [], maps: () => ({}) };
      const batch = Array.from({ length: BATCH }, (_, index) => abortedCall(face, first + index));
      for (const { signal, error } of await Promise.all(batch)) {
        signals.push(signal);
        expect((error as { code?: unknown }).code).toBe("ABORTED");
      }
    }
    await waitFor(() => handlers.running === 0, "the handlers end");
    expect(signals.filter((signal) => getEventListeners(signal, "abort").length > 0)).toHaveLength(0);
  });

  it("WebSocket, the calls of the server to the client", async () => {
    quiet();
    const clock = { now: 0 };
    const handlers = new Handlers();
    // The client serves the procedures. The server of the connection serves nothing.
    const served = serverOf(handlers, clock);
    const host = new ProcedureServer({ registry: createRegistry() });
    const http = createServer();
    const wsServer = new WebSocketServerTransport(host, { server: http, path: "/ws", heartbeat: false });
    host.addTransport(wsServer);
    await host.start();
    const port = await listen(http);
    const transport = new WebSocketTransport({ url: `ws://127.0.0.1:${port}/ws`, heartbeat: { enabled: false }, reconnect: { enabled: false }, serve: served });
    cleanups.push(async () => {
      await transport.close();
      await host.stop();
      await served.stop();
      http.closeAllConnections();
      await new Promise<void>((resolve) => http.close(() => resolve()));
    });
    await waitFor(() => wsServer.getTrackedConnections().length === 1, "the connection");
    const reverse: Transport = wsServer.transportFor(wsServer.getTrackedConnections()[0]!.id);
    await examine(
      { client: new Client({ transport: reverse, throwOnError: true }), handlers, servers: [served], maps: () => ({ ...clientMaps(transport), ...serverMaps(wsServer) }) },
      clock,
    );
  });
});

// The remote events (documentation/EVENTS.md): a subscription is a stream without an end, so each
// of its ends must remove the listeners on the bus and the entries of the two sides
describe("no leak after 1,000 subscriptions (R30, EVENTS.md)", { timeout: 30_000 }, () => {
  it("WebSocket: an unsubscribe before and after the confirmation, after an event, a break and an abort", async () => {
    quiet();
    const bus = createEventBus();
    const host = new ProcedureServer({ registry: createRegistry(), events: { bus, topics: ["*"] } });
    const http = createServer();
    const wsServer = new WebSocketServerTransport(host, { server: http, path: "/ws", heartbeat: false });
    host.addTransport(wsServer);
    await host.start();
    const port = await listen(http);
    const transport = new WebSocketTransport({ url: `ws://127.0.0.1:${port}/ws`, heartbeat: { enabled: false }, reconnect: { enabled: false } });
    cleanups.push(async () => {
      await transport.close();
      await host.stop();
      http.closeAllConnections();
      await new Promise<void>((resolve) => http.close(() => resolve()));
    });
    await waitFor(() => transport.isConnected(), "the connection");

    const signals: AbortSignal[] = [];
    /** Subscription `n` of its kind, until its end. */
    const subscription = async (n: number): Promise<void> => {
      const topic = `topic-${n % 7}`;
      const controller = new AbortController();
      signals.push(controller.signal);
      const kind = n % 5;
      if (kind === 3) {
        // An iterator that breaks after its first event
        let confirmed = false;
        const reader = (async () => {
          for await (const _event of transport.events(topic, { signal: controller.signal, onSubscribed: () => (confirmed = true) })) break;
        })();
        await waitFor(() => confirmed, "the confirmation of an iterator");
        bus.emit(topic, n);
        await reader;
        return;
      }
      let got = false;
      const unsubscribe = transport.subscribe(topic, () => void (got = true), { signal: controller.signal });
      if (kind === 0) {
        // Before the confirmation
        unsubscribe();
        await unsubscribe.ready.catch(() => undefined);
        return;
      }
      await unsubscribe.ready;
      if (kind === 2) {
        bus.emit(topic, n);
        await waitFor(() => got, "an event");
      }
      // The abort of the signal of the options ends a subscription too
      if (kind === 4) controller.abort();
      else unsubscribe();
    };
    for (let first = 0; first < CALLS; first += BATCH) {
      await Promise.all(Array.from({ length: BATCH }, (_, index) => subscription(first + index)));
    }

    await waitFor(() => host.publisher!.subscriptions === 0, "the subscriptions of the publisher end");
    await waitFor(() => host.callsInFlight === 0, "no call in flight");
    // A map that keeps an entry fails here with its name
    await waitFor(() => Object.values({ ...clientMaps(transport), ...serverMaps(wsServer) }).every((size) => size === 0), "the maps are empty", 2000).catch(() => undefined);
    expect({ ...clientMaps(transport), ...serverMaps(wsServer) }).toEqual({
      "client.pendingRequests": 0,
      "client.stateListeners": 0,
      "client.incoming": 0,
      "client.incoming.credits": 0,
      "server.incoming": 0,
      "server.incoming.credits": 0,
      "server.outgoing": 0,
    });
    // No listener stays on the bus, or on the signal of a subscription
    expect(bus.channels()).toEqual([]);
    expect(signals.filter((signal) => getEventListeners(signal, "abort").length > 0)).toHaveLength(0);
  });
});

/** The private maps of a WebSocket client: its pending calls, and the calls of the server that it serves. */
function clientMaps(transport: WebSocketTransport): Record<string, number> {
  const inner = transport as unknown as {
    pendingRequests: Map<string, unknown>;
    stateListeners: Set<unknown>;
    incoming?: { size: number; credits: Map<string, unknown> };
  };
  return {
    "client.pendingRequests": inner.pendingRequests.size,
    "client.stateListeners": inner.stateListeners.size,
    "client.incoming": inner.incoming?.size ?? 0,
    "client.incoming.credits": inner.incoming?.credits.size ?? 0,
  };
}

/** The private maps of a WebSocket server: the calls and the stream credit of each connection, in the two directions. */
function serverMaps(wsServer: WebSocketServerTransport): Record<string, number> {
  const channels = (wsServer as unknown as {
    channels: Map<string, { incoming: { size: number; credits: Map<string, unknown> }; outgoing: { size: number } }>;
  }).channels;
  let incoming = 0;
  let credits = 0;
  let outgoing = 0;
  for (const channel of channels.values()) {
    incoming += channel.incoming.size;
    credits += channel.incoming.credits.size;
    outgoing += channel.outgoing.size;
  }
  return { "server.incoming": incoming, "server.incoming.credits": credits, "server.outgoing": outgoing };
}
