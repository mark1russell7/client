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
import { DEFAULT_FIND_LIMIT, queryEntries, type StorageQueryOptions, type StorageQueryPolicy } from "./query.js";
import type { CollectionStorage, StorageBatchWriteOptions, StorageItemWriteOptions, StorageWriteOptions } from "./storage.js";
import { collectionChangeTopic, startChangeChain, writeWithChangeEvent } from "./changes.js";
import { partitionOfCall, storageOfCall, withPartition, type PartitionInput } from "./partition.js";
import { admitsRow, admittedStorage, checkAdmission, type CollectionAdmission } from "./admission.js";
import { patchItem } from "./patch-in-parts.js";
import { withCollectionRules } from "./hint-filter.js";

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
   * The rules of the rows (roadmap CLI-41). `admit` examines each row of each read, and each row of
   * each change event for each subscriber (roadmap CLI-78). `guard` examines each write before the storage changes, and a
   * refused write gets `FORBIDDEN` (reason `write-not-allowed`). With `versionOf`, a guarded write
   * expects the version that the guard read. `maxScanned` stops the scan of a `find` (roadmap
   * CLI-55). Without it, the procedures check only the partition.
   */
  admission?: CollectionAdmission | undefined;
}

/** The write options of an input with an origin. */
function writeOptionsOf(input: { origin?: string }): StorageWriteOptions | undefined {
  return input.origin === undefined ? undefined : { origin: input.origin };
}

/** The write options of `set` and `delete`: the origin, and the expected version (roadmap CLI-16). */
function itemWriteOptionsOf(input: { origin?: string; expectedVersion?: string | null }): StorageItemWriteOptions | undefined {
  if (input.expectedVersion === undefined) return writeOptionsOf(input);
  return { ...writeOptionsOf(input), expectedVersion: input.expectedVersion };
}

