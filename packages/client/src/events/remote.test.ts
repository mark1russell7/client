/**
 * The remote events on each face (`documentation/EVENTS.md`), as the conformance suite of R18
 * does for the calls: `LocalTransport`, HTTP with NDJSON and WebSocket. A subscriber subscribes,
 * receives, and unsubscribes. The unknown and the refused topic give the same codes on each face.
 * Two subscribers of one topic share one call, and `clear()` ends a subscription with notice.
 * The resubscribe rules (`maxAttempts`, the backoff of durations) run on a fake clock.
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { fakeClock } from "@mark1russell7/service/testing";
import type { Message, ResponseItem, Transport } from "../client/types.js";
import { HttpTransport } from "../adapters/http/client/index.js";
import { HttpServerTransport } from "../adapters/http/server/index.js";
import { LocalTransport } from "../adapters/local/client/transport.js";
import { WebSocketTransport } from "../adapters/websocket/client/transport.js";
import { WebSocketServerTransport } from "../adapters/websocket/server/transport.js";
import { createRegistry } from "../procedures/module.js";
import type { Capability } from "../procedures/types.js";
import { ProcedureServer } from "../server/procedure-server.js";
import { ms, seconds } from "../duration.js";
import { createEventBus } from "./bus.js";
import { EventPublisher, topicMatcher, type EventPublisherOptions } from "./publisher.js";
import { remoteEvents, subscribeRemote, SubscriptionError, type EventTransport, type RemoteEvent, type SubscribeOptions } from "./remote.js";
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

  it("two subscribers of one topic share one call, and the last unsubscribe ends it", async () => {
    const bus = createEventBus();
    const publisher = new EventPublisher(publisherOptions(bus));
    const transport = await face.transport(publisher);
    const first: RemoteEvent[] = [];
    const second: RemoteEvent[] = [];
    const a = subscribeRemote(transport, "orders.created", (_data, event) => void first.push(event));
    const b = subscribeRemote(transport, "orders.created", (_data, event) => void second.push(event));
    await Promise.all([a.ready, b.ready]);
    expect(a.id).not.toBe(b.id);
    expect(publisher.subscriptions).toBe(1);
    expect(bus.subscriberCount("orders.created")).toBe(1);

    publisher.publish("orders.created", 1);
    await waitFor(() => first.length === 1 && second.length === 1, "the event for each subscriber");
    expect(first.map((event) => [event.data, event.seq, event.subscription])).toEqual([[1, 1, a.id]]);
    expect(second.map((event) => [event.data, event.seq, event.subscription])).toEqual([[1, 1, b.id]]);

    // The first unsubscribe keeps the call: the other subscriber still gets the events
    a();
    publisher.publish("orders.created", 2);
    await waitFor(() => second.length === 2, "the event after the first unsubscribe");
    expect(first).toHaveLength(1);
    expect(publisher.subscriptions).toBe(1);

    // The last unsubscribe ends the call
    b();
    await waitFor(() => publisher.subscriptions === 0 && bus.subscriberCount("orders.created") === 0, "the end of the shared call");
  });

  it("a late subscriber gets no replay: its ready resolves, and its seq starts at 1", async () => {
    const bus = createEventBus();
    const publisher = new EventPublisher(publisherOptions(bus));
    const transport = await face.transport(publisher);
    const early: RemoteEvent[] = [];
    const late: RemoteEvent[] = [];
    const confirmations: string[][] = [];
    const first = subscribeRemote(transport, "orders.created", (_data, event) => void early.push(event));
    await first.ready;
    publisher.publish("orders.created", 1);
    publisher.publish("orders.created", 2);
    await waitFor(() => early.length === 2, "the early events");

    const second = subscribeRemote(transport, "orders.created", (_data, event) => void late.push(event), {
      onSubscribed: (topics) => confirmations.push([...topics]),
    });
    await second.ready;
    expect(confirmations).toEqual([["orders.created"]]);
    expect(publisher.subscriptions).toBe(1);
    publisher.publish("orders.created", 3);
    await waitFor(() => early.length === 3 && late.length === 1, "the event after the join");
    expect(early.map((event) => [event.data, event.seq])).toEqual([[1, 1], [2, 2], [3, 3]]);
    expect(late.map((event) => [event.data, event.seq, event.dropped])).toEqual([[3, 1, 0]]);
    first();
    second();
  });

  it("clear() ends the subscriptions of the topic with TOPIC_CLEARED, and the subscriber does not resubscribe", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const bus = createEventBus();
    const publisher = new EventPublisher(publisherOptions(bus));
    const transport = await face.transport(publisher);
    const errors: SubscriptionError[] = [];
    const confirmations: number[] = [];
    const seen: unknown[] = [];
    const subscription = subscribeRemote(transport, ["orders.created", "orders.paid"], (data) => void seen.push(data), {
      onError: (error) => errors.push(error),
      onSubscribed: () => confirmations.push(1),
    });
    let iteratorError: unknown;
    let iteratorConfirmed = false;
    const reader = (async () => {
      try {
        for await (const _event of remoteEvents(transport, "orders.created", { onSubscribed: () => (iteratorConfirmed = true) })) {
          // the events go to the handler test above
        }
      } catch (error) {
        iteratorError = error;
      }
    })();
    await subscription.ready;
    await waitFor(() => iteratorConfirmed, "the confirmation of the iterator");
    expect(publisher.subscriptions).toBe(2);
    publisher.publish("orders.created", 1);
    await waitFor(() => seen.length === 1, "the event before the clear");

    bus.clear("orders.created");
    await reader;
    await waitFor(() => errors.length === 1, "the end of the handler subscription");
    expect(errors[0]).toBeInstanceOf(SubscriptionError);
    expect(errors[0]).toMatchObject({ code: "TOPIC_CLEARED", retryable: false });
    expect(errors[0]!.message).toContain("orders.created");
    expect(iteratorError).toMatchObject({ code: "TOPIC_CLEARED", retryable: false });
    // The wire subscriptions end: the publisher removes the listener of the other topic too
    expect(publisher.subscriptions).toBe(0);
    expect(bus.subscriberCount("orders.paid")).toBe(0);
    await sleep(30);
    expect(confirmations).toEqual([1]);
    expect(publisher.subscriptions).toBe(0);
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

/** A transport that counts the calls and the cancels (the aborts of the signal of a call) of another one. */
function counting(inner: Transport): { transport: Transport; counts: { calls: number; cancels: number } } {
  const counts = { calls: 0, cancels: 0 };
  const transport: Transport = {
    name: "counting",
    send: (message) => {
      counts.calls++;
      message.signal?.addEventListener("abort", () => counts.cancels++, { once: true });
      return inner.send(message);
    },
    close: () => inner.close(),
  };
  return { transport, counts };
}

