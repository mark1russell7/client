/**
 * `EventsChangeFeed` (roadmap CLI-15): the change events of the core collection procedures as the
 * push feed of a `HybridStorage`. The server runs the collection procedures over an
 * `InMemoryStorage`, with an `EventPublisher` on the bus of the procedures.
 *
 * - By default, an event has the ids and the versions only. The storage reads the values with
 *   `changes`, through the checks of a read, and it converges without `pullInterval`.
 * - A subscriber needs the read of `collection:<name>`. With the option `values`, each row passes
 *   the output filter of the host for each subscriber, and a refused row never reaches it.
 * - A delta that arrives during a pull applies after the pull, and it is not lost.
 */

import { describe, it, expect, vi } from "vitest";
import { InMemoryStorage } from "@procedures/collections";
import {
  Client,
  EventPublisher,
  LocalTransport,
  createCollectionProcedures,
  createEventBus,
  invokeProcedure,
  ms,
  outputItems,
  outputValue,
  type Capability,
  type CollectionProceduresOptions,
  type Handler,
  type RemoteEvent,
  type RepositoryProvider,
  type SubscribeOptions,
  type Subscription,
} from "@procedures/client";
import { ApiStorage } from "./api.js";
import { HybridStorage } from "./hybrid.js";
import { EventsChangeFeed, type EventSubscriber, type RemoteChangeHint, type RemoteChangeListener, type RemoteChanges } from "./feed.js";

type Item = { n: number; rev?: string; secret?: boolean };
const versionOf = (item: Item): string | undefined => item.rev;

/** A gate that holds the answers of `changes` of one client while it is closed. */
class Gate {
  closed = false;
  held = 0;
  private waiters: Array<() => void> = [];
  wait(): Promise<void> {
    this.held++;
    return new Promise((resolve) => this.waiters.push(resolve));
  }
  open(): void {
    this.closed = false;
    for (const resolve of this.waiters.splice(0)) resolve();
  }
}

/** The options of the server of a test. */
interface ServerOptions {
  /** The options of the collection procedures, for example `{ changeEvents: { values: true } }` */
  procedures?: CollectionProceduresOptions;
  /** The output filter of the host for `events.subscribe` */
  admitItem?: (item: unknown) => boolean;
  /** The capability of each call */
  capability?: Capability;
}

/** A server of the collection "items", with the change events on its bus. */
function serverOf(options: ServerOptions = {}) {
  const storage = new InMemoryStorage<Item>();
  const bus = createEventBus();
  const publisher = new EventPublisher({ bus, topics: ["collections.*"] });
  const repository = { getStorage: () => storage, hasCollection: () => true } as unknown as RepositoryProvider;
  const procedures = createCollectionProcedures("items", options.procedures);
  /** The transport of one client: it counts the calls of the client, and the gate holds its pulls. */
  const transportFor = (calls: string[], gate?: Gate): LocalTransport => {
    const handlers: Record<string, Handler> = {};
    for (const procedure of procedures) {
      const operation = procedure.path[2]!;
      handlers[procedure.path.join(".")] = async (payload) => {
        calls.push(operation);
        const output = outputValue(await invokeProcedure(procedure, payload, { repository, bus }), procedure.path);
        // The answer is the state at the call: the gate holds only its arrival
        if (operation === "changes" && gate?.closed) await gate.wait();
        return output;
      };
    }
    // events.subscribe with the output filter of the host, as a server with admitItem runs it
    if (options.admitItem) {
      const admitItem = options.admitItem;
      handlers["events.subscribe"] = async (payload, message) =>
        outputItems(await invokeProcedure(publisher.procedure, payload, { bus, admitItem, metadata: message.metadata, signal: message.signal }));
    }
    return new LocalTransport({ handlers, events: publisher, ...(options.capability && { capability: options.capability }) });
  };
  return { storage, bus, publisher, transportFor };
}

/** The calls of a client that read the remote. */
const reads = (calls: string[]): string[] => calls.filter((call) => ["changes", "entries", "get", "getAll", "ids", "getBatch", "find"].includes(call));

/** A client with a HybridStorage on the feed of the change events. */
async function subscribedClient(server: ReturnType<typeof serverOf>, origin: string, gate?: Gate) {
  const calls: string[] = [];
  const client = new Client(server.transportFor(calls, gate));
  const hybrid = new HybridStorage<Item>(new ApiStorage<Item>(client, { collection: "items", retry: false }), {
    feed: new EventsChangeFeed<Item>(client, { collection: "items" }),
    versionOf,
    origin,
    syncInterval: ms(0),
  });
  await hybrid.getAll();
  // The first pull, and the pull after the confirmation of the subscription
  await vi.waitFor(() => expect(calls.filter((call) => call === "changes")).toHaveLength(2));
  await vi.waitFor(() => expect(hybrid.getStatus().syncing).toBe(false));
  return { hybrid, calls, client };
}

