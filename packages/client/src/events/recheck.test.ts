/**
 * The re-check of the admission of an open subscription (roadmap CLI-44). A right can change after
 * the start of a subscription. The publisher examines the subscription again at a change of the
 * rights and after the max age on its clock, with the same checks as at the start. A refusal ends
 * the subscription with FORBIDDEN. The tests use a fake clock and wait for no real time.
 */

import { describe, it, expect } from "vitest";
import { fakeClock } from "@mark1russell7/service/testing";
import { invokeProcedure } from "../procedures/invoke.js";
import { createRegistry } from "../procedures/module.js";
import type { RepositoryProvider } from "../procedures/types.js";
import type { Principal } from "../server/types.js";
import { ProcedureServer } from "../server/procedure-server.js";
import { minutes, ms, seconds } from "../duration.js";
import { createEventBus } from "./bus.js";
import { EventPublisher, type TopicCall } from "./publisher.js";
import type { RightsChange } from "./recheck.js";
import type { EventItem } from "./remote.js";
import type { EventBus } from "./types.js";

const ann: Principal = { id: "ann", via: "test" };
const bob: Principal = { id: "bob", via: "test" };

type EventFrame = Extract<EventItem, { type: "event" }>;

/** The rights of the app: the principals that can read the topics, and the count of the checks. */
function rightsOf(...ids: string[]) {
  const readers = new Set(ids);
  let checks = 0;
  const allow = (_topic: string, call: TopicCall): boolean => {
    checks++;
    return call.principal !== undefined && readers.has(call.principal.id);
  };
  return { readers, allow, checks: () => checks };
}

/** A subscription of a principal to the topics, as a host runs it, after its confirmation. */
async function subscribe(publisher: EventPublisher, bus: EventBus, topics: string[], principal: Principal | undefined, repository?: RepositoryProvider) {
  const controller = new AbortController();
  const output = await invokeProcedure(publisher.procedure, { topics }, {
    bus,
    signal: controller.signal,
    ...(principal ? { principal } : {}),
    ...(repository ? { repository } : {}),
  });
  if (output.kind !== "stream") throw new Error("events.subscribe gives a stream");
  const items = output.items as AsyncGenerator<EventItem, void, undefined>;
  expect((await items.next()).value).toMatchObject({ type: "subscribed" });
  return {
    next: async (): Promise<EventFrame> => (await items.next()).value as EventFrame,
    stop: () => controller.abort(),
  };
}