describe("the shared subscriptions (EVENTS.md)", () => {
  it("the wire sees one call and one cancel for two subscribers of one topic", async () => {
    const bus = createEventBus();
    const publisher = new EventPublisher({ bus, topics: ["*"] });
    const { transport, counts } = counting(new LocalTransport({ events: publisher }));
    const a = subscribeRemote(transport, "t", () => undefined);
    let iterated = 0;
    const reader = (async () => {
      for await (const _event of remoteEvents(transport, "t")) if (++iterated === 1) break;
    })();
    await a.ready;
    await waitFor(() => bus.subscriberCount("t") === 1, "the listener");
    publisher.publish("t", 1);
    await reader;
    expect(counts).toEqual({ calls: 1, cancels: 0 });
    a();
    await waitFor(() => counts.cancels === 1 && publisher.subscriptions === 0, "the one cancel");
    expect(counts).toEqual({ calls: 1, cancels: 1 });
    expect(bus.channels()).toEqual([]);
  });

  it("other topics, other metadata or other resubscribe rules make other calls; the order of the topics does not", async () => {
    const bus = createEventBus();
    const publisher = new EventPublisher({ bus, topics: ["*"] });
    const { transport, counts } = counting(new LocalTransport({ events: publisher }));
    const subscriptions = [
      subscribeRemote(transport, ["a", "b"], () => undefined),
      subscribeRemote(transport, ["b", "a", "b"], () => undefined),
      subscribeRemote(transport, "a", () => undefined),
      subscribeRemote(transport, ["a", "b"], () => undefined, { metadata: { trace: "x" } }),
      subscribeRemote(transport, ["a", "b"], () => undefined, { maxAttempts: 3 }),
      subscribeRemote(transport, ["a", "b"], () => undefined, { resubscribe: false }),
    ];
    await Promise.all(subscriptions.map((subscription) => subscription.ready));
    expect(counts.calls).toBe(5);
    expect(publisher.subscriptions).toBe(5);
    for (const subscription of subscriptions) subscription();
    await waitFor(() => publisher.subscriptions === 0, "the ends");
  });

  it("an error of the shared call goes to each subscriber", async () => {
    const publisher = new EventPublisher({ bus: createEventBus(), topics: ["known"] });
    const { transport, counts } = counting(new LocalTransport({ events: publisher }));
    const errors: string[] = [];
    const a = subscribeRemote(transport, "unknown", () => undefined, { onError: (error) => errors.push(`a:${error.code}`) });
    const b = subscribeRemote(transport, "unknown", () => undefined, { onError: (error) => errors.push(`b:${error.code}`) });
    let iteratorError: unknown;
    const reader = (async () => {
      try {
        for await (const _event of remoteEvents(transport, "unknown")) break;
      } catch (error) {
        iteratorError = error;
      }
    })();
    await expect(a.ready).rejects.toMatchObject({ code: "TOPIC_NOT_FOUND" });
    await expect(b.ready).rejects.toMatchObject({ code: "TOPIC_NOT_FOUND" });
    await reader;
    expect(iteratorError).toMatchObject({ code: "TOPIC_NOT_FOUND" });
    expect(errors.sort()).toEqual(["a:TOPIC_NOT_FOUND", "b:TOPIC_NOT_FOUND"]);
    expect(counts.calls).toBe(1);

    // After the end, a new subscriber makes a new call
    const c = subscribeRemote(transport, "unknown", () => undefined);
    await expect(c.ready).rejects.toMatchObject({ code: "TOPIC_NOT_FOUND" });
    expect(counts.calls).toBe(2);
  });

  it("a slow subscriber has its own queue: it drops its oldest events, and the fast one loses nothing", async () => {
    const bus = createEventBus();
    // The queue of the publisher holds each event, so each loss is at the slow subscriber
    const publisher = new EventPublisher({ bus, topics: ["*"], buffer: 5000 });
    const transport = new LocalTransport({ events: publisher });
    const fast: RemoteEvent[] = [];
    const slow: RemoteEvent[] = [];
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => (release = resolve));
    const a = subscribeRemote(transport, "t", (_data, event) => void fast.push(event));
    const b = subscribeRemote(transport, "t", async (_data, event) => {
      slow.push(event);
      await held;
    });
    await Promise.all([a.ready, b.ready]);
    const total = 1100;
    for (let n = 1; n <= total; n++) publisher.publish("t", n);
    await waitFor(() => fast.length === total, "each event for the fast subscriber");
    expect(fast.every((event, index) => event.seq === index + 1 && event.dropped === 0)).toBe(true);

    release();
    await waitFor(() => slow.at(-1)?.seq === total, "the last event for the slow subscriber");
    // The first event went to the handler at once, the queue held 1024 events, and the oldest went
    expect(slow.length).toBe(1 + 1024);
    expect(slow.slice(0, 2).map((event) => [event.data, event.seq, event.dropped])).toEqual([
      [1, 1, 0],
      [77, 77, 75],
    ]);
    let previous = 0;
    for (const event of slow) {
      expect(event.data).toBe(event.seq);
      expect(event.dropped).toBe(event.seq - previous - 1);
      previous = event.seq;
    }
    a();
    b();
    await waitFor(() => publisher.subscriptions === 0, "the end");
  });

  it("the events before clear() arrive first, then TOPIC_CLEARED; clearAll() ends each subscription", async () => {
    const bus = createEventBus();
    const publisher = new EventPublisher({ bus, topics: ["*"] });
    const transport = new LocalTransport({ events: publisher });
    let confirmed = false;
    const iterator = remoteEvents(transport, "t", { onSubscribed: () => (confirmed = true) })[Symbol.asyncIterator]();
    const first = iterator.next();
    await waitFor(() => confirmed, "the confirmation");
    // The first read takes event 1. Events 2 and 3 wait in the queue of the publisher.
    publisher.publish("t", 1);
    publisher.publish("t", 2);
    publisher.publish("t", 3);
    bus.clear("t");
    expect(publisher.subscriptions).toBe(0);
    expect((await first).value).toMatchObject({ data: 1 });
    expect((await iterator.next()).value).toMatchObject({ data: 2 });
    expect((await iterator.next()).value).toMatchObject({ data: 3 });
    await expect(iterator.next()).rejects.toMatchObject({ code: "TOPIC_CLEARED" });
    expect(await iterator.next()).toEqual({ value: undefined, done: true });

    const errors: string[] = [];
    const subscriptions = ["x", "y"].map((topic) => subscribeRemote(transport, topic, () => undefined, { onError: (error) => errors.push(`${topic}:${error.code}`) }));
    await Promise.all(subscriptions.map((subscription) => subscription.ready));
    bus.clearAll();
    await waitFor(() => errors.length === 2, "the end of each subscription");
    expect(errors.sort()).toEqual(["x:TOPIC_CLEARED", "y:TOPIC_CLEARED"]);
    expect(publisher.subscriptions).toBe(0);
  });
});