/** A writer of the collection, without a feed. */
const writerOf = (server: ReturnType<typeof serverOf>): ApiStorage<Item> =>
  new ApiStorage<Item>(new Client(server.transportFor([])), { collection: "items", retry: false });

describe("EventsChangeFeed with the collection procedures (CLI-15)", () => {
  it("a remote write reaches a subscribed HybridStorage without pullInterval: the values come through changes", async () => {
    const server = serverOf();
    const a = await subscribedClient(server, "tab-a");
    expect(server.publisher.subscriptions).toBe(1);
    const before = a.calls.length;
    const writer = writerOf(server);
    await writer.set("x", { n: 1, rev: "x1" }, { origin: "writer" });
    await vi.waitFor(async () => expect(await a.hybrid.getEntries()).toEqual([["x", { n: 1, rev: "x1" }]]));
    await vi.waitFor(() => expect(a.hybrid.getStatus().syncing).toBe(false));
    // The values came through the checked read: one call of changes, and no other read
    expect(reads(a.calls.slice(before))).toEqual(["changes"]);
    // A delete needs no value: it applies without a read
    await writer.delete("x");
    await vi.waitFor(async () => expect(await a.hybrid.getEntries()).toEqual([]));
    expect(reads(a.calls.slice(before))).toEqual(["changes"]);
    await a.hybrid.close();
    await vi.waitFor(() => expect(server.publisher.subscriptions).toBe(0));
  });

  it("a delta that arrives during a pull applies after the pull, and it is not lost", async () => {
    for (const [procedures, pulls] of [[{}, 2], [{ changeEvents: { values: true } }, 1]] as const) {
      const server = serverOf({ procedures });
      const gate = new Gate();
      const a = await subscribedClient(server, "tab-a", gate);
      const before = a.calls.filter((call) => call === "changes").length;
      gate.closed = true;
      const pulling = a.hybrid.syncFromRemote();
      await vi.waitFor(() => expect(gate.held).toBe(1));
      await writerOf(server).set("live", { n: 1, rev: "l1" });
      gate.open();
      await pulling;
      await vi.waitFor(async () => expect(await a.hybrid.getEntries()).toEqual([["live", { n: 1, rev: "l1" }]]));
      await vi.waitFor(() => expect(a.hybrid.getStatus().syncing).toBe(false));
      // Without values, the hint asks for one more pull. With values, the delta follows the cursor of the pull.
      expect(a.calls.filter((call) => call === "changes")).toHaveLength(before + pulls);
      await a.hybrid.close();
    }
  });

  it("the writes of a HybridStorage reach another one, and the events have the origin of the writer and no values", async () => {
    const server = serverOf();
    const events: unknown[] = [];
    server.bus.on("collections.items", (event) => void events.push(event));
    const a = await subscribedClient(server, "tab-a");
    const b = await subscribedClient(server, "tab-b");
    // The upper case and the underscore of the values cannot occur in a sync version, which is base 36.
    await a.hybrid.set("x", { n: 1, rev: "VALUE_ONE" });
    await a.hybrid.set("x", { n: 2, rev: "VALUE_TWO" });
    await vi.waitFor(async () => expect(await b.hybrid.getEntries()).toEqual([["x", { n: 2, rev: "VALUE_TWO" }]]));
    await vi.waitFor(() => expect(a.hybrid.getStatus().syncing).toBe(false));
    expect(await a.hybrid.getEntries()).toEqual([["x", { n: 2, rev: "VALUE_TWO" }]]);
    expect(events).toContainEqual(expect.objectContaining({ origin: "tab-a", changed: ["x"] }));
    expect(JSON.stringify(events)).not.toContain("VALUE_");
    await a.hybrid.close();
    await b.hybrid.close();
  });

  it("a subscriber without the read of the collection is refused, and with it the feed starts", async () => {
    const refused = serverOf({ capability: { effects: { reads: ["events"], writes: [] } } });
    const errors: unknown[] = [];
    const listenerErrors: unknown[] = [];
    const feed = new EventsChangeFeed<Item>(new Client(refused.transportFor([])), { collection: "items", onError: (error) => void errors.push([error.code, error.reason]) });
    feed.subscribe({ onChanges: () => undefined, onGap: () => undefined, onError: (error) => void listenerErrors.push(error) });
    await vi.waitFor(() => expect(errors).toEqual([["FORBIDDEN", "effects-exceeded"]]));
    expect(listenerErrors).toHaveLength(1);
    expect(refused.publisher.subscriptions).toBe(0);

    const permitted = serverOf({ capability: { effects: { reads: ["events", "collection:items"], writes: [] } } });
    const gaps: string[] = [];
    const stop = new EventsChangeFeed<Item>(new Client(permitted.transportFor([])), { collection: "items" }).subscribe({
      onChanges: () => undefined,
      onGap: () => void gaps.push("gap"),
    });
    await vi.waitFor(() => expect(gaps).toEqual(["gap"]));
    expect(permitted.publisher.subscriptions).toBe(1);
    stop();
  });

  it("with values, a row that the output filter refuses never reaches the subscriber: its id is withheld, and the storage pulls", async () => {
    const secret = (item: unknown): boolean => (item as { value?: { secret?: boolean } } | null)?.value?.secret === true;
    const server = serverOf({ procedures: { changeEvents: { values: true } }, admitItem: (item) => !secret(item) });
    const seen: unknown[] = [];
    const watcher = new Client(server.transportFor([])).subscribe("collections.items", (data) => void seen.push(data));
    await watcher.ready;
    const a = await subscribedClient(server, "tab-a");
    const before = a.calls.filter((call) => call === "changes").length;
    const writer = writerOf(server);
    // An admitted row: the delta has its value, and it applies without a read
    await writer.set("open", { n: 1, rev: "o1" });
    await vi.waitFor(async () => expect(await a.hybrid.getEntries()).toEqual([["open", { n: 1, rev: "o1" }]]));
    expect(a.calls.filter((call) => call === "changes")).toHaveLength(before);
    // A refused row: no subscriber gets its value in an event
    await writer.set("s", { n: 2, rev: "s1", secret: true });
    await vi.waitFor(() => expect(seen).toHaveLength(2));
    expect(seen[1]).toMatchObject({ changed: ["s"], values: [], withheld: ["s"] });
    expect(JSON.stringify(seen)).not.toContain("secret");
    // The withheld id makes the storage read it through changes, the checked read of the host
    await vi.waitFor(() => expect(a.calls.filter((call) => call === "changes")).toHaveLength(before + 1));
    watcher();
    await a.hybrid.close();
  });
});

