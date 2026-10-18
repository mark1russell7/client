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
  findInputSchema,
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
import { mergePatch, queryEntries, type StoragePatch, type StorageQueryOptions } from "./query.js";
import type { CollectionStorage } from "./storage.js";

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

/**
 * Get storage from context, throwing if repository is not available.
 */
function getStorage<T>(ctx: ProcedureContext): ReturnType<NonNullable<ProcedureContext["repository"]>["getStorage"]> {
  if (!ctx.repository) {
    throw new Error("Repository not available in procedure context");
  }
  const collection = getCollectionFromPath(ctx.path);
  return ctx.repository.getStorage<T>(collection);
}

/** The options of a query from the input of `find`. */
function queryOptionsOf(input: FindInput): StorageQueryOptions {
  return {
    ...(input.sort !== undefined && { sort: input.sort }),
    ...(input.skip !== undefined && { skip: input.skip }),
    ...(input.limit !== undefined && { limit: input.limit }),
  };
}

/**
 * The patches of a storage without `patch()` that run, for each id. A patch of an id waits for the
 * patch before it, so two patches of one process keep each field. A write of another writer
 * between the read and the write of a patch is lost: give the storage a `patch()` for one step.
 */
const PATCHES = new WeakMap<object, Map<string, Promise<unknown>>>();

