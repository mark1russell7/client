/**
 * The row filter of the change events (roadmap CLI-78). A principal with a rule of the rows can
 * subscribe to a topic of a collection. It gets only the ids of the rows that it can read, and a
 * delete of each row that it could read before.
 */

import { describe, it, expect, afterEach } from "vitest";
import { createCollectionProcedures, type CollectionProceduresOptions } from "./procedures.js";
import type { CollectionAdmission } from "./admission.js";
import type { CollectionChangeEvent } from "./changes.js";
import type { CollectionStorage, StorageChanges } from "./storage.js";
import { withHintImages, hintImagesOf } from "./hint-filter.js";
import { invokeProcedure, outputValue, type AdmitItem } from "../invoke.js";
import { ProcedureRegistry } from "../registry.js";
import type { RepositoryProvider } from "../types.js";
import type { Principal } from "../../server/types.js";
import { createEventBus } from "../../events/bus.js";
import { EventPublisher, type EventPublisherOptions } from "../../events/publisher.js";
import type { EventItem } from "../../events/remote.js";
import type { EventBus } from "../../events/types.js";

/** A storage of a Map with a change log (`v:<number>`). It counts the reads of `getBatch`. */
class LogStorage implements CollectionStorage<unknown> {
  readonly data = new Map<string, unknown>();
  private seq = 0;
  private readonly changedAt = new Map<string, number>();
  private readonly deletedAt = new Map<string, number>();
  batchReads = 0;

  constructor(items: Record<string, unknown> = {}) {
    for (const [id, value] of Object.entries(items)) this.data.set(id, value);
  }
  private write(id: string, value: unknown): void {
    this.data.set(id, value);
    this.changedAt.set(id, ++this.seq);
    this.deletedAt.delete(id);
  }
  private remove(id: string): boolean {
    const existed = this.data.delete(id);
    if (existed) {
      this.deletedAt.set(id, ++this.seq);
      this.changedAt.delete(id);
    }
    return existed;
  }
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
    const version = `v:${this.seq}`;
    if (since === undefined) return { version, full: true, changed: [...this.data.entries()], deleted: [] };
    const from = Number(since.slice(2));
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
  async set(id: string, value: unknown) {
    this.write(id, value);
  }
  async delete(id: string) {
    return this.remove(id);
  }
  async clear() {
    for (const id of [...this.data.keys()]) this.remove(id);
  }
  async setBatch(items: Array<[string, unknown]>) {
    for (const [id, value] of items) this.write(id, value);
  }
  async deleteBatch(ids: string[]) {
    let count = 0;
    for (const id of ids) if (this.remove(id)) count++;
    return count;
  }
  async getBatch(ids: string[]) {
    this.batchReads++;
    return new Map(ids.filter((id) => this.data.has(id)).map((id): [string, unknown] => [id, this.data.get(id)]));
  }
  async close() {}
}

const ann: Principal = { id: "ann", via: "test" };
const bob: Principal = { id: "bob", via: "test" };
const root: Principal = { id: "root", via: "test" };

/** The owner of a stored note. */
const ownerOf = (value: unknown): unknown => (typeof value === "object" && value !== null ? (value as Record<string, unknown>)["owner"] : undefined);

/** The groups of each principal: a test changes them to change the rights. */
let shared: Record<string, string[]> = {};

/** The rule of the rows: root reads each note, a note is for its owner, and a public note is for each caller. */
const ownRows: AdmitItem = (row, invocation) => {
  const me = invocation.principal?.id;
  const value = (row as { value: unknown }).value as Record<string, unknown> | null;
  if (me === "root") return true;
  return value?.["public"] === true || ownerOf(value) === me || (shared[me ?? ""] ?? []).includes(String(ownerOf(value)));
};

/** Full rights: root reads each row of the collection. */
const rules: CollectionAdmission = { admit: ownRows, admitsAll: (invocation) => invocation.principal?.id === "root" };

/** The notes of Ann and Bob, and one public note of Bob. */
function notes(): LogStorage {
  return new LogStorage({
    a1: { owner: "ann", text: "A1" },
    b1: { owner: "bob", text: "B1" },
    p1: { owner: "bob", text: "P1", public: true },
  });
}

