/**
 * The contract of `CollectionStorage` (the suite of `@procedures/collections/testing`) for the
 * storages of this package: `ApiStorage` against the collection procedures of the core, and
 * `HybridStorage` in each mode with an in-memory remote, also with a queue in IndexedDB
 * (`fake-indexeddb`). No IndexedDB class of this package is a `CollectionStorage`: the IndexedDB
 * stores keep programs and queues.
 */

import { describe, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { InMemoryStorage, type CollectionStorage } from "@procedures/collections";
import { describeCollectionStorageContract, type ContractItem } from "@procedures/collections/testing";
import { Client, LocalTransport, createCollectionProcedures, invokeProcedure, ms, outputValue, type RepositoryProvider } from "@procedures/client";
import { ApiStorage } from "./api.js";
import { HybridStorage, type HybridMode } from "./hybrid.js";
import { IndexedDbQueueStore } from "../indexeddb/queue-store.js";

/** An ApiStorage whose server has the core collection procedures over a storage in memory. */
function apiStorage(storage: InMemoryStorage<ContractItem>): ApiStorage<ContractItem> {
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

// The procedure collections.<name>.get answers null for a missing id, so ApiStorage.get gives
// undefined for a stored null: the wire does not keep the difference (nullValues: false).
describeCollectionStorageContract(
  "ApiStorage (the collection procedures of the core)",
  {
    create: () => apiStorage(new InMemoryStorage<ContractItem>()),
    createWithMaxTombstones: (max) => apiStorage(new InMemoryStorage<ContractItem>({ maxTombstones: max })),
    nullValues: false,
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
