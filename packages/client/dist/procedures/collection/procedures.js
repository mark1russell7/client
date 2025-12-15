/**
 * Collection Procedures
 *
 * Procedure definitions for collection CRUD operations.
 * These procedures delegate to storage backends via the repository pattern.
 */
import { defineProcedure } from "../define.js";
import { getInputSchema, getOutputSchema, setInputSchema, setOutputSchema, deleteInputSchema, deleteOutputSchema, hasInputSchema, hasOutputSchema, getAllInputSchema, getAllOutputSchema, sizeInputSchema, sizeOutputSchema, clearInputSchema, clearOutputSchema, getBatchInputSchema, getBatchOutputSchema, setBatchInputSchema, setBatchOutputSchema, deleteBatchInputSchema, deleteBatchOutputSchema, } from "./schemas.js";
// =============================================================================
// Handler Factory
// =============================================================================
/**
 * Extract collection name from procedure path.
 * Path format: ['collections', collectionName, operation]
 */
function getCollectionFromPath(path) {
    if (path.length < 3 || path[0] !== "collections") {
        throw new Error(`Invalid collection procedure path: ${path.join(".")}`);
    }
    return path[1];
}
/**
 * Get storage from context, throwing if repository is not available.
 */
function getStorage(ctx) {
    if (!ctx.repository) {
        throw new Error("Repository not available in procedure context");
    }
    const collection = getCollectionFromPath(ctx.path);
    return ctx.repository.getStorage(collection);
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
export function createCollectionProcedures(collectionName) {
    const basePath = ["collections", collectionName];
    return [
        // Get
        defineProcedure({
            path: [...basePath, "get"],
            input: getInputSchema,
            output: getOutputSchema,
            metadata: {
                description: `Get item from ${collectionName} by ID`,
                tags: ["collections", collectionName, "read"],
            },
            handler: async (input, ctx) => {
                const storage = getStorage(ctx);
                return storage.get(input.id);
            },
        }),
        // Set
        defineProcedure({
            path: [...basePath, "set"],
            input: setInputSchema,
            output: setOutputSchema,
            metadata: {
                description: `Set item in ${collectionName}`,
                tags: ["collections", collectionName, "write"],
            },
            handler: async (input, ctx) => {
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
                description: `Delete item from ${collectionName}`,
                tags: ["collections", collectionName, "write"],
            },
            handler: async (input, ctx) => {
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
                description: `Check if item exists in ${collectionName}`,
                tags: ["collections", collectionName, "read"],
            },
            handler: async (input, ctx) => {
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
                description: `Get all items from ${collectionName}`,
                tags: ["collections", collectionName, "read"],
            },
            handler: async (_input, ctx) => {
                const storage = getStorage(ctx);
                return storage.getAll();
            },
        }),
        // Size
        defineProcedure({
            path: [...basePath, "size"],
            input: sizeInputSchema,
            output: sizeOutputSchema,
            metadata: {
                description: `Get number of items in ${collectionName}`,
                tags: ["collections", collectionName, "read"],
            },
            handler: async (_input, ctx) => {
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
                description: `Clear all items from ${collectionName}`,
                tags: ["collections", collectionName, "write"],
            },
            handler: async (_input, ctx) => {
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
                description: `Get multiple items from ${collectionName}`,
                tags: ["collections", collectionName, "read", "batch"],
            },
            handler: async (input, ctx) => {
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
                description: `Set multiple items in ${collectionName}`,
                tags: ["collections", collectionName, "write", "batch"],
            },
            handler: async (input, ctx) => {
                const storage = getStorage(ctx);
                const items = input.items.map((item) => [
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
                description: `Delete multiple items from ${collectionName}`,
                tags: ["collections", collectionName, "write", "batch"],
            },
            handler: async (input, ctx) => {
                const storage = getStorage(ctx);
                return storage.deleteBatch(input.ids);
            },
        }),
    ];
}
// =============================================================================
// Generic Collection Procedures (for dynamic collections)
// =============================================================================
/**
 * Generic get procedure that works with any collection.
 * Uses the collection name from the path.
 */
export const genericGetProcedure = defineProcedure({
    path: ["collections", "*", "get"],
    input: getInputSchema,
    output: getOutputSchema,
    metadata: {
        description: "Get item from collection by ID",
        tags: ["collections", "read", "generic"],
    },
    handler: async (input, ctx) => {
        const storage = getStorage(ctx);
        return storage.get(input.id);
    },
});
/**
 * Generic set procedure that works with any collection.
 */
export const genericSetProcedure = defineProcedure({
    path: ["collections", "*", "set"],
    input: setInputSchema,
    output: setOutputSchema,
    metadata: {
        description: "Set item in collection",
        tags: ["collections", "write", "generic"],
    },
    handler: async (input, ctx) => {
        const storage = getStorage(ctx);
        await storage.set(input.id, input.value);
    },
});
/**
 * Generic delete procedure that works with any collection.
 */
export const genericDeleteProcedure = defineProcedure({
    path: ["collections", "*", "delete"],
    input: deleteInputSchema,
    output: deleteOutputSchema,
    metadata: {
        description: "Delete item from collection",
        tags: ["collections", "write", "generic"],
    },
    handler: async (input, ctx) => {
        const storage = getStorage(ctx);
        return storage.delete(input.id);
    },
});
// =============================================================================
// Collection Module Registration
// =============================================================================
/**
 * All generic collection procedures.
 * Register these for dynamic collection support.
 */
export const genericCollectionProcedures = [
    genericGetProcedure,
    genericSetProcedure,
    genericDeleteProcedure,
];
/**
 * Module export for procedure registration.
 */
export const collectionModule = {
    name: "collections",
    procedures: genericCollectionProcedures,
};
//# sourceMappingURL=procedures.js.map