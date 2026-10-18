/**
 * The contract of `CollectionStorage` (the suite of `@procedures/collections/testing`) for the
 * storages of this package: `ApiStorage` against the collection procedures of the core, and
 * `HybridStorage` in each mode with an in-memory remote, also with a queue in IndexedDB
 * (`fake-indexeddb`). No IndexedDB class of this package is a `CollectionStorage`: the IndexedDB
 * stores keep programs and queues.
 *
 * `ApiStorage` also runs against a server storage without `query()` and `patch()`. Then the core
 * procedures `find` and `patch` run the selector and the merge themselves, with the copy of the
 * query language in `@procedures/client`. The cases of `query()` compare each result with
 * `queryEntries()` of `@procedures/collections`, so the two copies of the language agree.
 */

import { describe, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { InMemoryStorage, type CollectionStorage } from "@procedures/collections";
import { describeCollectionStorageContract, type ContractItem } from "@procedures/collections/testing";
import { Client, LocalTransport, createCollectionProcedures, invokeProcedure, ms, outputValue, type RepositoryProvider } from "@procedures/client";
import { ApiStorage } from "./api.js";
import { HybridStorage, type HybridMode } from "./hybrid.js";
import { IndexedDbQueueStore } from "../indexeddb/queue-store.js";

/** An ApiStorage whose server has the core collection procedures over a storage. */
function apiStorage(storage: CollectionStorage<ContractItem>): ApiStorage<ContractItem> {
  const repository = {
    getStorage: <U>() => storage as unknown as CollectionStorage<U>,
    hasCollection: () => true,
  } as unknown as RepositoryProvider;
  const handlers: Record<string, (payload: unknown) => Promise<unknown>> = {};
  for (const procedure of createCollectionProcedures("items")) {
    handlers[procedure.path.join(".")] = async (payload) => outputValue(await invokeProcedure(procedure, payload, { repository }), procedure.path);
  }
  return new ApiStorage<ContractItem>(new Client(new LocalTransport({ handlers })), { collection: "items", retry: false });
}

// ApiStorage asks the procedure collections.<name>.get for { found, value }: a stored null reads
// back as null, and a missing id as undefined
describeCollectionStorageContract(
  "ApiStorage (the collection procedures of the core)",
  {
    create: () => apiStorage(new InMemoryStorage<ContractItem>()),
    createWithMaxTombstones: (max) => apiStorage(new InMemoryStorage<ContractItem>({ maxTombstones: max })),
  },
  { describe, it },
);

/** A storage in memory without `query()`, `patch()` and `observe()`, as a storage of another package. */
function withoutQuery(storage: InMemoryStorage<ContractItem>): CollectionStorage<ContractItem> {
  return {
    get: (id) => storage.get(id),
    getAll: () => storage.getAll(),
    getEntries: () => storage.getEntries(),
    getIds: () => storage.getIds(),
    getChangesSince: (since) => storage.getChangesSince(since),
    find: (predicate) => storage.find(predicate),
    has: (id) => storage.has(id),
    size: () => storage.size(),
    set: (id, value) => storage.set(id, value),
    delete: (id) => storage.delete(id),
    clear: () => storage.clear(),
    setBatch: (items) => storage.setBatch(items),
    deleteBatch: (ids) => storage.deleteBatch(ids),
    getBatch: (ids) => storage.getBatch(ids),
    close: () => storage.close(),
  };
}

// The procedures find and patch of the core run the selector and the merge themselves
describeCollectionStorageContract(
  "ApiStorage (a server storage without query() and patch())",
  {
    create: () => apiStorage(withoutQuery(new InMemoryStorage<ContractItem>())),
    createWithMaxTombstones: (max) => apiStorage(withoutQuery(new InMemoryStorage<ContractItem>({ maxTombstones: max }))),
  },
  { describe, it },
);

const modes: HybridMode[] = ["write-through", "write-back", "local-only", "remote-only"];
for (const mode of modes) {
  describeCollectionStorageContract(
    `HybridStorage (${mode}, a remote in memory)`,
    { create: () => new HybridStorage<ContractItem>(new InMemoryStorage<ContractItem>(), { mode, syncInterval: ms(0) }) },
    { describe, it },
  );
}

describeCollectionStorageContract(
  "HybridStorage (write-back, a queue in IndexedDB)",
  {
    create: () =>
      new HybridStorage<ContractItem>(new InMemoryStorage<ContractItem>(), {
        mode: "write-back",
        syncInterval: ms(0),
        queueStore: new IndexedDbQueueStore("contract-queue", { indexedDB: new IDBFactory() }),
      }),
  },
  { describe, it },
);
