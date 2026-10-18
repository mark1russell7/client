/**
 * The change events of the collection procedures (roadmap CLI-15). Each write publishes a
 * `CollectionChangeEvent` on the bus of the context, under the topic `collections.<name>`, while a
 * subscriber listens. The events of one storage make a chain of versions from the change log.
 */

import { describe, it, expect } from "vitest";
import { createCollectionProcedures, type CollectionProceduresOptions } from "./procedures.js";
import { collectionChangeTopic, collectionTopicReads, type CollectionChangeEvent } from "./changes.js";
import type { CollectionStorage, StorageChanges, StorageWriteOptions } from "./storage.js";
import { invokeProcedure, outputValue } from "../invoke.js";
import type { ProcedureContext, RepositoryProvider } from "../types.js";
import { createEventBus } from "../../events/bus.js";
import type { EventBus } from "../../events/types.js";
import { EventPublisher } from "../../events/publisher.js";
import type { EventItem } from "../../events/remote.js";
import type { Capability } from "../types.js";
import { ProcedureServer } from "../../server/procedure-server.js";
import { ProcedureRegistry } from "../registry.js";
import { coreProcedures } from "../core/index.js";

/** A storage of a Map with a change log: a version is `log:<number>`. It keeps the origin of each write. */
class LogStorage implements CollectionStorage<unknown> {
  readonly data = new Map<string, unknown>();
  readonly origins: Array<string | undefined> = [];
  private seq = 0;
  private readonly changedAt = new Map<string, number>();
  private readonly deletedAt = new Map<string, number>();
  /** The versions that the log does not know: a call with one of them gives all items */
  floor = 0;
  failChanges = false;

  async get(id: string) {
    return this.data.get(id);
  }
  async getAll() {
    return [...this.data.values()];
  }
  async getEntries() {
    return [...this.data.entries()];
  }
  async getChangesSince(since?: string): Promise<StorageChanges<unknown>> {
    if (this.failChanges) throw new Error("the log is not available");
    const version = `log:${this.seq}`;
    const from = since === undefined ? undefined : Number(since.slice(4));
    if (from === undefined || from < this.floor) return { version, full: true, changed: [...this.data.entries()], deleted: [] };
    const changed = [...this.changedAt].filter(([, at]) => at > from).map(([id]): [string, unknown] => [id, this.data.get(id)]);
    const deleted = [...this.deletedAt].filter(([, at]) => at > from).map(([id]) => id);
    return { version, full: false, changed, deleted };
  }
  async find(predicate: (item: unknown) => boolean) {
    return [...this.data.values()].filter(predicate);
  }
  async has(id: string) {
    return this.data.has(id);
  }
  async size() {
    return this.data.size;
  }
  async set(id: string, value: unknown, options?: StorageWriteOptions) {
    this.origins.push(options?.origin);
    this.data.set(id, value);
    this.noteSet(id);
  }
  async delete(id: string, options?: StorageWriteOptions) {
    this.origins.push(options?.origin);
    const existed = this.data.delete(id);
    if (existed) this.noteDelete(id);
    return existed;
  }
  async clear(options?: StorageWriteOptions) {
    this.origins.push(options?.origin);
    for (const id of this.data.keys()) this.noteDelete(id);
    this.data.clear();
  }
  async setBatch(items: Array<[string, unknown]>, options?: StorageWriteOptions) {
    this.origins.push(options?.origin);
    for (const [id, value] of items) {
      this.data.set(id, value);
      this.noteSet(id);
    }
  }
  async deleteBatch(ids: string[], options?: StorageWriteOptions) {
    this.origins.push(options?.origin);
    let count = 0;
    for (const id of ids) {
      if (this.data.delete(id)) {
        this.noteDelete(id);
        count++;
      }
    }
    return count;
  }
  async getBatch(ids: string[]) {
    return new Map(ids.filter((id) => this.data.has(id)).map((id) => [id, this.data.get(id)]));
  }
  async close() {}

  /** A write that does not go through the procedures. */
  writeDirectly(id: string, value: unknown): void {
    this.data.set(id, value);
    this.noteSet(id);
  }

  private noteSet(id: string): void {
    this.changedAt.delete(id);
    this.changedAt.set(id, ++this.seq);
    this.deletedAt.delete(id);
  }
  private noteDelete(id: string): void {
    this.changedAt.delete(id);
    this.deletedAt.delete(id);
    this.deletedAt.set(id, ++this.seq);
  }
}