/** The write options of `setBatch`: the origin, and the expected version of each item that has one (roadmap CLI-16). */
function batchWriteOptionsOf(input: SetBatchInput): StorageBatchWriteOptions | undefined {
  const expectedVersions = input.items.flatMap((item): Array<[string, string | null]> => (item.expectedVersion === undefined ? [] : [[item.id, item.expectedVersion]]));
  if (expectedVersions.length === 0) return writeOptionsOf(input);
  return { ...writeOptionsOf(input), expectedVersions };
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
  const admission = options.admission;
  checkAdmission(admission);
  /** A write, and then its change event on the bus of the context. The chain of the events belongs to the storage, not to its view. */
  const changing = <R>(ctx: ProcedureContext, partition: string | undefined, storage: CollectionStorage<unknown>, ids: readonly string[] | "*", origin: string | undefined, write: () => Promise<R>): Promise<R> =>
    writeWithChangeEvent(ctx.bus, storage, topicRule ? topicOf(ctx, partition) : undefined, ids, origin, write, withValues, admission);
  /**
   * The partition and the storage of a call (roadmap CLI-17). The repository of the call has the
   * partitions of the collection and their resolver: the tenant comes from the principal. Each read
   * and each write goes through the view, with the rules of the rows (roadmap CLI-41).
   */
  const storageOf = async (input: PartitionInput, ctx: ProcedureContext): Promise<{ storage: CollectionStorage<unknown>; view: CollectionStorage<unknown>; partition: string | undefined }> => {
    const collection = getCollectionFromPath(ctx.path);
    const partition = await partitionOfCall(ctx, collection, input.partition);
    const storage = storageOfCall<unknown>(ctx, collection, partition);
    return { storage, view: admittedStorage(storage, admission, ctx), partition };
  };

  // The rules of the rows on the metadata: the publisher of the events filters each event with them (roadmap CLI-78)
  return withCollectionRules([
    // Get
    defineProcedure({
      path: [...basePath, "get"],
      input: withPartition(getInputSchema),
      output: getOutputSchema,
      metadata: {
        effects: { reads: [resource], writes: [] },
        description: `Get item from ${collectionName} by ID`,
        tags: ["collections", collectionName, "read"],
      },
      handler: async (input: GetInput & PartitionInput, ctx: ProcedureContext) => {
        const { view } = await storageOf(input, ctx);
        const value = await view.get(input.id);
        if (input.found !== true) return value;
        // The output with `found` keeps a stored null apart from a missing id, in one call
        const output: GetFoundOutput = value === undefined ? { found: false } : { found: true, value };
        return output;
      },
    }),

    // Set
    defineProcedure({
      path: [...basePath, "set"],
      input: withPartition(setInputSchema),
      output: setOutputSchema,
      metadata: {
        effects: { reads: [resource], writes: [resource], idempotent: true },
        description: `Set item in ${collectionName}`,
        tags: ["collections", collectionName, "write"],
      },
      handler: async (input: SetInput & PartitionInput, ctx: ProcedureContext) => {
        const { storage, view, partition } = await storageOf(input, ctx);
        await changing(ctx, partition, storage, [input.id], input.origin, () => view.set(input.id, input.value, itemWriteOptionsOf(input)));
      },
    }),

    // Delete
    defineProcedure({
      path: [...basePath, "delete"],
      input: withPartition(deleteInputSchema),
      output: deleteOutputSchema,
      metadata: {
        effects: { reads: [resource], writes: [resource], idempotent: true },
        description: `Delete item from ${collectionName}`,
        tags: ["collections", collectionName, "write"],
      },
      handler: async (input: DeleteInput & PartitionInput, ctx: ProcedureContext) => {
        const { storage, view, partition } = await storageOf(input, ctx);
        return changing(ctx, partition, storage, [input.id], input.origin, () => view.delete(input.id, itemWriteOptionsOf(input)));
      },
    }),

    // Has
    defineProcedure({
      path: [...basePath, "has"],
      input: withPartition(hasInputSchema),
      output: hasOutputSchema,
      metadata: {
        effects: { reads: [resource], writes: [] },
        description: `Check if item exists in ${collectionName}`,
        tags: ["collections", collectionName, "read"],
      },
      handler: async (input: HasInput & PartitionInput, ctx: ProcedureContext) => {
        const { view } = await storageOf(input, ctx);
        return view.has(input.id);
      },
    }),

    // GetAll
    defineProcedure({
      path: [...basePath, "getAll"],
      input: withPartition(getAllInputSchema),
      output: getAllOutputSchema,
      metadata: {
        effects: { reads: [resource], writes: [] },
        description: `Get all items from ${collectionName}`,
        tags: ["collections", collectionName, "read"],
      },
      handler: async (input: GetAllInput & PartitionInput, ctx: ProcedureContext) => {
        const { view } = await storageOf(input, ctx);
        return view.getAll();
      },
    }),

    // Entries: each item with its id, for a sync (roadmap R2)
    defineProcedure({
      path: [...basePath, "entries"],
      input: withPartition(entriesInputSchema),
      output: entriesOutputSchema,
      metadata: {
        effects: { reads: [resource], writes: [] },
        description: `Get all items of ${collectionName} with their ids`,
        tags: ["collections", collectionName, "read"],
      },
      handler: async (input: EntriesInput & PartitionInput, ctx: ProcedureContext) => {
        const { view } = await storageOf(input, ctx);
        if (!view.getEntries) {
          throw new Error(`The storage of ${collectionName} cannot give the ids of its items`);
        }
        return (await view.getEntries()).map(([id, value]) => ({ id, value }));
      },
    }),

    // Ids: the ids of the items without the values, for a full sync
    defineProcedure({
      path: [...basePath, "ids"],
      input: withPartition(idsInputSchema),
      output: idsOutputSchema,
      metadata: {
        effects: { reads: [resource], writes: [] },
        description: `Get the ids of the items of ${collectionName}, without the values`,
        tags: ["collections", collectionName, "read"],
      },
      handler: async (input: IdsInput & PartitionInput, ctx: ProcedureContext) => {
        const { view } = await storageOf(input, ctx);
        if (view.getIds) return view.getIds();
        // A storage without getIds() gives its entries: the values stay on the server
        if (view.getEntries) return (await view.getEntries()).map(([id]) => id);
        throw new Error(`The storage of ${collectionName} cannot give the ids of its items`);
      },
    }),

    // Changes: the items that changed after a version, for a delta sync (roadmap R28)
    defineProcedure({
      path: [...basePath, "changes"],
      input: withPartition(changesInputSchema),
      output: changesOutputSchema,
      metadata: {
        effects: { reads: [resource], writes: [] },
        description: `Get the items of ${collectionName} that changed after a version`,
        tags: ["collections", collectionName, "read"],
      },
      handler: async (input: ChangesInput & PartitionInput, ctx: ProcedureContext): Promise<ChangesOutput> => {
        const { storage, view, partition } = await storageOf(input, ctx);
        if (view.getChangesSince) {
          const changes = await view.getChangesSince(input.since);
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
        if (view.getEntries) {
          const entries = await view.getEntries();
          return { version: "", full: true, changed: entries.map(([id, value]) => ({ id, value })), deleted: [] };
        }
        throw new Error(`The storage of ${collectionName} cannot give its changes or the ids of its items`);
      },
    }),

    // Find: the items that match a JSON selector, with an order, a skip and a limit (roadmap CLI-14)
    defineProcedure({
      path: [...basePath, "find"],
      input: withPartition(findInputSchemaOf(queryPolicy)),
      output: findOutputSchema,
      metadata: {
        effects: { reads: [resource], writes: [] },
        description: `Find the items of ${collectionName} that match a selector, with their ids, an order, a skip and a limit`,
        tags: ["collections", collectionName, "read", "query"],
      },
      handler: async (input: FindInput & PartitionInput, ctx: ProcedureContext) => {
        const { view } = await storageOf(input, ctx);
        const selector = input.selector ?? {};
        const query = queryOptionsOf(input, queryPolicy);
        // The storage runs the selector itself when it can: a database does not read each item. It
        // gets the policy of the host, so it permits what the procedure permits.
        if (view.query) return (await view.query(selector, query, queryPolicy)).map(([id, value]) => ({ id, value }));
        if (!view.getEntries) {
          throw new Error(`The storage of ${collectionName} cannot run a selector or give the ids of its items`);
        }
        return queryEntries(await view.getEntries(), selector, query, queryPolicy).map(([id, value]) => ({ id, value }));
      },
    }),

    // Patch: merge fields into one item, a JSON Merge Patch (roadmap CLI-14)
    defineProcedure({
      path: [...basePath, "patch"],
      input: withPartition(patchInputSchema),
      output: patchOutputSchema,
      metadata: {
        effects: { reads: [resource], writes: [resource], idempotent: true },
        description: `Merge fields into one item of ${collectionName}: a JSON Merge Patch, or the operations $set, $unset, $remove and $insert`,
        tags: ["collections", collectionName, "write"],
      },
      handler: async (input: PatchInput & PartitionInput, ctx: ProcedureContext) => {
        const { storage, view, partition } = await storageOf(input, ctx);
        const write = writeOptionsOf(input);
        const value = await changing(ctx, partition, storage, [input.id], input.origin, () => patchItem(view, input.id, input.fields, write));
        if (value === undefined) return { found: false } satisfies GetFoundOutput;
        // The new item is a row too: a caller gets it only when the rule of the rows admits it (roadmap CLI-41)
        const output: GetFoundOutput = (await admitsRow(admission, ctx, input.id, value)) ? { found: true, value } : { found: true };
        return output;
      },
    }),

    // Size
    defineProcedure({
      path: [...basePath, "size"],
      input: withPartition(sizeInputSchema),
      output: sizeOutputSchema,
      metadata: {
        effects: { reads: [resource], writes: [] },
        description: `Get number of items in ${collectionName}`,
        tags: ["collections", collectionName, "read"],
      },
      handler: async (input: SizeInput & PartitionInput, ctx: ProcedureContext) => {
        const { view } = await storageOf(input, ctx);
        return view.size();
      },
    }),

    // Clear
    defineProcedure({
      path: [...basePath, "clear"],
      input: withPartition(clearInputSchema),
      output: clearOutputSchema,
      metadata: {
        effects: { reads: [resource], writes: [resource], idempotent: true },
        description: `Clear all items from ${collectionName}`,
        tags: ["collections", collectionName, "write"],
      },
      handler: async (input: ClearInput & PartitionInput, ctx: ProcedureContext) => {
        const { storage, view, partition } = await storageOf(input, ctx);
        await changing(ctx, partition, storage, "*", input.origin, () => view.clear(writeOptionsOf(input)));
      },
    }),

    // GetBatch
    defineProcedure({
      path: [...basePath, "getBatch"],
      input: withPartition(getBatchInputSchema),
      output: getBatchOutputSchema,
      metadata: {
        effects: { reads: [resource], writes: [] },
        description: `Get multiple items from ${collectionName}`,
        tags: ["collections", collectionName, "read", "batch"],
      },
      handler: async (input: GetBatchInput & PartitionInput, ctx: ProcedureContext) => {
        const { view } = await storageOf(input, ctx);
        const result = await view.getBatch(input.ids);
        // Convert Map to plain object
        return Object.fromEntries(result);
      },
    }),

    // SetBatch
    defineProcedure({
      path: [...basePath, "setBatch"],
      input: withPartition(setBatchInputSchema),
      output: setBatchOutputSchema,
      metadata: {
        effects: { reads: [resource], writes: [resource], idempotent: true },
        description: `Set multiple items in ${collectionName}`,
        tags: ["collections", collectionName, "write", "batch"],
      },
      handler: async (input: SetBatchInput & PartitionInput, ctx: ProcedureContext) => {
        const { storage, view, partition } = await storageOf(input, ctx);
        const items: Array<[string, unknown]> = input.items.map((item) => [
          item.id,
          item.value,
        ]);
        await changing(ctx, partition, storage, items.map(([id]) => id), input.origin, () => view.setBatch(items, batchWriteOptionsOf(input)));
      },
    }),

    // DeleteBatch
    defineProcedure({
      path: [...basePath, "deleteBatch"],
      input: withPartition(deleteBatchInputSchema),
      output: deleteBatchOutputSchema,
      metadata: {
        effects: { reads: [resource], writes: [resource], idempotent: true },
        description: `Delete multiple items from ${collectionName}`,
        tags: ["collections", collectionName, "write", "batch"],
      },
      handler: async (input: DeleteBatchInput & PartitionInput, ctx: ProcedureContext) => {
        const { storage, view, partition } = await storageOf(input, ctx);
        return changing(ctx, partition, storage, input.ids, input.origin, () => view.deleteBatch(input.ids, writeOptionsOf(input)));
      },
    }),
  ], admission);
}