/** A source of events that the test drives. */
class FakeSource implements EventSubscriber {
  handler: ((data: unknown, event: RemoteEvent<unknown>) => void | Promise<void>) | undefined;
  options: SubscribeOptions | undefined;
  topics: string | readonly string[] | undefined;
  stops = 0;
  subscribe<E = unknown>(topics: string | readonly string[], handler: (data: E, event: RemoteEvent<E>) => void | Promise<void>, options?: SubscribeOptions): Subscription {
    this.topics = topics;
    this.handler = handler as unknown as (data: unknown, event: RemoteEvent<unknown>) => void;
    this.options = options;
    return Object.assign(() => void this.stops++, { ready: Promise.resolve(), id: "fake" });
  }
  event(data: unknown, seq: number, dropped = 0): void {
    void this.handler?.(data, { topic: "collections.items", data, seq, dropped, subscription: "fake" });
  }
}

/** A listener that records the calls. Without `hints`, it has no `onHint`. */
function recorder(hints = true): RemoteChangeListener<Item> & { log: Array<readonly unknown[]> } {
  const log: Array<readonly unknown[]> = [];
  return {
    log,
    onChanges: (changes: RemoteChanges<Item>) => void log.push(["changes", changes]),
    onGap: () => void log.push(["gap"]),
    onError: (error: unknown) => void log.push(["error", error]),
    ...(hints && { onHint: (hint: RemoteChangeHint) => void log.push(["hint", hint]) }),
  };
}