/** The procedures of the collection "things" over one storage and one bus. */
function host(storage: CollectionStorage<unknown>, options?: CollectionProceduresOptions, bus: EventBus = createEventBus()) {
  const procedures = createCollectionProcedures("things", options);
  const repository = { getStorage: () => storage, hasCollection: () => true } as unknown as RepositoryProvider;
  const run = async (operation: string, input: unknown): Promise<unknown> => {
    const procedure = procedures.find((candidate) => candidate.path[2] === operation)!;
    return outputValue(await invokeProcedure(procedure, input, { repository, bus }), procedure.path);
  };
  const events: CollectionChangeEvent[] = [];
  const listen = (topic = "collections.things") => bus.on<CollectionChangeEvent>(topic, (event) => void events.push(event));
  return { run, events, listen, bus };
}

describe("the change events of the collection procedures (CLI-15)", () => {
  it("the topic of a collection is collections.<name>", () => {
    expect(collectionChangeTopic("users")).toBe("collections.users");
  });

  it("a write after a call of changes publishes the delta from that version, and the events make a chain", async () => {
    const storage = new LogStorage();
    const { run, events, listen } = host(storage);
    listen();
    const start = (await run("changes", {})) as { version: string };
    await run("set", { id: "a", value: { n: 1 }, origin: "tab-1" });
    // The event has the ids and the versions, and no value
    expect(events).toEqual([{ since: start.version, version: "log:1", changed: ["a"], deleted: [], origin: "tab-1" }]);
    await run("set", { id: "b", value: { n: 2 } });
    await run("delete", { id: "a", origin: "tab-1" });
    expect(events.slice(1)).toEqual([
      { since: "log:1", version: "log:2", changed: ["b"], deleted: [] },
      { since: "log:2", version: "log:3", changed: [], deleted: ["a"], origin: "tab-1" },
    ]);
    // The storage got the origin of each write
    expect(storage.origins).toEqual(["tab-1", undefined, "tab-1"]);
  });

  it("each write procedure publishes its event, with the origin of its input", async () => {
    const storage = new LogStorage();
    const { run, events, listen } = host(storage);
    listen();
    await run("changes", {});
    await run("setBatch", { items: [{ id: "a", value: { v: 1 } }, { id: "b", value: { v: 2 } }], origin: "o" });
    await run("patch", { id: "a", fields: { $set: { n: 1 } }, origin: "o" });
    await run("deleteBatch", { ids: ["b", "missing"], origin: "o" });
    await run("clear", { origin: "o" });
    expect(events.map((event) => [event.changed, event.deleted, event.origin])).toEqual([
      [["a", "b"], [], "o"],
      [["a"], [], "o"],
      [[], ["b"], "o"],
      [[], ["a"], "o"],
    ]);
    expect(storage.origins).toEqual(["o", "o", "o", "o"]);
  });

  it("an event has no origin when a write outside the procedures is in its changes", async () => {
    const storage = new LogStorage();
    const { run, events, listen } = host(storage);
    listen();
    await run("changes", {});
    storage.writeDirectly("x", 9);
    await run("set", { id: "a", value: 1, origin: "o" });
    expect(events).toEqual([{ since: "log:0", version: "log:2", changed: ["x", "a"], deleted: [] }]);
  });

  it("a write before any call of changes publishes a hint without since, and a write that changes nothing publishes nothing", async () => {
    const storage = new LogStorage();
    const { run, events, listen } = host(storage);
    listen();
    await run("set", { id: "a", value: 1, origin: "o" });
    expect(events).toEqual([{ changed: [], deleted: [], origin: "o" }]);
    await run("changes", {});
    await run("delete", { id: "missing" });
    expect(events).toHaveLength(1);
  });

  it("without a subscriber, the procedures publish nothing and do not read the log, and the chain starts again", async () => {
    const storage = new LogStorage();
    const { run, events, listen } = host(storage);
    await run("changes", {});
    storage.failChanges = true;
    // No one listens: the procedures do not call getChangesSince, which fails now
    await run("set", { id: "a", value: 1 });
    storage.failChanges = false;
    const stop = listen();
    await run("set", { id: "b", value: 2 });
    // The chain stopped: a hint, until the next call of changes
    expect(events).toEqual([{ changed: [], deleted: [] }]);
    const start = (await run("changes", {})) as { version: string };
    await run("set", { id: "c", value: 3 });
    expect(events[1]).toMatchObject({ since: start.version, changed: ["c"] });
    stop();
  });

  it("a write that started before the chain had a version publishes a hint with the version", async () => {
    const storage = new LogStorage();
    const { run, events, listen } = host(storage);
    listen();
    let release!: () => void;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => (entered = resolve));
    const original = storage.set.bind(storage);
    storage.set = async (id, value, options) => {
      entered();
      await new Promise<void>((resolve) => (release = resolve));
      await original(id, value, options);
    };
    const write = run("set", { id: "a", value: 1 });
    await started;
    // A pull starts the chain while the write runs
    await run("changes", {});
    release();
    await write;
    expect(events).toEqual([{ version: "log:1", changed: [], deleted: [] }]);
  });

  it("a storage without a change log publishes a hint, and a failed or full read of the log publishes a hint", async () => {
    const withoutLog = new LogStorage();
    // An own property hides the method of the class: a storage without a change log
    (withoutLog as { getChangesSince?: unknown }).getChangesSince = undefined;
    const first = host(withoutLog);
    first.listen();
    await first.run("set", { id: "a", value: 1 });
    expect(first.events).toEqual([{ changed: [], deleted: [] }]);

    const storage = new LogStorage();
    const second = host(storage);
    second.listen();
    await second.run("changes", {});
    storage.failChanges = true;
    await second.run("set", { id: "a", value: 1 });
    storage.failChanges = false;
    // The log dropped the version of the chain: a full result
    storage.floor = 5;
    await second.run("set", { id: "b", value: 2 });
    expect(second.events).toEqual([
      { changed: [], deleted: [] },
      { version: "log:2", changed: [], deleted: [] },
    ]);
    storage.floor = 0;
    await second.run("set", { id: "c", value: 3 });
    expect(second.events[2]).toEqual({ since: "log:2", version: "log:3", changed: ["c"], deleted: [] });
  });

  it("changeEvents: false publishes nothing, and the option topic gives the topic of each call", async () => {
    const off = host(new LogStorage(), { changeEvents: false });
    off.listen();
    await off.run("changes", {});
    await off.run("set", { id: "a", value: 1 });
    expect(off.events).toEqual([]);

    const topics: string[] = [];
    const scoped = host(new LogStorage(), {
      changeEvents: {
        topic: (collection: string, ctx: ProcedureContext) => {
          topics.push(ctx.path.join("."));
          return `collections.${collection}.team-1`;
        },
      },
    });
    scoped.listen("collections.things.team-1");
    await scoped.run("changes", {});
    await scoped.run("set", { id: "a", value: 1 });
    expect(scoped.events).toEqual([{ since: "log:0", version: "log:1", changed: ["a"], deleted: [] }]);
    expect(topics).toEqual(["collections.things.changes", "collections.things.set"]);

    const none = host(new LogStorage(), { changeEvents: { topic: () => undefined } });
    none.listen();
    await none.run("set", { id: "a", value: 1 });
    expect(none.events).toEqual([]);
  });

  it("a write that fails publishes the changes that it made", async () => {
    const storage = new LogStorage();
    const { run, events, listen } = host(storage);
    listen();
    await run("changes", {});
    storage.setBatch = async (items) => {
      storage.writeDirectly(items[0]![0], items[0]![1]);
      throw new Error("the batch failed after one item");
    };
    await expect(run("setBatch", { items: [{ id: "a", value: 1 }, { id: "b", value: 2 }] })).rejects.toThrow();
    expect(events).toEqual([{ since: "log:0", version: "log:1", changed: ["a"], deleted: [] }]);
  });

  it("an origin that is not a string of 1 to 256 characters is a validation error", async () => {
    const { run } = host(new LogStorage());
    for (const origin of ["", 7, "x".repeat(257)]) {
      await expect(run("set", { id: "a", value: 1, origin })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    }
    for (const [operation, input] of [
      ["delete", { id: "a" }],
      ["clear", {}],
      ["patch", { id: "a", fields: { n: 1 } }],
      ["setBatch", { items: [] }],
      ["deleteBatch", { ids: [] }],
    ] as const) {
      await expect(run(operation, { ...input, origin: 1 })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    }
    await expect(run("set", { id: "a", value: 1, origin: "x".repeat(256) })).resolves.toBeUndefined();
  });
});

describe("the values of the change events and the subscribers that can read them (CLI-15)", () => {
  it("the topics of a collection read collection:<name>, also with a partition", () => {
    expect(collectionTopicReads("collections.users")).toEqual(["collection:users"]);
    expect(collectionTopicReads("collections.users.team-1")).toEqual(["collection:users"]);
    expect(collectionTopicReads("orders.created")).toEqual([]);
    expect(collectionTopicReads("collections")).toEqual([]);
  });

  /** A subscription of one subscriber, with its capability and the output filter of its host. */
  async function subscriber(bus: EventBus, topics: string[], options: { capability?: Capability; admitItem?: (item: unknown) => boolean } = {}) {
    const publisher = new EventPublisher({ bus, topics: ["collections.*", "orders.*"] });
    const controller = new AbortController();
    const output = await invokeProcedure(publisher.procedure, { topics }, {
      bus,
      signal: controller.signal,
      ...(options.capability && { capability: options.capability }),
      ...(options.admitItem && { admitItem: options.admitItem }),
    });
    if (output.kind !== "stream") throw new Error("events.subscribe gives a stream");
    const items = output.items as AsyncGenerator<EventItem, void, undefined>;
    expect((await items.next()).value).toMatchObject({ type: "subscribed" });
    return { next: async () => (await items.next()).value as Extract<EventItem, { type: "event" }>, stop: () => controller.abort() };
  }

  it("a subscriber without the read of the collection gets FORBIDDEN, and with it the subscription starts", async () => {
    const bus = createEventBus();
    const readsEvents: Capability = { effects: { reads: ["events"], writes: [] } };
    for (const topic of ["collections.things", "collections.things.team-1"]) {
      await expect(subscriber(bus, [topic], { capability: readsEvents })).rejects.toMatchObject({ code: "FORBIDDEN", reason: "effects-exceeded" });
    }
    // A topic of another kind reads nothing more
    const orders = await subscriber(bus, ["orders.created"], { capability: readsEvents });
    orders.stop();
    const reader = await subscriber(bus, ["collections.things"], { capability: { effects: { reads: ["events", "collection:things"], writes: [] } } });
    reader.stop();
  });

  it("with values, each row passes the filter of each subscriber: a refused row never reaches it, and its id is withheld", async () => {
    const storage = new LogStorage();
    const { run, bus } = host(storage, { changeEvents: { values: true } });
    const secret = (item: unknown): boolean => ((item as { value?: { secret?: boolean } }).value?.secret ?? false) === true;
    const limited = await subscriber(bus, ["collections.things"], { admitItem: (item) => !secret(item) });
    const open = await subscriber(bus, ["collections.things"]);
    await run("changes", {});
    await run("setBatch", { items: [{ id: "a", value: { n: 1 } }, { id: "s", value: { n: 2, secret: true } }] });
    const seen = await limited.next();
    expect(seen.data).toEqual({ since: "log:0", version: "log:2", changed: ["a", "s"], deleted: [], values: [{ id: "a", value: { n: 1 } }], withheld: ["s"] });
    expect(JSON.stringify(seen)).not.toContain("secret");
    // A subscriber whose filter admits each row gets each value
    expect((await open.next()).data).toEqual({
      since: "log:0",
      version: "log:2",
      changed: ["a", "s"],
      deleted: [],
      values: [{ id: "a", value: { n: 1 } }, { id: "s", value: { n: 2, secret: true } }],
    });
    limited.stop();
    open.stop();
  });

  it("without the option values, an event has no values, whatever the filter", async () => {
    const storage = new LogStorage();
    const { run, bus } = host(storage);
    const one = await subscriber(bus, ["collections.things"], { admitItem: () => true });
    await run("changes", {});
    await run("set", { id: "a", value: { n: 1, secret: true } });
    const seen = await one.next();
    expect(seen.data).toEqual({ since: "log:0", version: "log:1", changed: ["a"], deleted: [] });
    expect(JSON.stringify(seen)).not.toContain("secret");
    one.stop();
  });

  it("a data-driven procedure cannot reach events.subscribe: client.chain gets NOT_FOUND, so no nested call gets unfiltered rows", async () => {
    // The server pins events.subscribe outside its registry, and ctx.admit exists only at depth 0
    const registry = new ProcedureRegistry();
    for (const procedure of coreProcedures) registry.register(procedure);
    const server = new ProcedureServer({
      registry,
      autoRegister: true,
      events: { bus: createEventBus(), topics: ["collections.*"] },
      admitItem: () => true,
    });
    const subscribe = { $proc: ["events", "subscribe"], input: { topics: ["collections.things"] } };
    for (const payload of [{ steps: [subscribe] }, { steps: [{ $proc: ["client", "identity"], input: { value: subscribe } }] }]) {
      const response = await server.handle({ id: "1", method: { service: "client", operation: "chain" }, payload, metadata: {} });
      expect(response.status).toMatchObject({ type: "error", code: "NOT_FOUND" });
      expect(response.status.type === "error" && response.status.message).toContain("events.subscribe");
    }
    // A call of the host reaches the pinned procedure, and the registry of the nested calls does not have it
    expect(server.hasProcedure(["events", "subscribe"])).toBe(true);
    expect(server.getRegistry().get(["events", "subscribe"])).toBeUndefined();
  });
});
