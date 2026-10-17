/**
 * The remote events on each face (`documentation/EVENTS.md`), as the conformance suite of R18
 * does for the calls: `LocalTransport`, HTTP with NDJSON and WebSocket. A subscriber subscribes,
 * receives, and unsubscribes. The unknown and the refused topic give the same codes on each face.
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import type { Transport } from "../client/types.js";
import { HttpTransport } from "../adapters/http/client/index.js";
import { HttpServerTransport } from "../adapters/http/server/index.js";
import { LocalTransport } from "../adapters/local/client/transport.js";
import { WebSocketTransport } from "../adapters/websocket/client/transport.js";
import { WebSocketServerTransport } from "../adapters/websocket/server/transport.js";
import { createRegistry } from "../procedures/module.js";
import type { Capability } from "../procedures/types.js";
import { ProcedureServer } from "../server/procedure-server.js";
import { seconds } from "../duration.js";
import { createEventBus } from "./bus.js";
import { EventPublisher, topicMatcher, type EventPublisherOptions } from "./publisher.js";
import { remoteEvents, subscribeRemote, SubscriptionError, type RemoteEvent } from "./remote.js";
import type { EventBus } from "./types.js";

const sleep = (time: number) => new Promise((resolve) => setTimeout(resolve, time));

let cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const cleanup of cleanups.reverse()) await Promise.resolve(cleanup()).catch(() => {});
  cleanups = [];
  vi.restoreAllMocks();
});

async function waitFor(check: () => boolean, what = "the condition", limit = 3000): Promise<void> {
  const end = Date.now() + limit;
  while (!check()) {
    if (Date.now() > end) throw new Error(`waitFor: ${what}`);
    await sleep(5);
  }
}

async function listen(http: HttpServer): Promise<number> {
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", () => resolve()));
  return (http.address() as AddressInfo).port;
}

/** The topics of the tests: `orders.*` for each call, `secret.*` only with the clearance "high". */
function publisherOptions(bus: EventBus): EventPublisherOptions {
  return {
    bus,
    topics: ["orders.*", "secret.*"],
    allow: (topic, call) => !topic.startsWith("secret.") || call.capability.clearance === "high",
  };
}

interface Face {
  name: string;
  /** A transport to a host that serves the publisher, with the capability of each call. */
  transport(publisher: EventPublisher, capability?: Capability): Promise<Transport>;
}

const faces: Face[] = [
  {
    name: "LocalTransport",
    async transport(publisher, capability) {
      return new LocalTransport({ registry: createRegistry(), events: publisher, ...(capability ? { capability } : {}) });
    },
  },
  {
    name: "HTTP",
    async transport(publisher, capability) {
      const server = new ProcedureServer({ registry: createRegistry(), autoRegister: true, events: publisher, ...(capability ? { capability } : {}) });
      const app = express();
      const http = createServer(app);
      server.addTransport(new HttpServerTransport(server, { app, httpServer: http }));
      await server.start();
      const port = await listen(http);
      cleanups.push(async () => {
        await server.stop();
        http.closeAllConnections();
        await new Promise<void>((resolve) => http.close(() => resolve()));
      });
      return new HttpTransport({ baseUrl: `http://127.0.0.1:${port}/api` });
    },
  },
  {
    name: "WebSocket",
    async transport(publisher, capability) {
      const server = new ProcedureServer({ registry: createRegistry(), autoRegister: true, events: publisher, ...(capability ? { capability } : {}) });
      const http = createServer();
      server.addTransport(new WebSocketServerTransport(server, { server: http, path: "/ws", heartbeat: false }));
      await server.start();
      const port = await listen(http);
      const transport = new WebSocketTransport({ url: `ws://127.0.0.1:${port}/ws`, heartbeat: { enabled: false }, reconnect: { enabled: false } });
      cleanups.push(async () => {
        await transport.close();
        await server.stop();
        http.closeAllConnections();
        await new Promise<void>((resolve) => http.close(() => resolve()));
      });
      return transport;
    },
  },
];

