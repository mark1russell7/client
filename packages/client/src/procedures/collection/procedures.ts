/**
 * Collection Procedures
 *
 * Procedure definitions for collection CRUD operations.
 * These procedures delegate to storage backends via the repository pattern.
 */

import { defineProcedure } from "../define.js";
import type { ProcedureContext, AnyProcedure } from "../types.js";
import {
  getInputSchema,
  getOutputSchema,
  setInputSchema,
  setOutputSchema,
  deleteInputSchema,
  deleteOutputSchema,
  hasInputSchema,
  hasOutputSchema,
  getAllInputSchema,
  getAllOutputSchema,
  entriesInputSchema,
  entriesOutputSchema,
  idsInputSchema,
  idsOutputSchema,
  changesInputSchema,
  changesOutputSchema,
  sizeInputSchema,
  sizeOutputSchema,
  clearInputSchema,
  clearOutputSchema,
  getBatchInputSchema,
  getBatchOutputSchema,
  setBatchInputSchema,
  setBatchOutputSchema,
  deleteBatchInputSchema,
  deleteBatchOutputSchema,
  findInputSchemaOf,
  findOutputSchema,
  patchInputSchema,
  patchOutputSchema,
  type FindInput,
  type PatchInput,
  type GetInput,
  type GetFoundOutput,
  type SetInput,
  type DeleteInput,
  type HasInput,
  type GetAllInput,
  type EntriesInput,
  type IdsInput,
  type ChangesInput,
  type ChangesOutput,
  type SizeInput,
  type ClearInput,
  type GetBatchInput,
  type SetBatchInput,
  type DeleteBatchInput,
} from "./schemas.js";
import { DEFAULT_FIND_LIMIT, applyPatch, queryEntries, type StoragePatch, type StorageQueryOptions, type StorageQueryPolicy } from "./query.js";
import type { CollectionStorage, StorageWriteOptions } from "./storage.js";
import { collectionChangeTopic, startChangeChain, writeWithChangeEvent } from "./changes.js";
import { partitionOfCall, storageOfCall, withPartition, type PartitionInput, type PartitionResolver } from "./partition.js";

// =============================================================================
// Handler Factory
// =============================================================================

/**
 * Extract collection name from procedure path.
 * Path format: ['collections', collectionName, operation]
 */
function getCollectionFromPath(path: string[]): string {
  if (path.length < 3 || path[0] !== "collections") {
    throw new Error(`Invalid collection procedure path: ${path.join(".")}`);
  }
  return path[1]!;
}

/** The options of a query from the input of `find`. */
function queryOptionsOf(input: FindInput, policy: StorageQueryPolicy): StorageQueryOptions {
  // A find without a limit gets the maxLimit of the policy (roadmap CLI-14)
  const limit = input.limit ?? (Number.isFinite(policy.maxLimit) ? policy.maxLimit : undefined);
  return {
    ...(input.sort !== undefined && { sort: input.sort }),
    ...(input.skip !== undefined && { skip: input.skip }),
    ...(limit !== undefined && { limit }),
  };
}

/** The options of the change events of the collection procedures (roadmap CLI-15). */
export interface CollectionChangeEventsOptions {
  /**
   * The topic of the change events of a call, or undefined for no event. It gets the partition of
   * the call (roadmap CLI-17).
   * @default `collectionChangeTopic(name, partition)`: `collections.<name>`, or `collections.<name>.<partition>`
   */
  topic?: ((collection: string, ctx: ProcedureContext, partition: string | undefined) => string | undefined) | undefined;
  /**
   * True: the events also carry the values of the changed items. Each row `{ id, value }` passes
   * the output filter of the host (`admitItem`) for each subscriber, and a refused row stays out of
   * that event: its id goes to `withheld`. Without it, the events carry only the ids and the
   * versions, and a subscriber reads the values with `changes`.
   * @default false
   */
  values?: boolean | undefined;
}