let stops: Array<() => void> = [];
afterEach(() => {
  for (const stop of stops.splice(0)) stop();
  shared = {};
});

/** The procedures of the collection "notes" on one storage, in a registry, with a bus and a publisher. */
function host(storage: LogStorage, options: CollectionProceduresOptions = { admission: rules }, publisherOptions: Partial<EventPublisherOptions> = {}) {
  const procedures = createCollectionProcedures("notes", options);
  const registry = new ProcedureRegistry();
  registry.registerAll(procedures);
  const bus: EventBus = createEventBus();
  const repository: RepositoryProvider = { getStorage: <T>() => storage as unknown as CollectionStorage<T>, hasCollection: (name) => name === "notes" };
  const publisher = new EventPublisher({ bus, topics: ["collections.*"], ...publisherOptions });
  const run = async (operation: string, input: unknown, principal: Principal = root): Promise<unknown> => {
    const procedure = procedures.find((candidate) => candidate.path[2] === operation)!;
    return outputValue(await invokeProcedure(procedure, input, { repository, bus, registry, principal }), procedure.path);
  };
  /** A subscription of a principal to the topic of the notes: the events that it gets, with their `seq`. */
  const subscribe = async (principal: Principal) => {
    const controller = new AbortController();
    const output = await invokeProcedure(publisher.procedure, { topics: ["collections.notes"] }, { bus, repository, registry, signal: controller.signal, principal });
    if (output.kind !== "stream") throw new Error("events.subscribe gives a stream");
    const items = output.items as AsyncGenerator<EventItem, void, undefined>;
    await items.next();
    const received: CollectionChangeEvent[] = [];
    const seqs: number[] = [];
    void (async () => {
      for await (const item of items) {
        if (item.type !== "event") continue;
        received.push(item.data as CollectionChangeEvent);
        seqs.push(item.seq);
      }
    })().catch(() => undefined);
    const stop = (): void => controller.abort();
    stops.push(stop);
    return { received, seqs, stop };
  };
  return { run, bus, publisher, subscribe, storage };
}

/** A few turns of the event loop: each event on the bus reaches the loop of its subscriber. */
const settle = async (): Promise<void> => {
  for (let turn = 0; turn < 10; turn++) await new Promise((resolve) => setImmediate(resolve));
};

/** The ids of the events: `changed` and `deleted` of each. */
const idsOf = (events: readonly CollectionChangeEvent[]) => events.map(({ changed, deleted }) => ({ changed, deleted }));

