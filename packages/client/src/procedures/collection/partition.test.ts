/**
 * The partitions of the collection procedures (roadmap CLI-17). One `collections.<name>.*` surface
 * serves several tenants: the resolver of the repository takes the tenant from the principal of
 * the call, never from the input alone, and each partition has its own storage. A subscriber of
 * the change events names a partition as an input does, so it cannot reach another tenant.
 */

import { describe, it, expect } from "vitest";
import { createCollectionProcedures, type CollectionProceduresOptions } from "./procedures.js";
import { collectionChangeTopic, type CollectionChangeEvent } from "./changes.js";
import { collectionTopicPartition, PARTITION_PATTERN, type PartitionResolver } from "./partition.js";
import type { CollectionStorage } from "./storage.js";
import { invokeProcedure, InvocationError, outputValue } from "../invoke.js";
import type { RepositoryProvider } from "../types.js";
import type { Principal } from "../../server/types.js";
import { createEventBus } from "../../events/bus.js";
import { EventPublisher } from "../../events/publisher.js";
import type { EventItem } from "../../events/remote.js";
import { ProcedureServer } from "../../server/procedure-server.js";

/** A storage of a Map. */
class MapStorage implements CollectionStorage<unknown> {
  readonly data = new Map<string, unknown>();
  async get(id: string) {
    return this.data.get(id);
  }
  async getAll() {
    return [...this.data.values()];
  }
  async getEntries() {
    return [...this.data.entries()];
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
    this.data.set(id, value);
  }
  async delete(id: string) {
    return this.data.delete(id);
  }
  async clear() {
    this.data.clear();
  }
  async getBatch(ids: string[]) {
    return new Map(ids.filter((id) => this.data.has(id)).map((id): [string, unknown] => [id, this.data.get(id)]));
  }
  async setBatch(items: Array<[string, unknown]>) {
    for (const [id, value] of items) this.data.set(id, value);
  }
  async deleteBatch(ids: string[]) {
    let count = 0;
    for (const id of ids) if (this.data.delete(id)) count++;
    return count;
  }
  async close() {}
}

/** The tenant of a principal: the claim `tenant`. */
const tenantOf = (principal: Principal | undefined): string | undefined => {
  const tenant = principal?.claims?.["tenant"];
  return typeof tenant === "string" ? tenant : undefined;
};

/** A resolver: the tenant of the principal, and the scope that the call asks for under it. */
const byTenant: PartitionResolver = (ctx, requested) => {
  const tenant = tenantOf(ctx.principal);
  if (tenant === undefined) return null;
  return requested === undefined ? tenant : `${tenant}/${requested}`;
};

const ann: Principal = { id: "ann", via: "test", claims: { tenant: "t1" } };
const bob: Principal = { id: "bob", via: "test", claims: { tenant: "t2" } };

/** The repository of a server, as the server gives it to a call. */
function repositoryOf(server: ProcedureServer): RepositoryProvider {
  return {
    getStorage: (name) => server.getStorage(name),
    getPartitionStorage: (name, partition) => server.getPartitionStorage(name, partition),
    hasPartitions: (name) => server.hasPartitions(name),
    resolvePartition: (name, ctx, requested) => server.resolvePartition(name, ctx, requested),
    hasCollection: (name) => server.hasCollection(name),
  };
}

/** The procedures of the collection "notes" on a server with a storage for each partition. */
function host(resolve: PartitionResolver | null = byTenant, options: CollectionProceduresOptions = {}) {
  const server = new ProcedureServer({ autoRegister: false });
  const partitions = new Map<string, MapStorage>();
  if (resolve) {
    server.usePartitions("notes", {
      storageOf: (partition) => {
        let storage = partitions.get(partition);
        if (!storage) partitions.set(partition, (storage = new MapStorage()));
        return storage;
      },
      resolve,
    });
  }
  const procedures = createCollectionProcedures("notes", options);
  const bus = createEventBus();
  const repository = repositoryOf(server);
  const run = async (operation: string, input: unknown, principal?: Principal, repo: RepositoryProvider = repository): Promise<unknown> => {
    const procedure = procedures.find((candidate) => candidate.path[2] === operation)!;
    return outputValue(await invokeProcedure(procedure, input, { repository: repo, bus, ...(principal ? { principal } : {}) }), procedure.path);
  };
  return { run, partitions, server, bus, repository };
}

