/**
 * The remote events over WebSocket (`documentation/EVENTS.md`), against real servers: two
 * subscribers and their order, credit and a slow subscriber, the resubscribe after a drop, the
 * events in the two directions, the `onEvent` wrapper, and no listener after `close()`.
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { WebSocketServer } from "ws";
import { ms } from "../../duration.js";
import { createRegistry } from "../../procedures/module.js";
import { ProcedureServer } from "../../server/procedure-server.js";
import { createEventBus } from "../../events/bus.js";
import type { EventBus } from "../../events/types.js";
import type { RemoteEvent, SubscriptionError } from "../../events/remote.js";
import { WebSocketTransport } from "./client/transport.js";
import { WebSocketServerTransport } from "./server/transport.js";
import { WebSocketState, type WebSocketTransportOptions } from "./client/types.js";

const sleep = (time: number) => new Promise((resolve) => setTimeout(resolve, time));

let cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const cleanup of cleanups.reverse()) await Promise.resolve(cleanup()).catch(() => {});
  cleanups = [];
  vi.restoreAllMocks();
});

async function waitFor(check: () => boolean, what = "the condition", limit = 5000): Promise<void> {
  const end = Date.now() + limit;
  while (!check()) {
    if (Date.now() > end) throw new Error(`waitFor: ${what}`);
    await sleep(5);
  }
}

function quiet(): void {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
}

/** A server with the remote events of a bus, and a function that makes clients of it. */
async function host(options: { bus?: EventBus; buffer?: number } = {}) {
  const bus = options.bus ?? createEventBus();
  const server = new ProcedureServer({
    registry: createRegistry(),
    events: { bus, topics: ["orders.*", "ticks"], ...(options.buffer ? { buffer: options.buffer } : {}) },
  });
  const http: HttpServer = createServer();
  const wsServer = new WebSocketServerTransport(server, { server: http, path: "/ws", heartbeat: false });
  server.addTransport(wsServer);
  await server.start();
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", () => resolve()));
  const url = `ws://127.0.0.1:${(http.address() as AddressInfo).port}/ws`;
  const clients: WebSocketTransport[] = [];
  cleanups.push(async () => {
    for (const client of clients) await client.close();
    await server.stop();
    http.closeAllConnections();
    await new Promise<void>((resolve) => http.close(() => resolve()));
  });
  const client = (extra: Partial<WebSocketTransportOptions> = {}): WebSocketTransport => {
    const transport = new WebSocketTransport({ url, heartbeat: { enabled: false }, reconnect: { enabled: false }, ...extra });
    clients.push(transport);
    return transport;
  };
  return { bus, server, wsServer, publisher: server.publisher!, client };
}

/** The private maps of the two sides: each must be empty when no call runs. */
function maps(transport: WebSocketTransport, wsServer: WebSocketServerTransport): Record<string, number> {
  const inner = transport as unknown as { pendingRequests: Map<string, unknown>; stateListeners: Set<unknown> };
  const channels = (wsServer as unknown as {
    channels: Map<string, { incoming: { size: number; credits: Map<string, unknown> }; outgoing: { size: number } }>;
  }).channels;
  let server = 0;
  for (const channel of channels.values()) server += channel.incoming.size + channel.incoming.credits.size + channel.outgoing.size;
  return { pending: inner.pendingRequests.size, stateListeners: inner.stateListeners.size, server };
}

describe("two subscribers (EVENTS.md)", () => {
  it("get the events of a topic in the order of emit, on one connection and on two", async () => {
    const { publisher, client } = await host();
    const first = client();
    const second = client();
    const got: Record<string, unknown[]> = { a: [], b: [], c: [] };
    const subscriptions = [
      first.subscribe("orders.created", (data) => void got["a"]!.push(data)),
      first.subscribe(["orders.created", "orders.paid"], (data) => void got["b"]!.push(data)),
      second.subscribe("orders.created", (data) => void got["c"]!.push(data)),
    ];
    await Promise.all(subscriptions.map((subscription) => subscription.ready));
    for (let n = 1; n <= 50; n++) publisher.publish(n % 5 === 0 ? "orders.paid" : "orders.created", n);
    const created = Array.from({ length: 50 }, (_, index) => index + 1).filter((n) => n % 5 !== 0);
    await waitFor(() => got["a"]!.length === 40 && got["b"]!.length === 50 && got["c"]!.length === 40, "each event");
    expect(got["a"]).toEqual(created);
    expect(got["c"]).toEqual(created);
    expect(got["b"]).toEqual(Array.from({ length: 50 }, (_, index) => index + 1));
  });
});