/** The options of the collection procedures. */
export interface CollectionProceduresOptions {
  /**
   * The query policy of `find`: the operators, and the limits of a selector and of the result. A
   * selector or a limit that the policy does not permit is a `VALIDATION_ERROR`. The policy also
   * goes to `query()` of the storage. `$regex` is off unless the policy has it in `operators`.
   * @default DEFAULT_QUERY_POLICY, with `maxLimit` DEFAULT_FIND_LIMIT (1000)
   */
  queryPolicy?: StorageQueryPolicy | undefined;
  /**
   * The change events of the writes (roadmap CLI-15). Each write publishes a
   * `CollectionChangeEvent` on the bus of its context, while a subscriber listens to the topic.
   * The event has the ids and the versions, and the values only with `values`. False: the
   * procedures publish no event.
   * @default true, with the topic `collections.<name>` and no values
   */
  changeEvents?: boolean | CollectionChangeEventsOptions | undefined;
  /**
   * The partitions of the collection (roadmap CLI-17): the resolver of the partition of each call.
   * It reads the tenant from `ctx.principal`, and the partition that the input asks for. The
   * procedures then use the storage of that partition (`getPartitionStorage` of the repository), and
   * the change events go to `collections.<name>.<partition>`. Without it, an input with a partition
   * is a `VALIDATION_ERROR`.
   */
  partition?: PartitionResolver | undefined;
}

/** The write options of an input with an origin. */
function writeOptionsOf(input: { origin?: string }): StorageWriteOptions | undefined {
  return input.origin === undefined ? undefined : { origin: input.origin };
}

/**
 * The patches of a storage without `patch()` that run, for each id. A patch of an id waits for the
 * patch before it, so two patches of one process keep each field. A write of another writer
 * between the read and the write of a patch is lost: give the storage a `patch()` for one step.
 */
const PATCHES = new WeakMap<object, Map<string, Promise<unknown>>>();

/** This function patches an item of a storage without `patch()`: a read, a merge and a write. */
function patchInParts(storage: CollectionStorage<unknown>, id: string, fields: StoragePatch, options?: StorageWriteOptions): Promise<unknown> {
  let running = PATCHES.get(storage);
  if (!running) {
    running = new Map();
    PATCHES.set(storage, running);
  }
  const queue = running;
  const before = queue.get(id) ?? Promise.resolve();
  const patch = before.then(async () => {
    const current = await storage.get(id);
    if (current === undefined) return undefined;
    const next = applyPatch(current, fields);
    await storage.set(id, next, options);
    return next;
  });
  const settled = patch.then(
    () => undefined,
    () => undefined,
  );
  queue.set(id, settled);
  void settled.then(() => {
    if (queue.get(id) === settled) queue.delete(id);
  });
  return patch;
}

// =============================================================================
// Collection Procedure Definitions
// =============================================================================

/**
 * Create collection procedures for a specific collection name.
 *
 * @param collectionName - Name of the collection
 * @param options - The query policy of `find`
 * @returns Array of procedure definitions
 *
 * @example
 * ```typescript
 * const userProcedures = createCollectionProcedures('users');
 * registry.registerAll(userProcedures);
 * ```
 */