describe("EventsChangeFeed (CLI-15)", () => {
  it("gives a delta with values to onChanges, an event without values to onHint, and a gap or a lost event to onGap", () => {
    const source = new FakeSource();
    const listener = recorder();
    const feed = new EventsChangeFeed<Item>(source, { collection: "items", subscription: { maxAttempts: 3 } });
    expect(feed.topic).toBe("collections.items");
    feed.subscribe(listener);
    expect(source.topics).toBe("collections.items");
    expect(source.options?.maxAttempts).toBe(3);
    source.options?.onSubscribed?.(["collections.items"]);
    const delta = { since: "v0", version: "v1", changed: ["a"], deleted: ["b"], values: [{ id: "a", value: { n: 1 } }], origin: "tab-b" };
    source.event(delta, 1);
    // Event 2 is lost
    source.event({ ...delta, since: "v2", version: "v3" }, 3);
    source.event({ ...delta, since: "v3", version: "v4", origin: undefined }, 4, 2);
    // The default event: the ids and the versions only
    source.event({ since: "v4", version: "v5", changed: ["a"], deleted: [], origin: "tab-b" }, 5);
    // A withheld value, and a hint of a storage without a change log
    source.event({ since: "v5", version: "v6", changed: ["a", "c"], deleted: [], values: [{ id: "a", value: { n: 2 } }], withheld: ["c"] }, 6);
    source.event({ changed: [], deleted: [] }, 7);
    // Events of another form
    source.event({ since: "v6", version: "v7", changed: [{ id: "a" }], deleted: [] }, 8);
    source.event({ since: "v6", version: "v7", changed: [], deleted: [7] }, 9);
    source.event({ since: "v6", version: "v7", changed: ["a"], deleted: [], values: [{ value: 1 }] }, 10);
    source.event({ since: "v6", version: "v7", changed: ["a"], deleted: [], values: {} }, 11);
    source.event({ since: 6, changed: [], deleted: [] }, 12);
    source.event("text", 13);
    expect(listener.log).toEqual([
      ["gap"],
      ["changes", { since: "v0", version: "v1", full: false, changed: [["a", { n: 1 }]], deleted: ["b"], origin: "tab-b" }],
      ["gap"],
      ["changes", { since: "v2", version: "v3", full: false, changed: [["a", { n: 1 }]], deleted: ["b"], origin: "tab-b" }],
      ["gap"],
      ["changes", { since: "v3", version: "v4", full: false, changed: [["a", { n: 1 }]], deleted: ["b"] }],
      ["hint", { since: "v4", version: "v5", changed: ["a"], deleted: [], origin: "tab-b" }],
      ["hint", { since: "v5", version: "v6", changed: ["a", "c"], deleted: [] }],
      ["hint", { changed: [], deleted: [] }],
      ["gap"],
      ["gap"],
      ["gap"],
      ["gap"],
      ["gap"],
      ["gap"],
    ]);
  });

  it("gives a hint to onGap when the listener has no onHint", () => {
    const source = new FakeSource();
    const listener = recorder(false);
    new EventsChangeFeed<Item>(source, { collection: "items" }).subscribe(listener);
    source.event({ since: "v0", version: "v1", changed: ["a"], deleted: [] }, 1);
    expect(listener.log).toEqual([["gap"]]);
  });

  it("a resubscribe counts the events from 1 again, the error goes to both handlers, and the stop ends the calls", () => {
    const source = new FakeSource();
    const listener = recorder();
    const errors: unknown[] = [];
    const feed = new EventsChangeFeed<Item>(source, { topic: "collections.items.team-1", collection: "ignored", onError: (error) => void errors.push(error.code) });
    const stop = feed.subscribe(listener);
    expect(source.topics).toBe("collections.items.team-1");
    expect(source.options?.maxAttempts).toBe(Number.POSITIVE_INFINITY);
    const delta = { since: "v0", version: "v1", changed: [], deleted: [], values: [] };
    source.event(delta, 1);
    source.options?.onSubscribed?.(["collections.items.team-1"]);
    source.event({ ...delta, since: "v1", version: "v2" }, 1);
    const failure = Object.assign(new Error("gone"), { code: "TOPIC_CLEARED", retryable: false });
    source.options?.onError?.(failure as never);
    expect(errors).toEqual(["TOPIC_CLEARED"]);
    stop();
    stop();
    expect(source.stops).toBe(1);
    source.event(delta, 2);
    source.options?.onSubscribed?.([]);
    source.options?.onError?.(failure as never);
    expect(listener.log.map(([kind]) => kind)).toEqual(["changes", "gap", "changes", "error"]);
  });

  it("needs a collection or a topic", () => {
    expect(() => new EventsChangeFeed<Item>(new FakeSource(), {})).toThrow(TypeError);
    expect(() => new EventsChangeFeed<Item>(new FakeSource(), { topic: "" })).toThrow(TypeError);
  });
});

/** The `traceparent` of the W3C trace context that a server sends with a change event. */
const TRACE_1 = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";
const TRACE_2 = "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01";