describe("credit and a slow subscriber (EVENTS.md)", () => {
  it("drops the oldest events of the slow subscriber only, and each gap is in dropped", async () => {
    const { publisher, client } = await host({ buffer: 16 });
    const fast: RemoteEvent[] = [];
    const slow: RemoteEvent[] = [];
    const fastTransport = client({ streamWindow: 4 });
    const slowTransport = client({ streamWindow: 4 });
    const fastSubscription = fastTransport.subscribe("ticks", (_data, event) => void fast.push(event));
    // The handler of the slow subscriber gives a promise: the next event waits for it
    const slowSubscription = slowTransport.subscribe("ticks", async (_data, event) => {
      slow.push(event);
      await sleep(15);
    });
    await Promise.all([fastSubscription.ready, slowSubscription.ready]);
    for (let n = 1; n <= 120; n++) {
      publisher.publish("ticks", n);
      await sleep(1);
    }
    await waitFor(() => fast.length === 120 && slow.at(-1)?.seq === 120, "the last event");

    // The fast subscriber lost nothing
    expect(fast.map((event) => event.data)).toEqual(Array.from({ length: 120 }, (_, index) => index + 1));
    expect(fast.every((event) => event.dropped === 0)).toBe(true);
    // The slow subscriber lost events. Its events stay in order, each one at most once, and the
    // gap before each event is its dropped count.
    expect(slow.length).toBeLessThan(120);
    let previous = 0;
    for (const event of slow) {
      expect(event.seq).toBeGreaterThan(previous);
      expect(event.data).toBe(event.seq);
      expect(event.dropped).toBe(event.seq - previous - 1);
      previous = event.seq;
    }
    expect(slow.length + slow.reduce((sum, event) => sum + event.dropped, 0)).toBe(120);
  });
});

describe("the resubscribe after a drop (EVENTS.md)", () => {
  it("sends the subscription again on the new connection, and seq starts again", async () => {
    quiet();
    const { bus, publisher, wsServer, client } = await host();
    const transport = client({ reconnect: { enabled: true, initialDelay: ms(20), maxDelay: ms(50), jitter: 0 } });
    const events: RemoteEvent[] = [];
    const confirmations: number[] = [];
    const iterated: unknown[] = [];
    const subscription = transport.subscribe("orders.created", (_data, event) => void events.push(event), {
      onSubscribed: () => confirmations.push(Date.now()),
    });
    const reader = (async () => {
      for await (const event of transport.events("orders.created")) {
        iterated.push(event.data);
        if (iterated.length === 2) break;
      }
    })();
    await subscription.ready;
    // The handler and the iterator subscribe to one topic on one transport: they share one call
    await waitFor(() => bus.subscriberCount("orders.created") === 1 && publisher.subscriptions === 1, "one shared listener");
    publisher.publish("orders.created", "before");
    await waitFor(() => events.length === 1 && iterated.length === 1, "the first event");

    // The server drops the connection: the client reconnects and resubscribes
    for (const connection of wsServer.getTrackedConnections()) connection.socket.terminate();
    await waitFor(() => confirmations.length === 2, "the second confirmation");
    await waitFor(() => bus.subscriberCount("orders.created") === 1 && publisher.subscriptions === 1, "the new shared listener");
    expect(transport.getState()).toBe(WebSocketState.CONNECTED);
    publisher.publish("orders.created", "after");
    await waitFor(() => events.length === 2, "the event after the reconnect");
    await reader;
    expect(events.map((event) => [event.data, event.seq])).toEqual([
      ["before", 1],
      ["after", 1],
    ]);
    expect(iterated).toEqual(["before", "after"]);
    // The subscription keeps its id after the resubscribe
    expect(new Set(events.map((event) => event.subscription))).toEqual(new Set([subscription.id]));
  });

  it("ends the subscription with an error when the transport stops its reconnects", async () => {
    quiet();
    const { wsServer, client } = await host();
    const transport = client();
    const errors: SubscriptionError[] = [];
    const subscription = transport.subscribe("orders.created", () => undefined, { onError: (error) => errors.push(error) });
    await subscription.ready;
    for (const connection of wsServer.getTrackedConnections()) connection.socket.terminate();
    await waitFor(() => errors.length === 1, "the error");
    expect(errors[0]).toMatchObject({ code: "CONNECTION_CLOSED", retryable: false });
    expect(maps(transport, wsServer)).toEqual({ pending: 0, stateListeners: 0, server: 0 });
  });
});