/** The error of a call. */
async function errorOf(call: Promise<unknown>): Promise<Error & { code?: string; reason?: string }> {
  try {
    await call;
  } catch (error) {
    return error as Error & { code?: string; reason?: string };
  }
  throw new Error("the call did not fail");
}

describe("the partitions of the collection procedures (CLI-17)", () => {
  it("serves two tenants from one surface with no cross-reads and no cross-writes", async () => {
    const { run, partitions } = host();
    await run("set", { id: "n1", value: { text: "ann's" } }, ann);
    await run("set", { id: "n1", value: { text: "bob's" } }, bob);
    await run("setBatch", { items: [{ id: "n2", value: 2 }] }, bob);
    expect(await run("get", { id: "n1" }, ann)).toEqual({ text: "ann's" });
    expect(await run("get", { id: "n1" }, bob)).toEqual({ text: "bob's" });
    expect(await run("getAll", {}, ann)).toEqual([{ text: "ann's" }]);
    expect(await run("ids", {}, bob)).toEqual(["n1", "n2"]);
    expect(await run("find", { selector: {} }, ann)).toEqual([{ id: "n1", value: { text: "ann's" } }]);
    expect(await run("changes", {}, ann)).toMatchObject({ full: true, changed: [{ id: "n1", value: { text: "ann's" } }] });
    expect(await run("size", {}, ann)).toBe(1);
    // A delete, a patch and a clear of one tenant leave the other tenant as it is
    expect(await run("patch", { id: "n1", fields: { text: "ann's 2" } }, ann)).toEqual({ found: true, value: { text: "ann's 2" } });
    await run("deleteBatch", { ids: ["n2"] }, bob);
    await run("clear", {}, ann);
    expect(await run("get", { id: "n1" }, bob)).toEqual({ text: "bob's" });
    expect([...partitions.keys()].sort()).toEqual(["t1", "t2"]);
  });

  it("takes the tenant from the principal: an input cannot name another tenant", async () => {
    const { run, partitions } = host();
    await run("set", { id: "n1", value: "bob's" }, bob);
    // Ann asks for "t2": the resolver puts it under her own tenant
    expect(await run("get", { id: "n1", partition: "t2" }, ann)).toBeUndefined();
    await run("set", { id: "x", value: 1, partition: "board:b1" }, ann);
    expect([...partitions.keys()].sort()).toEqual(["t1/board:b1", "t1/t2", "t2"]);
    expect(await run("get", { id: "x", partition: "board:b1" }, ann)).toBe(1);
    expect(await run("get", { id: "x" }, ann)).toBeUndefined();
  });

  it("refuses a call that the resolver refuses with FORBIDDEN, partition-not-allowed", async () => {
    const { run } = host();
    const error = await errorOf(run("get", { id: "n1" }));
    expect(error).toBeInstanceOf(InvocationError);
    expect(error.code).toBe("FORBIDDEN");
    expect(error.reason).toBe("partition-not-allowed");
  });

  it("refuses a partition of a collection without partitions, and a partition with other characters", async () => {
    const { run, server } = host(null);
    server.useStorage("notes", new MapStorage());
    const refused = await errorOf(run("get", { id: "n1", partition: "t1" }, ann));
    expect(refused.reason).toBe("partition-not-allowed");
    expect(refused.message).toMatch(/no partitions/);
    expect(await run("get", { id: "n1" }, ann)).toBeUndefined(); // without a partition, the collection works as before
    const partitioned = host();
    expect((await errorOf(partitioned.run("get", { id: "n1", partition: "a b" }, ann))).message).toMatch(/partition must have/);
    expect((await errorOf(partitioned.run("get", { id: "n1", partition: "" }, ann))).message).toMatch(/partition must have/);
    expect((await errorOf(partitioned.run("get", { id: "n1", partition: 7 }, ann))).message).toMatch(/partition must have/);
    expect((await errorOf(partitioned.run("get", { partition: "ok" }, ann))).message).toMatch(/id/);
  });

  it("refuses a partition of a resolver that is not valid, and a repository without partition storages", async () => {
    const { run } = host(() => "bad partition");
    expect((await errorOf(run("get", { id: "n1" }, ann))).message).toMatch(/not valid/);
    const plain = host();
    const { getPartitionStorage: _omitted, ...withoutStorages } = plain.repository;
    expect((await errorOf(plain.run("get", { id: "n1" }, ann, withoutStorages))).message).toMatch(/no partitions/);
    const withoutPartitions: RepositoryProvider = { getStorage: <T>() => new MapStorage() as unknown as CollectionStorage<T>, hasCollection: () => true };
    expect((await errorOf(plain.run("get", { id: "n1", partition: "x" }, ann, withoutPartitions))).reason).toBe("partition-not-allowed");
    const server = new ProcedureServer({ autoRegister: false });
    expect(() => server.getPartitionStorage("notes", "t1")).toThrow(/no partitions/);
    expect(() => server.resolvePartition("notes", {} as never, undefined)).toThrow(/no partitions/);
    expect(server.hasPartitions("notes")).toBe(false);
  });

  it("uses the storage of the collection when the resolver gives no partition", async () => {
    const shared = new MapStorage();
    const { run, server } = host(() => undefined);
    server.useStorage("notes", shared);
    await run("set", { id: "n1", value: 1 }, ann);
    expect(shared.data.get("n1")).toBe(1);
    expect(server.hasCollection("notes")).toBe(true);
    expect(server.hasCollection("other")).toBe(false);
  });

  it("publishes the change events of a partition to collections.<name>.<partition>", async () => {
    const { run, bus } = host();
    const events: string[] = [];
    for (const topic of ["collections.notes", "collections.notes.t1", "collections.notes.t2"]) {
      bus.on<CollectionChangeEvent>(topic, () => void events.push(topic));
    }
    await run("set", { id: "n1", value: 1 }, ann);
    await run("delete", { id: "n1" }, bob);
    await new Promise((resolve) => setTimeout(resolve, 20));
    // One event in the topic of each partition, and none in the topic of the collection
    expect(events).toEqual(["collections.notes.t1", "collections.notes.t2"]);
    expect(collectionChangeTopic("notes")).toBe("collections.notes");
    expect(collectionChangeTopic("notes", "t1/board:b1")).toBe("collections.notes.t1/board:b1");
  });

  it("gives the topic hook the partition", async () => {
    const seen: Array<string | undefined> = [];
    const { run } = host(byTenant, { changeEvents: { topic: (name, _ctx, partition) => (seen.push(partition), `custom.${name}`) } });
    await run("set", { id: "n1", value: 1 }, ann);
    expect(seen).toEqual(["t1"]);
  });

  it("reads the collection and the partition of a topic", () => {
    expect(collectionTopicPartition("collections.notes")).toEqual({ collection: "notes", partition: undefined });
    expect(collectionTopicPartition("collections.notes.t1/board:b1")).toEqual({ collection: "notes", partition: "t1/board:b1" });
    expect(collectionTopicPartition("collections.notes.a.b")).toEqual({ collection: "notes", partition: "a.b" });
    expect(collectionTopicPartition("orders.created")).toBeUndefined();
    expect(PARTITION_PATTERN.test("member:b1:u1")).toBe(true);
    expect(PARTITION_PATTERN.test("x".repeat(257))).toBe(false);
  });
});