/** A transport whose call number `n` (from 1) gives the items of `script(n)`. */
function scripted(script: (call: number) => Array<ResponseItem<unknown>>): { transport: EventTransport; calls: () => number } {
  let calls = 0;
  const send = (message: Message<unknown>): AsyncIterable<ResponseItem<unknown>> =>
    (async function* () {
      const items = script(++calls);
      for (const item of items) yield { ...item, id: message.id };
    })();
  return { transport: { send: send as EventTransport["send"] }, calls: () => calls };
}

const unavailable = (): ResponseItem<unknown> => ({
  id: "",
  status: { type: "error", code: "UNAVAILABLE", message: "The publisher stops", retryable: true },
  payload: null,
  metadata: {},
});
const confirmation = (): ResponseItem<unknown> => ({ id: "", status: { type: "success", code: 200 }, payload: { type: "subscribed", topics: ["t"] }, metadata: {} });

/** This function lets the promises of the subscriber run, without a timer of the clock. */
async function settle(): Promise<void> {
  for (let n = 0; n < 10; n++) await new Promise((resolve) => setImmediate(resolve));
}

describe("the resubscribe rules: maxAttempts and the backoff of durations (EVENTS.md)", () => {
  it("tries maxAttempts times after the backoff of each try, then ends with the error of the last failure", async () => {
    const clock = fakeClock();
    const { transport, calls } = scripted(() => [unavailable()]);
    const errors: SubscriptionError[] = [];
    const subscription = subscribeRemote(transport, "t", () => undefined, {
      clock,
      maxAttempts: 3,
      backoff: { initialDelay: ms(100), maxDelay: seconds(1), jitter: 0 },
      onError: (error) => errors.push(error),
    });
    await settle();
    expect(calls()).toBe(1);
    // The delays are 100 ms, 200 ms and 400 ms: no try comes before its time
    for (const [delay, call] of [[100, 2], [200, 3], [400, 4]] as const) {
      await clock.advance(delay - 1);
      await settle();
      expect(calls()).toBe(call - 1);
      await clock.advance(1);
      await settle();
      expect(calls()).toBe(call);
    }
    await expect(subscription.ready).rejects.toMatchObject({ code: "UNAVAILABLE", retryable: true });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(SubscriptionError);
    expect(errors[0]!.message).toContain("after 3 resubscribe tries");
    expect(clock.pending).toBe(0);
    await clock.advance(60_000);
    await settle();
    expect(calls()).toBe(4);
  });

  it("stops after 10 tries by default, as over HTTP, which has no reconnect", async () => {
    const clock = fakeClock();
    const { transport, calls } = scripted(() => [unavailable()]);
    const errors: SubscriptionError[] = [];
    subscribeRemote(transport, "t", () => undefined, { clock, onError: (error) => errors.push(error) });
    for (let n = 0; n < 12 && errors.length === 0; n++) {
      await settle();
      // The default backoff is at most 30 s
      await clock.advance(30_000);
    }
    await settle();
    expect(calls()).toBe(11);
    expect(errors.map((error) => error.code)).toEqual(["UNAVAILABLE"]);
    expect(errors[0]!.message).toContain("after 10 resubscribe tries");
  });

  it("starts the count again at each confirmation", async () => {
    const clock = fakeClock();
    // The calls 1 to 5 confirm and then fail. The later calls fail at once.
    const { transport, calls } = scripted((call) => (call <= 5 ? [confirmation(), unavailable()] : [unavailable()]));
    const errors: SubscriptionError[] = [];
    let confirmations = 0;
    const subscription = subscribeRemote(transport, "t", () => undefined, {
      clock,
      maxAttempts: 1,
      backoff: { initialDelay: ms(10), jitter: 0 },
      onSubscribed: () => confirmations++,
      onError: (error) => errors.push(error),
    });
    await subscription.ready;
    for (let n = 0; n < 10 && errors.length === 0; n++) {
      await settle();
      await clock.advance(10);
    }
    await settle();
    // Each confirmation gave one more try: 5 calls with a confirmation, one more, then the end
    expect(confirmations).toBe(5);
    expect(calls()).toBe(6);
    expect(errors.map((error) => error.code)).toEqual(["UNAVAILABLE"]);
  });

  it("ends an iterator with the error; maxAttempts 0 gives the first failure as it is", async () => {
    const clock = fakeClock();
    const { transport, calls } = scripted(() => [unavailable()]);
    const iteration = (async () => {
      for await (const _event of remoteEvents(transport, "t", { clock, maxAttempts: 0 })) break;
    })();
    await expect(iteration).rejects.toMatchObject({ code: "UNAVAILABLE", message: "The publisher stops" });
    expect(calls()).toBe(1);
    expect(clock.pending).toBe(0);
  });

  it("takes maxAttempts, the backoff and the clock of the hooks of the transport when the options give none", async () => {
    const clock = fakeClock();
    const { transport, calls } = scripted(() => [unavailable()]);
    const delays: number[] = [];
    const errors: SubscriptionError[] = [];
    subscribeRemote(transport, "t", () => undefined, { onError: (error) => errors.push(error) }, {
      maxAttempts: 2,
      clock,
      backoff: (attempt) => {
        delays.push(attempt);
        return 50;
      },
    });
    for (let n = 0; n < 4 && errors.length === 0; n++) {
      await settle();
      await clock.advance(50);
    }
    await settle();
    expect(calls()).toBe(3);
    expect(delays).toEqual([1, 2]);
    expect(errors).toHaveLength(1);
  });

  it("the backoff grows by backoffMultiplier up to maxDelay", async () => {
    const clock = fakeClock();
    const { transport, calls } = scripted(() => [unavailable()]);
    const subscription = subscribeRemote(transport, "t", () => undefined, {
      clock,
      maxAttempts: 4,
      backoff: { initialDelay: seconds(1), backoffMultiplier: 3, maxDelay: seconds(5), jitter: 0 },
    });
    await settle();
    let elapsed = 0;
    const times: number[] = [];
    while (calls() < 5 && elapsed < 60_000) {
      const before = calls();
      await clock.advance(100);
      elapsed += 100;
      await settle();
      if (calls() > before) times.push(elapsed);
    }
    // The tries come 1 s, 3 s, 5 s and 5 s after the failure before them
    expect(times).toEqual([1000, 4000, 9000, 14000]);
    await expect(subscription.ready).rejects.toMatchObject({ code: "UNAVAILABLE" });
  });

  it("a plain number, a function or a quantity of another kind throws a TypeError, and sends no call", () => {
    const { transport, calls } = scripted(() => [unavailable()]);
    const bad: Array<Partial<SubscribeOptions>> = [
      { backoff: 250 as never },
      { backoff: ((attempt: number) => attempt * 100) as never },
      { backoff: { initialDelay: 250 as never } },
      { backoff: { maxDelay: 30_000 as never } },
      { backoff: { initialDelay: { value: 1, unit: "kg" } as never } },
      { maxAttempts: -1 },
      { maxAttempts: Number.NaN },
      { maxAttempts: "3" as never },
    ];
    for (const options of bad) {
      expect(() => subscribeRemote(transport, "t", () => undefined, options), JSON.stringify(options)).toThrow(TypeError);
      expect(() => remoteEvents(transport, "t", options), JSON.stringify(options)).toThrow(TypeError);
    }
    expect(() => subscribeRemote(transport, "t", () => undefined, { backoff: { initialDelay: 250 as never } })).toThrow(/backoff\.initialDelay must be a duration/);
    expect(() => subscribeRemote(transport, "t", () => undefined, { backoff: 250 as never })).toThrow(/no longer a function of milliseconds/);
    expect(calls()).toBe(0);
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