describe("the events in the two directions (EVENTS.md)", () => {
  it("the server subscribes to the bus of the client, and the client to the bus of the server", async () => {
    quiet();
    const { publisher, wsServer, client } = await host();
    const clientBus = createEventBus();
    const served = new ProcedureServer({ registry: createRegistry(), events: { bus: clientBus, topics: ["ui.*"] } });
    const transport = client({ serve: served });
    await waitFor(() => wsServer.getTrackedConnections().length === 1, "the connection");
    const id = wsServer.getTrackedConnections()[0]!.id;

    const atServer: unknown[] = [];
    const atClient: unknown[] = [];
    const serverErrors: SubscriptionError[] = [];
    const toClient = wsServer.subscribe(id, "ui.clicked", (data) => void atServer.push(data), { onError: (error) => serverErrors.push(error) });
    const toServer = transport.subscribe("orders.created", (data) => void atClient.push(data));
    await Promise.all([toClient.ready, toServer.ready]);

    served.publish("ui.clicked", { button: "ok" });
    publisher.publish("orders.created", { order: 7 });
    await waitFor(() => atServer.length === 1 && atClient.length === 1, "an event each way");
    expect(atServer).toEqual([{ button: "ok" }]);
    expect(atClient).toEqual([{ order: 7 }]);

    // The server's subscription to a topic outside the rule of the client is refused
    const refused = wsServer.subscribe(id, "orders.created", () => undefined);
    await expect(refused.ready).rejects.toMatchObject({ code: "TOPIC_NOT_FOUND" });

    // The close of the client ends the subscription of the server, and the listeners go
    await transport.close();
    await waitFor(() => serverErrors.length === 1, "the end of the server's subscription");
    expect(clientBus.subscriberCount("ui.clicked")).toBe(0);
    expect(served.publisher!.subscriptions).toBe(0);
  });

  it("two subscriptions of the server on one connection share one call, and the close removes the transport of the connection", async () => {
    quiet();
    const { wsServer, client } = await host();
    const clientBus = createEventBus();
    const served = new ProcedureServer({ registry: createRegistry(), events: { bus: clientBus, topics: ["ui.*"] } });
    const transport = client({ serve: served });
    await waitFor(() => wsServer.getTrackedConnections().length === 1, "the connection");
    const id = wsServer.getTrackedConnections()[0]!.id;
    const got: string[] = [];
    const errors: string[] = [];
    const first = wsServer.subscribe(id, "ui.clicked", () => void got.push("first"), { onError: (error) => errors.push(error.code) });
    const second = wsServer.subscribe(id, "ui.clicked", () => void got.push("second"), { onError: (error) => errors.push(error.code) });
    await Promise.all([first.ready, second.ready]);
    expect(served.publisher!.subscriptions).toBe(1);
    served.publish("ui.clicked", 1);
    await waitFor(() => got.length === 2, "the event for each subscription");
    expect(got.sort()).toEqual(["first", "second"]);

    // The close of the client ends the shared call: each subscription gets the end
    await transport.close();
    await waitFor(() => errors.length === 2, "the end of each subscription");
    expect(served.publisher!.subscriptions).toBe(0);
    await waitFor(() => (wsServer as unknown as { eventTransports: Map<string, unknown> }).eventTransports.size === 0, "the transport of the connection goes");
  });

  it("gives an iterator of the events of a client to the server", async () => {
    quiet();
    const { wsServer, client } = await host();
    const clientBus = createEventBus();
    const served = new ProcedureServer({ registry: createRegistry(), events: { bus: clientBus, topics: ["*"] } });
    client({ serve: served });
    await waitFor(() => wsServer.getTrackedConnections().length === 1, "the connection");
    const id = wsServer.getTrackedConnections()[0]!.id;
    let confirmed = false;
    const reader = (async () => {
      const seen: unknown[] = [];
      for await (const event of wsServer.events(id, "progress", { onSubscribed: () => (confirmed = true) })) {
        seen.push(event.data);
        if (seen.length === 3) break;
      }
      return seen;
    })();
    await waitFor(() => confirmed, "the confirmation");
    for (let n = 1; n <= 3; n++) served.publish("progress", n);
    expect(await reader).toEqual([1, 2, 3]);
    await waitFor(() => clientBus.subscriberCount("progress") === 0, "the listener goes");
  });
});