describe("the subscriptions of a partitioned collection (CLI-17)", () => {
  /** A subscription of a principal, on the bus and with the repository of the host. */
  async function subscribe(h: ReturnType<typeof host>, topics: string[], principal?: Principal) {
    const publisher = new EventPublisher({ bus: h.bus, topics: ["collections.*"] });
    const controller = new AbortController();
    const output = await invokeProcedure(publisher.procedure, { topics }, { bus: h.bus, repository: h.repository, signal: controller.signal, ...(principal ? { principal } : {}) });
    if (output.kind !== "stream") throw new Error("events.subscribe gives a stream");
    const items = output.items as AsyncGenerator<EventItem, void, undefined>;
    const first = (await items.next()).value as EventItem;
    const received: Array<Extract<EventItem, { type: "event" }>> = [];
    void (async () => {
      for await (const item of items) if (item.type === "event") received.push(item);
    })().catch(() => undefined);
    return { first, received, stop: () => controller.abort() };
  }
  const settle = () => new Promise((resolve) => setTimeout(resolve, 30));

  it("gives a subscriber of collections.<name> the events of its own tenant only, under the topic that it named", async () => {
    const h = host();
    const sub = await subscribe(h, ["collections.notes"], ann);
    expect(sub.first).toEqual({ type: "subscribed", topics: ["collections.notes"] });
    await h.run("set", { id: "b", value: 1 }, bob);
    await h.run("set", { id: "a", value: 1 }, ann);
    await settle();
    expect(sub.received.map((item) => item.topic)).toEqual(["collections.notes"]);
    sub.stop();
  });

  it("puts a partition that a subscriber names under its own tenant: it cannot reach another tenant", async () => {
    const h = host();
    const sub = await subscribe(h, ["collections.notes.t2"], ann);
    expect(sub.first).toEqual({ type: "subscribed", topics: ["collections.notes.t2"] });
    await h.run("set", { id: "b", value: 1 }, bob); // tenant t2: not for Ann
    await settle();
    expect(sub.received).toHaveLength(0);
    await h.run("set", { id: "a", value: 1, partition: "t2" }, ann); // partition t1/t2
    await settle();
    expect(sub.received).toHaveLength(1);
    sub.stop();
  });

  it("refuses a subscriber that the resolver refuses", async () => {
    const h = host();
    const error = await errorOf(subscribe(h, ["collections.notes"]));
    expect(error.code).toBe("FORBIDDEN");
    expect(error.reason).toBe("partition-not-allowed");
  });

  it("refuses a topic with a partition of a collection without partitions, and keeps its plain topic", async () => {
    const h = host(null);
    h.server.useStorage("notes", new MapStorage());
    const error = await errorOf(subscribe(h, ["collections.notes.t2"], ann));
    expect(error.code).toBe("FORBIDDEN");
    expect(error.reason).toBe("partition-not-allowed");
    const plain = await subscribe(h, ["collections.notes"], ann);
    expect(plain.first).toEqual({ type: "subscribed", topics: ["collections.notes"] });
    plain.stop();
  });

  it("refuses a topic with a partition when the call has no repository", async () => {
    const bus = createEventBus();
    const publisher = new EventPublisher({ bus, topics: ["collections.*"] });
    const error = await errorOf(invokeProcedure(publisher.procedure, { topics: ["collections.notes.t2"] }, { bus, principal: ann }));
    expect(error.reason).toBe("partition-not-allowed");
  });

  it("keeps the plain topic of a collection without partitions whose name has a dot", async () => {
    const h = host(null);
    h.server.useStorage("a.b", new MapStorage());
    const sub = await subscribe(h, ["collections.a.b"], ann);
    expect(sub.first).toEqual({ type: "subscribed", topics: ["collections.a.b"] });
    h.bus.emit("collections.a.b", { changed: ["x"], deleted: [] });
    await settle();
    expect(sub.received.map((item) => item.topic)).toEqual(["collections.a.b"]);
    sub.stop();
  });

  it("refuses partitions for a collection whose name has a dot", () => {
    const server = new ProcedureServer({ autoRegister: false });
    expect(() => server.usePartitions("a.b", { storageOf: () => new MapStorage(), resolve: byTenant })).toThrow(/dot/);
    expect(server.hasPartitions("a.b")).toBe(false);
  });
});

