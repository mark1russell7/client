/**
 * `Client.subscribe()` and `Client.events()` (roadmap CLI-15): a subscription to the topics of the
 * bus of a server through the middleware and the context of the client, so a token of the client
 * goes with the call of `events.subscribe`.
 */

import { describe, it, expect, vi } from "vitest";
import { Client } from "./client.js";
import type { ClientMiddleware } from "./types.js";
import { LocalTransport } from "../adapters/local/client/transport.js";
import { EventPublisher } from "../events/publisher.js";
import { createEventBus } from "../events/bus.js";
import type { SubscriptionError } from "../events/remote.js";
import { createOverallTimeoutMiddleware, createTimeoutMiddleware } from "./middleware/timeout.js";
import { ms } from "../duration.js";

/** A wait of real time: the timeout middleware uses the timers of the platform. */
const pause = (time: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, time));

/** A server whose publisher permits a topic only for a call with the token "t". */
function server() {
  const bus = createEventBus();
  const publisher = new EventPublisher({ bus, topics: ["orders.*"], allow: (_topic, call) => call.metadata["token"] === "t" });
  return { bus, publisher, transport: new LocalTransport({ events: publisher }) };
}

/** A middleware that puts a token in the metadata of each call. */
const withToken: ClientMiddleware = (next) => (context) => next({ message: { ...context.message, metadata: { ...context.message.metadata, token: "t" } } });

describe("Client.subscribe() and Client.events() (CLI-15)", () => {
  it("subscribes through the middleware of the client, and gets the events of the topic", async () => {
    const { publisher, transport } = server();
    const client = new Client(transport).use(withToken);
    const seen: unknown[] = [];
    const unsubscribe = client.subscribe<{ order: number }>("orders.created", (data, event) => void seen.push([data, event.seq]));
    await unsubscribe.ready;
    publisher.publish("orders.created", { order: 1 });
    publisher.publish("orders.created", { order: 2 });
    await vi.waitFor(() => expect(seen).toEqual([[{ order: 1 }, 1], [{ order: 2 }, 2]]));
    // Two subscribers of one client share one call
    const second = client.subscribe("orders.created", () => undefined);
    await second.ready;
    expect(publisher.subscriptions).toBe(1);
    unsubscribe();
    second();
    await vi.waitFor(() => expect(publisher.subscriptions).toBe(0));
  });

  it("gives the context of the client to the call, and a call without the token is refused", async () => {
    const { publisher, transport } = server();
    const refused = await new Promise<SubscriptionError>((resolve) => {
      new Client(transport).subscribe("orders.created", () => undefined, { onError: resolve });
    });
    expect(refused).toMatchObject({ code: "FORBIDDEN" });

    const withContext = new Client({ transport, defaultMetadata: { token: "t" } });
    const unsubscribe = withContext.subscribe("orders.created", () => undefined);
    await unsubscribe.ready;
    expect(publisher.subscriptions).toBe(1);
    unsubscribe();
  });

  it("events() gives the events as an async iterator, and a break ends the subscription", async () => {
    const { publisher, transport } = server();
    const client = new Client(transport).use(withToken);
    const topics: string[][] = [];
    const iterator = client.events<{ order: number }>(["orders.created"], { onSubscribed: (list) => void topics.push([...list]) })[Symbol.asyncIterator]();
    const first = iterator.next();
    await vi.waitFor(() => expect(topics).toEqual([["orders.created"]]));
    publisher.publish("orders.created", { order: 7 });
    expect((await first).value).toMatchObject({ topic: "orders.created", data: { order: 7 }, seq: 1 });
    await iterator.return?.();
    await vi.waitFor(() => expect(publisher.subscriptions).toBe(0));
  });

  it("a subscription outlives the timeouts of the client, and only the metadata of the subscription gives it a deadline", async () => {
    const { publisher, transport } = server();
    // The client-wide timeouts of unary calls: overall, per attempt, and in the context
    const client = new Client({ transport, defaultMetadata: { "procedure-timeout": 40 } })
      .use(withToken)
      .use(createOverallTimeoutMiddleware({ overall: ms(40) }))
      .use(createTimeoutMiddleware({ perAttempt: ms(40) }))
      .withContext({ timeout: { overall: ms(40) } });
    const confirmations: string[][] = [];
    const errors: SubscriptionError[] = [];
    const seen: unknown[] = [];
    const unsubscribe = client.subscribe("orders.created", (data) => void seen.push(data), {
      onSubscribed: (topics) => void confirmations.push([...topics]),
      onError: (error) => void errors.push(error),
    });
    await unsubscribe.ready;
    await pause(150);
    publisher.publish("orders.created", { order: 1 });
    await vi.waitFor(() => expect(seen).toEqual([{ order: 1 }]));
    // One confirmation: no timeout ended the call, and no resubscribe came
    expect(confirmations).toHaveLength(1);
    expect(errors).toEqual([]);
    unsubscribe();

    // A deadline that the subscription gives itself applies
    const timedOut = await new Promise<SubscriptionError>((resolve) => {
      client.subscribe("orders.created", () => undefined, { metadata: { timeout: { overall: ms(40) } }, resubscribe: false, onError: resolve });
    });
    expect(timedOut.code).toBe("TIMEOUT");
    await vi.waitFor(() => expect(publisher.subscriptions).toBe(0));
  });
});