describe("EventsChangeFeed: the other fields of an event (graph W8)", () => {
  it("gives the other fields, for example a traceparent, in extra of a delta and of a hint", () => {
    const source = new FakeSource();
    const listener = recorder();
    new EventsChangeFeed<Item>(source, { collection: "items" }).subscribe(listener);
    const values = [{ id: "a", value: { n: 1 } }];
    source.event({ since: "v0", version: "v1", changed: ["a"], deleted: [], values, origin: "tab-b", traceparent: TRACE_1, tracestate: "app=1" }, 1);
    // A field without a value stays out
    source.event({ since: "v1", version: "v2", changed: ["a"], deleted: [], traceparent: TRACE_2, empty: undefined }, 2);
    // A withheld value: the fields that the feed reads stay out of extra
    source.event({ since: "v2", version: "v3", changed: ["a", "c"], deleted: [], values, withheld: ["c"], traceparent: TRACE_2 }, 3);
    // An event without other fields gives no extra
    source.event({ since: "v3", version: "v4", changed: ["a"], deleted: [], values }, 4);
    source.event({ since: "v4", version: "v5", changed: ["a"], deleted: [] }, 5);
    expect(listener.log).toEqual([
      ["changes", { since: "v0", version: "v1", full: false, changed: [["a", { n: 1 }]], deleted: [], origin: "tab-b", extra: { traceparent: TRACE_1, tracestate: "app=1" } }],
      ["hint", { since: "v1", version: "v2", changed: ["a"], deleted: [], extra: { traceparent: TRACE_2 } }],
      ["hint", { since: "v2", version: "v3", changed: ["a", "c"], deleted: [], extra: { traceparent: TRACE_2 } }],
      ["changes", { since: "v3", version: "v4", full: false, changed: [["a", { n: 1 }]], deleted: [] }],
      ["hint", { since: "v4", version: "v5", changed: ["a"], deleted: [] }],
    ]);
    const extras = listener.log.map(([, event]) => (event as { extra?: object }).extra);
    expect(Object.keys(extras[1]!)).toEqual(["traceparent"]);
    expect(Object.keys(extras[2]!)).toEqual(["traceparent"]);
    expect(listener.log[3]![1]).not.toHaveProperty("extra");
    expect(listener.log[4]![1]).not.toHaveProperty("extra");
  });

  it("keeps a field __proto__ of the wire as an own field of extra: it changes no prototype", () => {
    const source = new FakeSource();
    const listener = recorder();
    new EventsChangeFeed<Item>(source, { collection: "items" }).subscribe(listener);
    source.event(JSON.parse('{"since":"v0","version":"v1","changed":[],"deleted":["a"],"__proto__":{"polluted":true}}'), 1);
    const hint = listener.log[0]![1] as RemoteChangeHint;
    expect(Object.getPrototypeOf(hint.extra)).toBe(Object.prototype);
    expect(Object.hasOwn(hint.extra!, "__proto__")).toBe(true);
    expect((hint.extra as { polluted?: unknown }).polluted).toBeUndefined();
    expect(({} as { polluted?: unknown }).polluted).toBeUndefined();
  });

  it("the hook of a HybridStorage gets the traceparent of the event of a delta and of a hint", async () => {
    const source = new FakeSource();
    const remote = new InMemoryStorage<Item>();
    const seen: unknown[] = [];
    const hybrid = new HybridStorage<Item>(remote, {
      feed: new EventsChangeFeed<Item>(source, { collection: "items" }),
      syncInterval: ms(0),
      aroundRemoteApply: (hint, apply, { cause }) => {
        seen.push([cause, hint?.extra?.["traceparent"]]);
        return apply();
      },
    });
    await hybrid.getAll();
    const v0 = (await remote.getChangesSince()).version;
    await remote.set("a", { n: 1 });
    const v1 = (await remote.getChangesSince()).version;
    // A delta with values applies without a read, inside the hook
    source.event({ since: v0, version: v1, changed: ["a"], deleted: [], values: [{ id: "a", value: { n: 1 } }], traceparent: TRACE_1 }, 1);
    await vi.waitFor(async () => expect(await hybrid.getEntries()).toEqual([["a", { n: 1 }]]));
    // A hint makes a pull, inside the hook
    await remote.set("b", { n: 2 });
    source.event({ since: v1, version: (await remote.getChangesSince()).version, changed: ["b"], deleted: [], traceparent: TRACE_2 }, 2);
    await vi.waitFor(async () => expect(await hybrid.getEntries()).toEqual([["a", { n: 1 }], ["b", { n: 2 }]]));
    await vi.waitFor(() => expect(hybrid.getStatus().syncing).toBe(false));
    expect(seen).toEqual([["pull", undefined], ["delta", TRACE_1], ["hint", TRACE_2]]);
    expect(hybrid.getStatus().error).toBeUndefined();
    await hybrid.close();
  });
});