export function createCollectionProcedures(collectionName: string, options: CollectionProceduresOptions = {}): AnyProcedure[] {
  const basePath = ["collections", collectionName];
  // A find of a caller gets a limit: DEFAULT_FIND_LIMIT, unless the policy gives its own maxLimit
  const queryPolicy: StorageQueryPolicy = { ...options.queryPolicy, maxLimit: options.queryPolicy?.maxLimit ?? DEFAULT_FIND_LIMIT };
  // Each collection is a resource of its own (CAPABILITIES-2026-10): a capability can permit one
  const resource = `collection:${collectionName}`;
  // The topic of the change events of a call (roadmap CLI-15), with its partition (roadmap CLI-17)
  const events = options.changeEvents ?? true;
  const topicRule: ((collection: string, ctx: ProcedureContext, partition: string | undefined) => string | undefined) | undefined =
    events === false ? undefined : (events !== true && events.topic) || ((name: string, _ctx: ProcedureContext, partition: string | undefined) => collectionChangeTopic(name, partition));
  const topicOf = (ctx: ProcedureContext, partition: string | undefined): string | undefined => topicRule?.(collectionName, ctx, partition);
  const withValues = events !== false && events !== true && events.values === true;
  /** A write, and then its change event on the bus of the context. */
  const changing = <R>(ctx: ProcedureContext, partition: string | undefined, storage: CollectionStorage<unknown>, ids: readonly string[] | "*", origin: string | undefined, write: () => Promise<R>): Promise<R> =>
    writeWithChangeEvent(ctx.bus, storage, topicRule ? topicOf(ctx, partition) : undefined, ids, origin, write, withValues);
  // The partitions of the collection (roadmap CLI-17)
  const resolvePartition = options.partition;
  const partitioned = resolvePartition !== undefined;
  /** The partition and the storage of a call. */
  const storageOf = async (input: PartitionInput, ctx: ProcedureContext): Promise<{ storage: CollectionStorage<unknown>; partition: string | undefined }> => {
    const partition = await partitionOfCall(resolvePartition, ctx, input.partition);
    return { storage: storageOfCall<unknown>(ctx, getCollectionFromPath(ctx.path), partition), partition };
  };

  return [
    // Get
    defineProcedure({
      path: [...basePath, "get"],
      input: withPartition(getInputSchema, partitioned),
      output: getOutputSchema,
      metadata: {
        effects: { reads: [resource], writes: [] },
        description: `Get item from ${collectionName} by ID`,
        tags: ["collections", collectionName, "read"],
      },
      handler: async (input: GetInput & PartitionInput, ctx: ProcedureContext) => {
        const { storage } = await storageOf(input, ctx);
        const value = await storage.get(input.id);
        if (input.found !== true) return value;
        // The output with `found` keeps a stored null apart from a missing id, in one call
        const output: GetFoundOutput = value === undefined ? { found: false } : { found: true, value };
        return output;
      },
    }),

    // Set
    defineProcedure({
      path: [...basePath, "set"],
      input: withPartition(setInputSchema, partitioned),
      output: setOutputSchema,
      metadata: {
        effects: { reads: [resource], writes: [resource], idempotent: true },
        description: `Set item in ${collectionName}`,
        tags: ["collections", collectionName, "write"],
      },
      handler: async (input: SetInput & PartitionInput, ctx: ProcedureContext) => {
        const { storage, partition } = await storageOf(input, ctx);
        await changing(ctx, partition, storage, [input.id], input.origin, () => storage.set(input.id, input.value, writeOptionsOf(input)));
      },
    }),

    // Delete
    defineProcedure({
      path: [...basePath, "delete"],
      input: withPartition(deleteInputSchema, partitioned),
      output: deleteOutputSchema,
      metadata: {
        effects: { reads: [resource], writes: [resource], idempotent: true },
        description: `Delete item from ${collectionName}`,
        tags: ["collections", collectionName, "write"],
      },
      handler: async (input: DeleteInput & PartitionInput, ctx: ProcedureContext) => {
        const { storage, partition } = await storageOf(input, ctx);
        return changing(ctx, partition, storage, [input.id], input.origin, () => storage.delete(input.id, writeOptionsOf(input)));
      },
    }),

    // Has
    defineProcedure({
      path: [...basePath, "has"],
      input: withPartition(hasInputSchema, partitioned),
      output: hasOutputSchema,
      metadata: {
        effects: { reads: [resource], writes: [] },
        description: `Check if item exists in ${collectionName}`,
        tags: ["collections", collectionName, "read"],
      },
      handler: async (input: HasInput & PartitionInput, ctx: ProcedureContext) => {
        const { storage } = await storageOf(input, ctx);
        return storage.has(input.id);
      },
    }),

    // GetAll
    defineProcedure({
      path: [...basePath, "getAll"],
      input: withPartition(getAllInputSchema, partitioned),
      output: getAllOutputSchema,
      metadata: {
        effects: { reads: [resource], writes: [] },
        description: `Get all items from ${collectionName}`,
        tags: ["collections", collectionName, "read"],
      },
      handler: async (input: GetAllInput & PartitionInput, ctx: ProcedureContext) => {
        const { storage } = await storageOf(input, ctx);
        return storage.getAll();
      },
    }),

    // Entries: each item with its id, for a sync (roadmap R2)
    defineProcedure({
      path: [...basePath, "entries"],
      input: withPartition(entriesInputSchema, partitioned),
      output: entriesOutputSchema,
      metadata: {
        effects: { reads: [resource], writes: [] },
        description: `Get all items of ${collectionName} with their ids`,
        tags: ["collections", collectionName, "read"],
      },
      handler: async (input: EntriesInput & PartitionInput, ctx: ProcedureContext) => {
        const { storage } = await storageOf(input, ctx);
        if (!storage.getEntries) {
          throw new Error(`The storage of ${collectionName} cannot give the ids of its items`);
        }
        return (await storage.getEntries()).map(([id, value]) => ({ id, value }));
      },
    }),

    // Ids: the ids of the items without the values, for a full sync
    defineProcedure({
      path: [...basePath, "ids"],
      input: withPartition(idsInputSchema, partitioned),
      output: idsOutputSchema,
      metadata: {
        effects: { reads: [resource], writes: [] },
        description: `Get the ids of the items of ${collectionName}, without the values`,
        tags: ["collections", collectionName, "read"],
      },
      handler: async (input: IdsInput & PartitionInput, ctx: ProcedureContext) => {
        const { storage } = await storageOf(input, ctx);
        if (storage.getIds) return storage.getIds();
        // A storage without getIds() gives its entries: the values stay on the server
        if (storage.getEntries) return (await storage.getEntries()).map(([id]) => id);
        throw new Error(`The storage of ${collectionName} cannot give the ids of its items`);
      },
    }),

    // Changes: the items that changed after a version, for a delta sync (roadmap R28)
    defineProcedure({
      path: [...basePath, "changes"],
      input: withPartition(changesInputSchema, partitioned),
      output: changesOutputSchema,
      metadata: {
        effects: { reads: [resource], writes: [] },
        description: `Get the items of ${collectionName} that changed after a version`,
        tags: ["collections", collectionName, "read"],
      },
      handler: async (input: ChangesInput & PartitionInput, ctx: ProcedureContext): Promise<ChangesOutput> => {
        const { storage, partition } = await storageOf(input, ctx);
        if (storage.getChangesSince) {
          const changes = await storage.getChangesSince(input.since);
          // The chain of the change events starts at this version: the caller then applies the
          // next event without a read (roadmap CLI-15)
          if (topicRule) startChangeChain(ctx.bus, storage, topicOf(ctx, partition), changes.version);
          return {
            version: changes.version,
            full: changes.full,
            changed: changes.changed.map(([id, value]) => ({ id, value })),
            deleted: changes.deleted,
          };
        }
        // A storage without a change log gives all its items. The empty version asks for all
        // items again at the next call.
        if (storage.getEntries) {
          const entries = await storage.getEntries();
          return { version: "", full: true, changed: entries.map(([id, value]) => ({ id, value })), deleted: [] };
        }
        throw new Error(`The storage of ${collectionName} cannot give its changes or the ids of its items`);
      },
    }),

    // Find: the items that match a JSON selector, with an order, a skip and a limit (roadmap CLI-14)
    defineProcedure({
      path: [...basePath, "find"],
      input: withPartition(findInputSchemaOf(queryPolicy), partitioned),
      output: findOutputSchema,
      metadata: {
        effects: { reads: [resource], writes: [] },
        description: `Find the items of ${collectionName} that match a selector, with their ids, an order, a skip and a limit`,
        tags: ["collections", collectionName, "read", "query"],
      },
      handler: async (input: FindInput & PartitionInput, ctx: ProcedureContext) => {
        const { storage } = await storageOf(input, ctx);
        const selector = input.selector ?? {};
        const query = queryOptionsOf(input, queryPolicy);
        // The storage runs the selector itself when it can: a database does not read each item. It
        // gets the policy of the host, so it permits what the procedure permits.
        if (storage.query) return (await storage.query(selector, query, queryPolicy)).map(([id, value]) => ({ id, value }));
        if (!storage.getEntries) {
          throw new Error(`The storage of ${collectionName} cannot run a selector or give the ids of its items`);
        }
        return queryEntries(await storage.getEntries(), selector, query, queryPolicy).map(([id, value]) => ({ id, value }));
      },
    }),

    // Patch: merge fields into one item, a JSON Merge Patch (roadmap CLI-14)
    defineProcedure({
      path: [...basePath, "patch"],
      input: withPartition(patchInputSchema, partitioned),
      output: patchOutputSchema,
      metadata: {
        effects: { reads: [resource], writes: [resource], idempotent: true },
        description: `Merge fields into one item of ${collectionName}: a JSON Merge Patch, or the operations $set and $unset`,
        tags: ["collections", collectionName, "write"],
      },
      handler: async (input: PatchInput & PartitionInput, ctx: ProcedureContext) => {
        const { storage, partition } = await storageOf(input, ctx);
        const write = writeOptionsOf(input);
        const value = await changing(ctx, partition, storage, [input.id], input.origin, () =>
          storage.patch ? storage.patch(input.id, input.fields, write) : patchInParts(storage, input.id, input.fields, write),
        );
        const output: GetFoundOutput = value === undefined ? { found: false } : { found: true, value };
        return output;
      },
    }),

    // Size
    defineProcedure({
      path: [...basePath, "size"],
      input: withPartition(sizeInputSchema, partitioned),
      output: sizeOutputSchema,
      metadata: {
        effects: { reads: [resource], writes: [] },
        description: `Get number of items in ${collectionName}`,
        tags: ["collections", collectionName, "read"],
      },
      handler: async (input: SizeInput & PartitionInput, ctx: ProcedureContext) => {
        const { storage } = await storageOf(input, ctx);
        return storage.size();
      },
    }),

    // Clear
    defineProcedure({
      path: [...basePath, "clear"],
      input: withPartition(clearInputSchema, partitioned),
      output: clearOutputSchema,
      metadata: {
        effects: { reads: [resource], writes: [resource], idempotent: true },
        description: `Clear all items from ${collectionName}`,
        tags: ["collections", collectionName, "write"],
      },
      handler: async (input: ClearInput & PartitionInput, ctx: ProcedureContext) => {
        const { storage, partition } = await storageOf(input, ctx);
        await changing(ctx, partition, storage, "*", input.origin, () => storage.clear(writeOptionsOf(input)));
      },
    }),

    // GetBatch
    defineProcedure({
      path: [...basePath, "getBatch"],
      input: withPartition(getBatchInputSchema, partitioned),
      output: getBatchOutputSchema,
      metadata: {
        effects: { reads: [resource], writes: [] },
        description: `Get multiple items from ${collectionName}`,
        tags: ["collections", collectionName, "read", "batch"],
      },
      handler: async (input: GetBatchInput & PartitionInput, ctx: ProcedureContext) => {
        const { storage } = await storageOf(input, ctx);
        const result = await storage.getBatch(input.ids);
        // Convert Map to plain object
        return Object.fromEntries(result);
      },
    }),

    // SetBatch
    defineProcedure({
      path: [...basePath, "setBatch"],
      input: withPartition(setBatchInputSchema, partitioned),
      output: setBatchOutputSchema,
      metadata: {
        effects: { reads: [resource], writes: [resource], idempotent: true },
        description: `Set multiple items in ${collectionName}`,
        tags: ["collections", collectionName, "write", "batch"],
      },
      handler: async (input: SetBatchInput & PartitionInput, ctx: ProcedureContext) => {
        const { storage, partition } = await storageOf(input, ctx);
        const items: Array<[string, unknown]> = input.items.map((item) => [
          item.id,
          item.value,
        ]);
        await changing(ctx, partition, storage, items.map(([id]) => id), input.origin, () => storage.setBatch(items, writeOptionsOf(input)));
      },
    }),

    // DeleteBatch
    defineProcedure({
      path: [...basePath, "deleteBatch"],
      input: withPartition(deleteBatchInputSchema, partitioned),
      output: deleteBatchOutputSchema,
      metadata: {
        effects: { reads: [resource], writes: [resource], idempotent: true },
        description: `Delete multiple items from ${collectionName}`,
        tags: ["collections", collectionName, "write", "batch"],
      },
      handler: async (input: DeleteBatchInput & PartitionInput, ctx: ProcedureContext) => {
        const { storage, partition } = await storageOf(input, ctx);
        return changing(ctx, partition, storage, input.ids, input.origin, () => storage.deleteBatch(input.ids, writeOptionsOf(input)));
      },
    }),
  ];
}