/** This function patches an item of a storage without `patch()`: a read, a merge and a write. */
function patchInParts(storage: CollectionStorage<unknown>, id: string, fields: StoragePatch): Promise<unknown> {
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
    const next = mergePatch(current, fields);
    await storage.set(id, next);
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
 * @returns Array of procedure definitions
 *
 * @example
 * ```typescript
 * const userProcedures = createCollectionProcedures('users');
 * registry.registerAll(userProcedures);
 * ```
 */
export function createCollectionProcedures(collectionName: string): AnyProcedure[] {
  const basePath = ["collections", collectionName];
  // Each collection is a resource of its own (CAPABILITIES-2026-10): a capability can permit one
  const resource = `collection:${collectionName}`;

  return [
    // Get
    defineProcedure({
      path: [...basePath, "get"],
      input: getInputSchema,
      output: getOutputSchema,
      metadata: {
        effects: { reads: [resource], writes: [] },
        description: `Get item from ${collectionName} by ID`,
        tags: ["collections", collectionName, "read"],
      },
      handler: async (input: GetInput, ctx : ProcedureContext) => {
        const storage = getStorage(ctx);
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
      input: setInputSchema,
      output: setOutputSchema,
      metadata: {
        effects: { reads: [resource], writes: [resource], idempotent: true },
        description: `Set item in ${collectionName}`,
        tags: ["collections", collectionName, "write"],
      },
      handler: async (input: SetInput, ctx: ProcedureContext) => {
        const storage = getStorage(ctx);
        await storage.set(input.id, input.value);
      },
    }),

    // Delete
    defineProcedure({
      path: [...basePath, "delete"],
      input: deleteInputSchema,
      output: deleteOutputSchema,
      metadata: {
        effects: { reads: [resource], writes: [resource], idempotent: true },
        description: `Delete item from ${collectionName}`,
        tags: ["collections", collectionName, "write"],
      },
      handler: async (input: DeleteInput, ctx: ProcedureContext) => {
        const storage = getStorage(ctx);
        return storage.delete(input.id);
      },
    }),

    // Has
    defineProcedure({
      path: [...basePath, "has"],
      input: hasInputSchema,
      output: hasOutputSchema,
      metadata: {
        effects: { reads: [resource], writes: [] },
        description: `Check if item exists in ${collectionName}`,
        tags: ["collections", collectionName, "read"],
      },
      handler: async (input: HasInput, ctx: ProcedureContext) => {
        const storage = getStorage(ctx);
        return storage.has(input.id);
      },
    }),

    // GetAll
    defineProcedure({
      path: [...basePath, "getAll"],
      input: getAllInputSchema,
      output: getAllOutputSchema,
      metadata: {
        effects: { reads: [resource], writes: [] },
        description: `Get all items from ${collectionName}`,
        tags: ["collections", collectionName, "read"],
      },
      handler: async (_input: GetAllInput, ctx: ProcedureContext) => {
        const storage = getStorage(ctx);
        return storage.getAll();
      },
    }),

    // Entries: each item with its id, for a sync (roadmap R2)
    defineProcedure({
      path: [...basePath, "entries"],
      input: entriesInputSchema,
      output: entriesOutputSchema,
      metadata: {
        effects: { reads: [resource], writes: [] },
        description: `Get all items of ${collectionName} with their ids`,
        tags: ["collections", collectionName, "read"],
      },
      handler: async (_input: EntriesInput, ctx: ProcedureContext) => {
        const storage = getStorage(ctx);
        if (!storage.getEntries) {
          throw new Error(`The storage of ${collectionName} cannot give the ids of its items`);
        }
        return (await storage.getEntries()).map(([id, value]) => ({ id, value }));
      },
    }),

    // Ids: the ids of the items without the values, for a full sync
    defineProcedure({
      path: [...basePath, "ids"],
      input: idsInputSchema,
      output: idsOutputSchema,
      metadata: {
        effects: { reads: [resource], writes: [] },
        description: `Get the ids of the items of ${collectionName}, without the values`,
        tags: ["collections", collectionName, "read"],
      },
      handler: async (_input: IdsInput, ctx: ProcedureContext) => {
        const storage = getStorage(ctx);
        if (storage.getIds) return storage.getIds();
        // A storage without getIds() gives its entries: the values stay on the server
        if (storage.getEntries) return (await storage.getEntries()).map(([id]) => id);
        throw new Error(`The storage of ${collectionName} cannot give the ids of its items`);
      },
    }),

    // Changes: the items that changed after a version, for a delta sync (roadmap R28)
    defineProcedure({
      path: [...basePath, "changes"],
      input: changesInputSchema,
      output: changesOutputSchema,
      metadata: {
        effects: { reads: [resource], writes: [] },
        description: `Get the items of ${collectionName} that changed after a version`,
        tags: ["collections", collectionName, "read"],
      },
      handler: async (input: ChangesInput, ctx: ProcedureContext): Promise<ChangesOutput> => {
        const storage = getStorage(ctx);
        if (storage.getChangesSince) {
          const changes = await storage.getChangesSince(input.since);
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
      input: findInputSchema,
      output: findOutputSchema,
      metadata: {
        effects: { reads: [resource], writes: [] },
        description: `Find the items of ${collectionName} that match a selector, with their ids, an order, a skip and a limit`,
        tags: ["collections", collectionName, "read", "query"],
      },
      handler: async (input: FindInput, ctx: ProcedureContext) => {
        const storage = getStorage(ctx);
        const selector = input.selector ?? {};
        const options = queryOptionsOf(input);
        // The storage runs the selector itself when it can: a database does not read each item
        if (storage.query) return (await storage.query(selector, options)).map(([id, value]) => ({ id, value }));
        if (!storage.getEntries) {
          throw new Error(`The storage of ${collectionName} cannot run a selector or give the ids of its items`);
        }
        return queryEntries(await storage.getEntries(), selector, options).map(([id, value]) => ({ id, value }));
      },
    }),

    // Patch: merge fields into one item, a JSON Merge Patch (roadmap CLI-14)
    defineProcedure({
      path: [...basePath, "patch"],
      input: patchInputSchema,
      output: patchOutputSchema,
      metadata: {
        effects: { reads: [resource], writes: [resource], idempotent: true },
        description: `Merge fields into one item of ${collectionName}: null removes a field`,
        tags: ["collections", collectionName, "write"],
      },
      handler: async (input: PatchInput, ctx: ProcedureContext) => {
        const storage = getStorage(ctx);
        const value = storage.patch ? await storage.patch(input.id, input.fields) : await patchInParts(storage, input.id, input.fields);
        const output: GetFoundOutput = value === undefined ? { found: false } : { found: true, value };
        return output;
      },
    }),

    // Size
    defineProcedure({
      path: [...basePath, "size"],
      input: sizeInputSchema,
      output: sizeOutputSchema,
      metadata: {
        effects: { reads: [resource], writes: [] },
        description: `Get number of items in ${collectionName}`,
        tags: ["collections", collectionName, "read"],
      },
      handler: async (_input: SizeInput, ctx: ProcedureContext) => {
        const storage = getStorage(ctx);
        return storage.size();
      },
    }),

    // Clear
    defineProcedure({
      path: [...basePath, "clear"],
      input: clearInputSchema,
      output: clearOutputSchema,
      metadata: {
        effects: { reads: [resource], writes: [resource], idempotent: true },
        description: `Clear all items from ${collectionName}`,
        tags: ["collections", collectionName, "write"],
      },
      handler: async (_input: ClearInput, ctx: ProcedureContext) => {
        const storage = getStorage(ctx);
        await storage.clear();
      },
    }),

    // GetBatch
    defineProcedure({
      path: [...basePath, "getBatch"],
      input: getBatchInputSchema,
      output: getBatchOutputSchema,
      metadata: {
        effects: { reads: [resource], writes: [] },
        description: `Get multiple items from ${collectionName}`,
        tags: ["collections", collectionName, "read", "batch"],
      },
      handler: async (input: GetBatchInput, ctx: ProcedureContext) => {
        const storage = getStorage(ctx);
        const result = await storage.getBatch(input.ids);
        // Convert Map to plain object
        return Object.fromEntries(result);
      },
    }),

    // SetBatch
    defineProcedure({
      path: [...basePath, "setBatch"],
      input: setBatchInputSchema,
      output: setBatchOutputSchema,
      metadata: {
        effects: { reads: [resource], writes: [resource], idempotent: true },
        description: `Set multiple items in ${collectionName}`,
        tags: ["collections", collectionName, "write", "batch"],
      },
      handler: async (input: SetBatchInput, ctx: ProcedureContext) => {
        const storage = getStorage(ctx);
        const items: Array<[string, unknown]> = input.items.map((item) => [
          item.id,
          item.value,
        ]);
        await storage.setBatch(items);
      },
    }),

    // DeleteBatch
    defineProcedure({
      path: [...basePath, "deleteBatch"],
      input: deleteBatchInputSchema,
      output: deleteBatchOutputSchema,
      metadata: {
        effects: { reads: [resource], writes: [resource], idempotent: true },
        description: `Delete multiple items from ${collectionName}`,
        tags: ["collections", collectionName, "write", "batch"],
      },
      handler: async (input: DeleteBatchInput, ctx: ProcedureContext) => {
        const storage = getStorage(ctx);
        return storage.deleteBatch(input.ids);
      },
    }),
  ];
}