describe.each(faces)("the remote events of $name (EVENTS.md)", (face) => {
  it("subscribes, receives the events in order, and unsubscribes", async () => {
    const bus = createEventBus();
    const publisher = new EventPublisher(publisherOptions(bus));
    const transport = await face.transport(publisher);
    const seen: Array<{ data: unknown; event: RemoteEvent }> = [];
    const confirmations: string[][] = [];
    const unsubscribe = subscribeRemote(transport, ["orders.created", "orders.paid"], (data, event) => {
      seen.push({ data, event });
    }, { onSubscribed: (topics) => confirmations.push([...topics]) });
    await unsubscribe.ready;
    expect(confirmations).toEqual([["orders.created", "orders.paid"]]);
    expect(bus.subscriberCount("orders.created")).toBe(1);
    expect(publisher.subscriptions).toBe(1);

    publisher.publish("orders.created", { order: 1 });
    publisher.publish("orders.other", { order: 0 });
    publisher.publish("orders.paid", { order: 1, paid: true });
    publisher.publish("orders.created", { order: 2 });
    await waitFor(() => seen.length === 3, "three events");
    expect(seen.map(({ data }) => data)).toEqual([{ order: 1 }, { order: 1, paid: true }, { order: 2 }]);
    expect(seen.map(({ event }) => [event.topic, event.seq, event.dropped])).toEqual([
      ["orders.created", 1, 0],
      ["orders.paid", 2, 0],
      ["orders.created", 3, 0],
    ]);
    expect(seen.every(({ event }) => event.subscription === unsubscribe.id)).toBe(true);

    unsubscribe();
    await waitFor(() => bus.subscriberCount("orders.created") === 0 && publisher.subscriptions === 0, "the listeners go");
    publisher.publish("orders.created", { order: 3 });
    await sleep(30);
    expect(seen).toHaveLength(3);
  });

  it("gives the events as an async iterator, and the break unsubscribes", async () => {
    const bus = createEventBus();
    const publisher = new EventPublisher(publisherOptions(bus));
    const transport = await face.transport(publisher);
    const received: unknown[] = [];
    let confirmed = false;
    const reader = (async () => {
      for await (const event of remoteEvents(transport, "orders.created", { onSubscribed: () => (confirmed = true) })) {
        received.push(event.data);
        if (received.length === 2) break;
      }
    })();
    await waitFor(() => confirmed, "the confirmation");
    publisher.publish("orders.created", 1);
    publisher.publish("orders.created", 2);
    publisher.publish("orders.created", 3);
    await reader;
    expect(received).toEqual([1, 2]);
    await waitFor(() => bus.subscriberCount("orders.created") === 0 && publisher.subscriptions === 0, "the listeners go");
  });

  it("refuses an unknown topic with TOPIC_NOT_FOUND, and adds no listener", async () => {
    const bus = createEventBus();
    const publisher = new EventPublisher(publisherOptions(bus));
    const transport = await face.transport(publisher);
    const errors: SubscriptionError[] = [];
    const subscription = subscribeRemote(transport, ["orders.created", "users.created"], () => undefined, { onError: (error) => errors.push(error) });
    await expect(subscription.ready).rejects.toMatchObject({ code: "TOPIC_NOT_FOUND", retryable: false });
    await waitFor(() => errors.length === 1, "the error");
    expect(errors[0]).toBeInstanceOf(SubscriptionError);
    expect(errors[0]!.message).toContain("users.created");
    expect(bus.subscriberCount("orders.created")).toBe(0);
    expect(publisher.subscriptions).toBe(0);
  });

  it("refuses a topic that allow refuses with FORBIDDEN and the reason topic-not-allowed", async () => {
    const bus = createEventBus();
    const publisher = new EventPublisher(publisherOptions(bus));
    const transport = await face.transport(publisher, { clearance: "low" });
    const iteration = (async () => {
      for await (const _event of remoteEvents(transport, "secret.plans")) break;
    })();
    await expect(iteration).rejects.toMatchObject({ code: "FORBIDDEN", reason: "topic-not-allowed" });
    expect(bus.subscriberCount("secret.plans")).toBe(0);

    // With the clearance, the same topic is open
    const allowed = await face.transport(publisher, { clearance: "high" });
    const subscription = subscribeRemote(allowed, "secret.plans", () => undefined);
    await subscription.ready;
    subscription();
  });

  it("refuses each subscription when the capability does not permit the read of events", async () => {
    const bus = createEventBus();
    const publisher = new EventPublisher(publisherOptions(bus));
    const transport = await face.transport(publisher, { effects: { reads: ["fs"] } });
    const subscription = subscribeRemote(transport, "orders.created", () => undefined);
    await expect(subscription.ready).rejects.toMatchObject({ code: "FORBIDDEN", reason: "effects-exceeded" });
  });

  it("refuses an empty list of topics with VALIDATION_ERROR", async () => {
    const publisher = new EventPublisher(publisherOptions(createEventBus()));
    const transport = await face.transport(publisher);
    const subscription = subscribeRemote(transport, [], () => undefined);
    await expect(subscription.ready).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("a host without the option events", () => {
  it("answers NOT_FOUND, and the subscriber does not resubscribe", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const transport = new LocalTransport({ registry: createRegistry() });
    let calls = 0;
    const counting: Transport = {
      name: "counting",
      send: (message) => {
        calls++;
        return transport.send(message);
      },
      close: () => transport.close(),
    };
    const subscription = subscribeRemote(counting, "orders.created", () => undefined);
    await expect(subscription.ready).rejects.toMatchObject({ code: "NOT_FOUND" });
    await sleep(20);
    expect(calls).toBe(1);
  });
});

describe("the publisher", () => {
  it("matches the topics of its rule: an exact name, a prefix and *", () => {
    const rule = topicMatcher(["orders.created", "system:*"]);
    expect(rule("orders.created")).toBe(true);
    expect(rule("orders.paid")).toBe(false);
    expect(rule("system:error")).toBe(true);
    expect(rule("system")).toBe(false);
    expect(topicMatcher(["*"])("anything")).toBe(true);
    expect(topicMatcher((topic) => topic.length === 1)("a")).toBe(true);
  });

  it("drops the oldest events for a slow reader, and the next event tells the loss", async () => {
    const bus = createEventBus();
    const publisher = new EventPublisher({ bus, topics: ["*"], buffer: 3 });
    const transport = new LocalTransport({ events: publisher });
    let confirmed = false;
    const iterator = remoteEvents(transport, "t", { onSubscribed: () => (confirmed = true) })[Symbol.asyncIterator]();
    // The first read waits for an event. Then the reader takes nothing: the stream holds the events.
    const first = iterator.next();
    await waitFor(() => confirmed, "the confirmation");
    await sleep(20);
    for (let n = 1; n <= 10; n++) publisher.publish("t", n);
    // The first read waited, so event 1 went to it at once. The queue then held 3 of 9 events.
    expect((await first).value).toMatchObject({ data: 1, seq: 1, dropped: 0 });
    const rest = [await iterator.next(), await iterator.next(), await iterator.next()].map((result) => result.value as RemoteEvent);
    expect(rest.map((event) => [event.data, event.seq, event.dropped])).toEqual([
      [8, 8, 6],
      [9, 9, 0],
      [10, 10, 0],
    ]);
    await iterator.return?.();
    await waitFor(() => publisher.subscriptions === 0 && bus.subscriberCount("t") === 0, "the listeners go");
  });

  it("ends each subscription with UNAVAILABLE when the server stops, and the stop does not wait", async () => {
    const bus = createEventBus();
    const server = new ProcedureServer({ registry: createRegistry(), events: { bus, topics: ["*"] } });
    const response = await server.handle({ id: "1", method: { service: "events", operation: "subscribe" }, payload: { topics: ["t"] }, metadata: {} });
    expect(response.metadata).toEqual({ stream: "unbounded" });
    const iterator = response.stream![Symbol.asyncIterator]();
    expect((await iterator.next()).value).toEqual({ type: "subscribed", topics: ["t"] });
    server.publish("t", "one");
    expect((await iterator.next()).value).toEqual({ type: "event", topic: "t", data: "one", seq: 1 });
    const waiting = iterator.next();
    const started = Date.now();
    await server.stop({ grace: seconds(5) });
    expect(Date.now() - started).toBeLessThan(1000);
    await expect(waiting).rejects.toMatchObject({ code: "UNAVAILABLE", retryable: true });
    expect(bus.subscriberCount("t")).toBe(0);
    expect(server.publisher!.subscriptions).toBe(0);
    expect(server.callsInFlight).toBe(0);
  });

  it("gives its bus to the procedures of the server as ctx.bus", async () => {
    const bus = createEventBus();
    const server = new ProcedureServer({ registry: createRegistry(), events: { bus, topics: ["*"] } });
    expect(server.publisher!.bus).toBe(bus);
    const seen: unknown[] = [];
    bus.on("direct", (data) => void seen.push(data));
    server.publish("direct", 1);
    expect(seen).toEqual([1]);
  });
});