describe("the re-check of the admission of an open subscription (CLI-44)", () => {
  it("ends a subscription at the latest after maxAge when the app revokes a right and gives no signal", async () => {
    const clock = fakeClock();
    const bus = createEventBus();
    const rights = rightsOf("ann");
    const publisher = new EventPublisher({ bus, topics: ["orders.*"], allow: rights.allow, clock, recheck: { maxAge: seconds(60) } });
    const sub = await subscribe(publisher, bus, ["orders.created"], ann);
    expect(clock.pending).toBe(1);

    // The app revokes the right, and it gives no signal. Before the max age, the subscription stays.
    rights.readers.delete("ann");
    await clock.advance(59_999);
    publisher.publish("orders.created", 1);
    expect(await sub.next()).toMatchObject({ type: "event", data: 1, seq: 1 });
    expect(rights.checks()).toBe(1);

    // At the max age, the same check refuses the subscription
    const ended = expect(sub.next()).rejects.toMatchObject({ code: "FORBIDDEN", reason: "topic-not-allowed" });
    await clock.advance(1);
    await ended;
    expect(rights.checks()).toBe(2);
    expect(publisher.subscriptions).toBe(0);
    expect(bus.subscriberCount("orders.created")).toBe(0);
    expect(clock.pending).toBe(0);
  });

  it("ends a subscription at the signal of a rights change, and the events after the signal never reach it", async () => {
    const bus = createEventBus();
    const rights = rightsOf("ann", "bob");
    const publisher = new EventPublisher({ bus, topics: ["orders.*"], allow: rights.allow });
    const annSub = await subscribe(publisher, bus, ["orders.created"], ann);
    const bobSub = await subscribe(publisher, bus, ["orders.created"], bob);
    rights.readers.delete("ann");

    // A signal for Bob examines the subscription of Bob only: Ann keeps hers until her own signal
    await publisher.rightsChanged("bob");
    expect(rights.checks()).toBe(3);
    publisher.publish("orders.created", 1);
    expect(await annSub.next()).toMatchObject({ data: 1, seq: 1 });
    expect(await bobSub.next()).toMatchObject({ data: 1, seq: 1 });

    // The signal for Ann holds her events until the check refuses her subscription
    const ended = expect(annSub.next()).rejects.toMatchObject({ code: "FORBIDDEN", reason: "topic-not-allowed" });
    const signal = publisher.rightsChanged("ann");
    publisher.publish("orders.created", 2);
    await signal;
    await ended;
    expect(rights.checks()).toBe(4);
    expect(await bobSub.next()).toMatchObject({ data: 2, seq: 2 });
    expect(publisher.subscriptions).toBe(1);
    expect(bus.subscriberCount("orders.created")).toBe(1);
    bobSub.stop();
    expect(publisher.subscriptions).toBe(0);
  });

  it("listens to the source of the rights changes of the app only while a subscription is open", async () => {
    const bus = createEventBus();
    const rights = rightsOf("ann", "bob");
    const listeners = new Set<(change?: RightsChange) => void>();
    const rightsChanges = (listener: (change?: RightsChange) => void): (() => void) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    };
    const publisher = new EventPublisher({ bus, topics: ["orders.*"], allow: rights.allow, recheck: { rightsChanges } });
    expect(listeners.size).toBe(0);
    const annSub = await subscribe(publisher, bus, ["orders.created"], ann);
    const bobSub = await subscribe(publisher, bus, ["orders.created"], bob);
    // The publisher has one listener, not one for each subscription
    expect(listeners.size).toBe(1);

    // A change with a test of the principal touches the subscription of Ann only
    rights.readers.delete("ann");
    const ended = expect(annSub.next()).rejects.toMatchObject({ code: "FORBIDDEN", reason: "topic-not-allowed" });
    for (const listener of [...listeners]) listener((principal) => principal?.id === "ann");
    await ended;
    expect(rights.checks()).toBe(3);
    expect(publisher.subscriptions).toBe(1);
    expect(listeners.size).toBe(1);

    // The end of the last subscription removes the listener
    bobSub.stop();
    expect(publisher.subscriptions).toBe(0);
    expect(listeners.size).toBe(0);
  });

  it("keeps a subscription whose right is still valid, at each max age and at each signal", async () => {
    const clock = fakeClock();
    const bus = createEventBus();
    const rights = rightsOf("ann");
    const publisher = new EventPublisher({ bus, topics: ["orders.*"], allow: rights.allow, clock, recheck: { maxAge: minutes(1) } });
    const sub = await subscribe(publisher, bus, ["orders.created"], ann);
    for (let n = 1; n <= 3; n++) {
      await clock.advance(60_000);
      await publisher.rightsChanged();
      publisher.publish("orders.created", n);
      expect(await sub.next()).toMatchObject({ type: "event", data: n, seq: n });
    }
    // One check at the start, then one check at each max age and one at each signal
    expect(rights.checks()).toBe(7);
    expect(publisher.subscriptions).toBe(1);
    expect(clock.pending).toBe(1);
    sub.stop();
    expect(publisher.subscriptions).toBe(0);
    expect(clock.pending).toBe(0);
  });

  it("without the option recheck and without a signal, a subscription keeps the admission of its start", async () => {
    const clock = fakeClock();
    const bus = createEventBus();
    const rights = rightsOf("ann");
    const publisher = new EventPublisher({ bus, topics: ["orders.*"], allow: rights.allow, clock });
    const sub = await subscribe(publisher, bus, ["orders.created"], ann);
    rights.readers.delete("ann");
    expect(clock.pending).toBe(0);
    await clock.advance(3_600_000);
    publisher.publish("orders.created", 1);
    expect(await sub.next()).toMatchObject({ type: "event", data: 1, seq: 1 });
    expect(rights.checks()).toBe(1);
    sub.stop();
  });

  it("ends a subscriber of a partitioned collection when the resolver refuses it or gives another partition", async () => {
    const bus = createEventBus();
    const tenants = new Map<string, string>([
      ["ann", "t1"],
      ["bob", "t2"],
    ]);
    const repository: RepositoryProvider = {
      getStorage: () => {
        throw new Error("the subscriptions read no storage");
      },
      hasCollection: (name) => name === "notes",
      hasPartitions: (name) => name === "notes",
      resolvePartition: (_name, ctx) => tenants.get(ctx.principal?.id ?? "") ?? null,
    };
    const publisher = new EventPublisher({ bus, topics: ["collections.*"] });
    const annSub = await subscribe(publisher, bus, ["collections.notes"], ann, repository);
    const bobSub = await subscribe(publisher, bus, ["collections.notes"], bob, repository);
    expect(bus.subscriberCount("collections.notes.t1")).toBe(1);
    expect(bus.subscriberCount("collections.notes.t2")).toBe(1);

    // Ann moves to another tenant, and Bob has no tenant now
    tenants.set("ann", "t3");
    tenants.delete("bob");
    const annEnded = expect(annSub.next()).rejects.toMatchObject({ code: "FORBIDDEN", reason: "partition-not-allowed" });
    const bobEnded = expect(bobSub.next()).rejects.toMatchObject({ code: "FORBIDDEN", reason: "partition-not-allowed" });
    await publisher.rightsChanged();
    await annEnded;
    await bobEnded;
    expect(publisher.subscriptions).toBe(0);
    expect(bus.subscriberCount("collections.notes.t1")).toBe(0);
    expect(bus.subscriberCount("collections.notes.t2")).toBe(0);
  });

  it("a ProcedureServer gives its clock to the publisher that it makes from its option events", async () => {
    const clock = fakeClock();
    const bus = createEventBus();
    let allowed = true;
    const server = new ProcedureServer({
      registry: createRegistry(),
      clock,
      events: { bus, topics: ["*"], allow: () => allowed, recheck: { maxAge: seconds(30) } },
    });
    const response = await server.handle({ id: "1", method: { service: "events", operation: "subscribe" }, payload: { topics: ["t"] }, metadata: {} });
    const iterator = response.stream![Symbol.asyncIterator]();
    expect((await iterator.next()).value).toEqual({ type: "subscribed", topics: ["t"] });
    expect(clock.pending).toBe(1);

    allowed = false;
    const ended = expect(iterator.next()).rejects.toMatchObject({ code: "FORBIDDEN", reason: "topic-not-allowed" });
    await clock.advance(30_000);
    await ended;
    expect(server.publisher!.subscriptions).toBe(0);
    expect(bus.subscriberCount("t")).toBe(0);
  });

  it("refuses a maxAge that is not a duration of more than 0 ms", () => {
    const bus = createEventBus();
    expect(() => new EventPublisher({ bus, topics: ["*"], recheck: { maxAge: 60_000 as never } })).toThrow(/recheck\.maxAge must be a duration/);
    expect(() => new EventPublisher({ bus, topics: ["*"], recheck: { maxAge: ms(0) } })).toThrow(TypeError);
  });
});