describe("the onEvent wrapper (EVENTS.md)", () => {
  it("gets each event of each subscription, with the id of its subscription", async () => {
    const seen: Array<[string, unknown, string]> = [];
    const { publisher, client } = await host();
    const transport = client({ onEvent: (topic, data, subscriptionId) => seen.push([topic, data, subscriptionId]) });
    const first = transport.subscribe("orders.created", () => undefined);
    const second = transport.subscribe("orders.paid", () => undefined);
    await Promise.all([first.ready, second.ready]);
    publisher.publish("orders.created", 1);
    publisher.publish("orders.paid", 2);
    await waitFor(() => seen.length === 2, "two events");
    expect(seen).toEqual(expect.arrayContaining([["orders.created", 1, first.id], ["orders.paid", 2, second.id]]));
  });

  it("still gets a raw event frame of a server outside this repository", async () => {
    const http = createServer();
    const wss = new WebSocketServer({ server: http, path: "/ws" });
    wss.on("connection", (socket) => {
      socket.send(JSON.stringify({ id: "e1", type: "event", topic: "legacy", data: { n: 1 }, subscriptionId: "s1" }));
    });
    await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", () => resolve()));
    const seen: unknown[] = [];
    const transport = new WebSocketTransport({
      url: `ws://127.0.0.1:${(http.address() as AddressInfo).port}/ws`,
      heartbeat: { enabled: false },
      reconnect: { enabled: false },
      onEvent: (topic, data, subscriptionId) => seen.push({ topic, data, subscriptionId }),
    });
    cleanups.push(async () => {
      await transport.close();
      for (const socket of wss.clients) socket.terminate();
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      http.closeAllConnections();
      await new Promise<void>((resolve) => http.close(() => resolve()));
    });
    await waitFor(() => seen.length === 1, "the raw event");
    expect(seen).toEqual([{ topic: "legacy", data: { n: 1 }, subscriptionId: "s1" }]);
  });
});

describe("no listener after close (EVENTS.md, R30)", () => {
  it("close() ends each subscription and iterator: the bus, the publisher and the maps are empty", async () => {
    const { bus, publisher, wsServer, client } = await host();
    const transport = client();
    const errors: SubscriptionError[] = [];
    const subscriptions = [
      transport.subscribe("orders.created", () => undefined, { onError: (error) => errors.push(error) }),
      transport.subscribe(["orders.created", "orders.paid"], () => undefined, { onError: (error) => errors.push(error) }),
    ];
    let iteratorEnded = false;
    let confirmed = false;
    const reader = (async () => {
      for await (const _event of transport.events("ticks", { onSubscribed: () => (confirmed = true) })) {
        // no event comes
      }
      iteratorEnded = true;
    })();
    await Promise.all(subscriptions.map((subscription) => subscription.ready));
    await waitFor(() => confirmed, "the iterator's confirmation");
    expect(publisher.subscriptions).toBe(3);

    await transport.close();
    await reader;
    expect(iteratorEnded).toBe(true);
    await waitFor(() => publisher.subscriptions === 0, "the subscriptions end");
    expect(bus.subscriberCount("orders.created")).toBe(0);
    expect(bus.subscriberCount("orders.paid")).toBe(0);
    expect(bus.subscriberCount("ticks")).toBe(0);
    expect(errors).toEqual([]);
    await waitFor(() => maps(transport, wsServer)["server"] === 0, "the server maps");
    expect(maps(transport, wsServer)).toEqual({ pending: 0, stateListeners: 0, server: 0 });
  });

  it("a subscription before the connection waits for it, and close() before it ends it", async () => {
    const { bus, client } = await host();
    const transport = client();
    expect(transport.getState()).toBe(WebSocketState.CONNECTING);
    const subscription = transport.subscribe("orders.created", () => undefined);
    await transport.close();
    await expect(subscription.ready).rejects.toMatchObject({ code: "ABORTED" });
    expect(bus.subscriberCount("orders.created")).toBe(0);
    expect((transport as unknown as { stateListeners: Set<unknown> }).stateListeners.size).toBe(0);
  });
});