describe("the row filter of the change events (CLI-78)", () => {
  it("gives each subscriber only the ids of the rows that the rule admits for it", async () => {
    const h = host(notes());
    const annSub = await h.subscribe(ann);
    const bobSub = await h.subscribe(bob);
    const rootSub = await h.subscribe(root);
    await h.run("changes", {});
    await h.run("setBatch", { items: [{ id: "a2", value: { owner: "ann" } }, { id: "b2", value: { owner: "bob" } }, { id: "p2", value: { owner: "bob", public: true } }] });
    await settle();
    expect(idsOf(annSub.received)).toEqual([{ changed: ["a2", "p2"], deleted: [] }]);
    expect(idsOf(bobSub.received)).toEqual([{ changed: ["b2", "p2"], deleted: [] }]);
    expect(idsOf(rootSub.received)).toEqual([{ changed: ["a2", "b2", "p2"], deleted: [] }]);
    // The filtered event keeps the chain: the subscriber applies it at its cursor
    expect(annSub.received[0]).toMatchObject({ since: "v:0", version: "v:3" });
  });

  it("gives no event to a subscriber that can read none of its rows, and the next event keeps the chain", async () => {
    const h = host(notes());
    const annSub = await h.subscribe(ann);
    await h.run("changes", {});
    await h.run("set", { id: "a2", value: { owner: "ann" } });
    await h.run("set", { id: "b2", value: { owner: "bob" } });
    await h.run("set", { id: "b3", value: { owner: "bob" } });
    await h.run("set", { id: "a3", value: { owner: "ann" } });
    await settle();
    expect(annSub.received).toEqual([
      { since: "v:0", version: "v:1", changed: ["a2"], deleted: [] },
      // The two events of Bob's notes went: the `since` is the version of the last event of Ann
      { since: "v:1", version: "v:4", changed: ["a3"], deleted: [] },
    ]);
    // The numbers of the events have no gap, so the subscriber does not read the changes
    expect(annSub.seqs).toEqual([1, 2]);
  });

  it("gives a delete of a row that leaves the rule, and no id of a row that the subscriber never read", async () => {
    const h = host(notes());
    const annSub = await h.subscribe(ann);
    const bobSub = await h.subscribe(bob);
    await h.run("changes", {});
    // Ann's note goes to Bob: Ann read it before the change
    await h.run("set", { id: "a1", value: { owner: "bob", text: "A1" } });
    // A delete of a note of Bob: Ann never read it
    await h.run("delete", { id: "b1" });
    // A delete of the public note: each one read it
    await h.run("delete", { id: "p1" });
    await settle();
    expect(idsOf(annSub.received)).toEqual([
      { changed: [], deleted: ["a1"] },
      { changed: [], deleted: ["p1"] },
    ]);
    expect(idsOf(bobSub.received)).toEqual([
      { changed: ["a1"], deleted: [] },
      { changed: [], deleted: ["b1"] },
      { changed: [], deleted: ["p1"] },
    ]);
    expect(annSub.received.map(({ since, version }) => [since, version])).toEqual([
      ["v:0", "v:1"],
      ["v:1", "v:3"],
    ]);
  });

  it("gives the values of the admitted rows only, with no withheld id for a row that the rule refuses", async () => {
    const h = host(notes(), { admission: rules, changeEvents: { values: true } });
    const annSub = await h.subscribe(ann);
    await h.run("changes", {});
    await h.run("setBatch", { items: [{ id: "a2", value: { owner: "ann" } }, { id: "b2", value: { owner: "bob" } }] });
    await settle();
    expect(annSub.received).toEqual([{ since: "v:0", version: "v:2", changed: ["a2"], deleted: [], values: [{ id: "a2", value: { owner: "ann" } }] }]);
  });

  it("keeps the event and the cost of a subscriber with full rights as before", async () => {
    const storage = notes();
    const h = host(storage);
    const rootSub = await h.subscribe(root);
    await h.run("changes", {});
    await h.run("set", { id: "b2", value: { owner: "bob" } });
    await h.run("delete", { id: "a1" });
    await settle();
    expect(rootSub.received).toEqual([
      { since: "v:0", version: "v:1", changed: ["b2"], deleted: [] },
      { since: "v:1", version: "v:2", changed: [], deleted: ["a1"] },
    ]);
    // No subscriber has a row filter, so the writes do not read the rows before them
    expect(storage.batchReads).toBe(0);
  });

  it("reads the rows before a write only while a subscriber has a row filter", async () => {
    const storage = notes();
    const h = host(storage);
    await h.run("changes", {});
    await h.run("set", { id: "a2", value: { owner: "ann" } });
    expect(storage.batchReads).toBe(0);
    const annSub = await h.subscribe(ann);
    await h.run("set", { id: "a3", value: { owner: "ann" } });
    expect(storage.batchReads).toBe(1);
    annSub.stop();
    await settle();
    await h.run("set", { id: "a4", value: { owner: "ann" } });
    expect(storage.batchReads).toBe(1);
  });

  it("gives a hint without ids when the event has no images of its rows", async () => {
    const h = host(notes());
    const annSub = await h.subscribe(ann);
    const rootSub = await h.subscribe(root);
    // An event of the app with ids and no images: the registry has the rule, so Ann does not get the ids
    h.publisher.publish("collections.notes", { since: "v:0", version: "v:7", changed: ["b9"], deleted: ["b8"], origin: "app" });
    await settle();
    expect(annSub.received).toEqual([{ version: "v:7", changed: [], deleted: [], origin: "app" }]);
    expect(rootSub.received).toEqual([{ since: "v:0", version: "v:7", changed: ["b9"], deleted: ["b8"], origin: "app" }]);
  });

  it("filters an event of the app with images", async () => {
    const h = host(notes());
    const annSub = await h.subscribe(ann);
    const event = withHintImages(
      { since: "v:0", version: "v:7", changed: ["a9", "b9"], deleted: [], versions: [{ id: "a9", version: "1" }, { id: "b9", version: "1" }] },
      { after: new Map([["a9", { found: true, value: { owner: "ann" } }], ["b9", { found: true, value: { owner: "bob" } }]]), before: new Map([["b9", { found: false }]]) },
    );
    expect(hintImagesOf(event)?.after?.size).toBe(2);
    h.publisher.publish("collections.notes", event);
    await settle();
    expect(annSub.received).toEqual([{ since: "v:0", version: "v:7", changed: ["a9"], deleted: [], versions: [{ id: "a9", version: "1" }] }]);
  });

  it("passes a reset hint without its ids", async () => {
    const h = host(notes());
    const annSub = await h.subscribe(ann);
    h.publisher.publish("collections.notes", { version: "v:9", changed: ["b1"], deleted: [], reset: true });
    await settle();
    expect(annSub.received).toEqual([{ version: "v:9", changed: [], deleted: [], reset: true }]);
  });

  it("gives a reset hint at a change of the rights, and the next events obey the new rights", async () => {
    const h = host(notes());
    const annSub = await h.subscribe(ann);
    const rootSub = await h.subscribe(root);
    await h.run("changes", {});
    await h.run("set", { id: "b2", value: { owner: "bob" } });
    await settle();
    expect(annSub.received).toEqual([]);
    // Bob shares his notes with Ann
    shared = { ann: ["bob"] };
    await h.publisher.rightsChanged();
    await h.run("set", { id: "b3", value: { owner: "bob" } });
    await settle();
    expect(annSub.received).toEqual([
      { changed: [], deleted: [], reset: true },
      { since: "v:1", version: "v:2", changed: ["b3"], deleted: [] },
    ]);
    // Bob stops: Ann's next delete of a note of Bob does not reach her
    shared = {};
    await h.publisher.rightsChanged("ann");
    await h.run("delete", { id: "b3" });
    await settle();
    expect(annSub.received.slice(2)).toEqual([{ changed: [], deleted: [], reset: true }]);
    // A change of the rights of a subscriber with full rights gives no reset hint
    expect(rootSub.received.some((event) => event.reset === true)).toBe(false);
  });

  it("gives a reset hint at a re-check when the subscriber loses its full rights", async () => {
    let full = true;
    const h = host(notes(), { admission: { admit: ownRows, admitsAll: () => full } });
    const annSub = await h.subscribe(ann);
    await h.run("changes", {});
    await h.run("set", { id: "b2", value: { owner: "bob" } });
    await settle();
    expect(idsOf(annSub.received)).toEqual([{ changed: ["b2"], deleted: [] }]);
    full = false;
    await h.publisher.rightsChanged();
    await h.run("set", { id: "b3", value: { owner: "bob" } });
    await h.run("set", { id: "a3", value: { owner: "ann" } });
    await settle();
    expect(annSub.received.slice(1)).toEqual([
      { changed: [], deleted: [], reset: true },
      { since: "v:1", version: "v:3", changed: ["a3"], deleted: [] },
    ]);
  });

  it("gives a hint without ids when the rule fails", async () => {
    const h = host(notes(), {
      admission: {
        admit: (row) => {
          if ((row as { id: string }).id === "x1") throw new Error("the rule cannot read the lists");
          return true;
        },
      },
    });
    const annSub = await h.subscribe(ann);
    await h.run("changes", {});
    await h.run("set", { id: "x1", value: { owner: "ann" } });
    await settle();
    expect(annSub.received).toEqual([{ version: "v:1", changed: [], deleted: [] }]);
  });

  it("passes each event of a collection without a rule of the rows", async () => {
    const storage = notes();
    const h = host(storage, {});
    const annSub = await h.subscribe(ann);
    await h.run("changes", {});
    await h.run("set", { id: "b2", value: { owner: "bob" } });
    await settle();
    expect(annSub.received).toEqual([{ since: "v:0", version: "v:1", changed: ["b2"], deleted: [] }]);
    expect(storage.batchReads).toBe(0);
  });
});
