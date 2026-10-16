/**
 * The queue of `HybridStorage` and the store that keeps it (roadmap R28).
 *
 * A write that waits for the remote is a `QueuedOperation`. The storage keeps the queue in
 * memory and writes each change to a `QueueStore` before it acknowledges the write. A new storage
 * with the same store loads the queue again, so a write that waits survives a restart.
 *
 * - `MemoryQueueStore` keeps the queue in memory. It is the default. A new storage that gets the
 *   same instance loads its queue, so the tests can simulate a restart.
 * - `FileQueueStore` keeps the queue in a JSON Lines file. It is in `@procedures/store/file-queue`,
 *   because it uses `node:fs`. The root of the package stays usable in a browser.
 * - `IndexedDbQueueStore` keeps the queue in IndexedDB, for a browser (roadmap R45). It is in
 *   `@procedures/store/indexeddb`, and it implements the four methods of `QueueStore` on one
 *   object store.
 */

/** A write that waits in the queue for the remote. Each field is JSON. */
export interface QueuedOperation {
  /** The kind of the write. */
  type: "set" | "delete" | "setBatch" | "deleteBatch" | "clear";
  /**
   * The arguments of the write: `{ id, value }` for set, `{ id }` for delete,
   * `{ items: [[id, value]] }` for setBatch, `{ ids }` for deleteBatch, `{}` for clear.
   */
  data: unknown;
  /** The time of the write, in milliseconds since 1970. */
  timestamp: number;
  /**
   * The remote version that the write changed, for each id with a known version. `null`: the
   * remote had no item. Only a storage with `versionOf` writes it. A conflict test after a restart
   * reads it.
   */
  base?: Array<[string, string | null]>;
}

/**
 * The store that keeps the queue of a `HybridStorage` (roadmap R28). The storage calls the
 * methods one at a time, in the order of the changes.
 */
export interface QueueStore {
  /** This method gives the operations that the store holds, the oldest first. */
  load(): Promise<QueuedOperation[]>;
  /** This method adds an operation at the end. */
  append(operation: QueuedOperation): Promise<void>;
  /** This method puts these operations in the place of all operations. */
  replace(operations: QueuedOperation[]): Promise<void>;
  /** This method removes all operations. */
  clear(): Promise<void>;
}

/** A queue store in memory: the default. Its queue lives as long as the instance. */
export class MemoryQueueStore implements QueueStore {
  private operations: QueuedOperation[] = [];

  load(): Promise<QueuedOperation[]> {
    return Promise.resolve(this.operations.slice());
  }

  append(operation: QueuedOperation): Promise<void> {
    this.operations.push(operation);
    return Promise.resolve();
  }

  replace(operations: QueuedOperation[]): Promise<void> {
    this.operations = operations.slice();
    return Promise.resolve();
  }

  clear(): Promise<void> {
    this.operations = [];
    return Promise.resolve();
  }

  /** The number of operations that the store holds. */
  get size(): number {
    return this.operations.length;
  }
}

/** The ids that an operation changes ("*" for clear). */
export function idsOf(op: QueuedOperation): string[] {
  const data = op.data as { id?: string; ids?: string[]; items?: Array<[string, unknown]> };
  switch (op.type) {
    case "set":
    case "delete":
      return data.id === undefined ? [] : [data.id];
    case "setBatch":
      return (data.items ?? []).map(([id]) => id);
    case "deleteBatch":
      return data.ids ?? [];
    case "clear":
      return ["*"];
  }
}

/**
 * The operation without the id, or undefined when nothing stays. A clear cannot lose an id: it
 * stays as it is.
 */
export function withoutId(op: QueuedOperation, id: string): QueuedOperation | undefined {
  const data = op.data as { id?: string; ids?: string[]; items?: Array<[string, unknown]> };
  switch (op.type) {
    case "set":
    case "delete":
      return data.id === id ? undefined : op;
    case "setBatch": {
      const items = (data.items ?? []).filter(([itemId]) => itemId !== id);
      return items.length === 0 ? undefined : { ...op, data: { items } };
    }
    case "deleteBatch": {
      const ids = (data.ids ?? []).filter((other) => other !== id);
      return ids.length === 0 ? undefined : { ...op, data: { ids } };
    }
    case "clear":
      return op;
  }
}

/** True when a value has the shape of a queued operation. A loaded file can hold anything. */
export function isQueuedOperation(value: unknown): value is QueuedOperation {
  if (typeof value !== "object" || value === null) return false;
  const { type, data, timestamp } = value as Partial<QueuedOperation>;
  return (
    (type === "set" || type === "delete" || type === "setBatch" || type === "deleteBatch" || type === "clear") &&
    typeof data === "object" && data !== null &&
    typeof timestamp === "number"
  );
}
