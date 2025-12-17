/**
 * Procedure Serialization
 *
 * Utilities for converting procedures to/from serialized format.
 * Enables storage and transmission of procedure definitions.
 */
import { pathToKey } from "../types.js";
// =============================================================================
// Any Schema (for deserialized procedures without schemas)
// =============================================================================
/**
 * Passthrough schema that accepts any value.
 * Used for deserialized procedures where original schemas aren't available.
 */
const anySchema = {
    parse: (data) => data,
    safeParse: (data) => ({ success: true, data }),
    _output: undefined,
};
/**
 * Serialize a procedure to storable format.
 *
 * Note: Handler functions cannot be serialized. If the procedure has a handler,
 * you should provide a `handlerRef` that can be used to load it later.
 *
 * @param procedure - Procedure to serialize
 * @param options - Serialization options
 * @returns Serialized procedure definition
 *
 * @example
 * ```typescript
 * const serialized = serializeProcedure(myProcedure, {
 *   handlerRef: {
 *     module: "@mark1russell7/client-cli",
 *     export: "libScanHandler",
 *   },
 * });
 * ```
 */
export function serializeProcedure(procedure, options = {}) {
    const serialized = {
        path: procedure.path,
        metadata: { ...procedure.metadata },
        storedAt: Date.now(),
    };
    // Only include streaming if explicitly set
    if (procedure.streaming !== undefined) {
        serialized.streaming = procedure.streaming;
    }
    // Include handler reference if provided
    if (options.handlerRef) {
        serialized.handlerRef = options.handlerRef;
    }
    // Include version if requested
    if (options.includeVersion) {
        serialized.version = 1;
    }
    return serialized;
}
/**
 * Deserialize a procedure from stored format.
 *
 * Returns a stub procedure without a handler unless a handlerLoader is provided
 * and the serialized procedure has a handlerRef.
 *
 * @param data - Serialized procedure data
 * @param options - Deserialization options
 * @returns Procedure (stub if no handler can be loaded)
 *
 * @example
 * ```typescript
 * // Deserialize as stub (no handler)
 * const stub = await deserializeProcedure(data);
 *
 * // Deserialize with handler loading
 * const proc = await deserializeProcedure(data, {
 *   handlerLoader: myLoader,
 * });
 * ```
 */
export async function deserializeProcedure(data, options = {}) {
    const procedure = {
        path: data.path,
        input: anySchema,
        output: anySchema,
        metadata: { ...data.metadata },
    };
    // Set streaming if present
    if (data.streaming !== undefined) {
        procedure.streaming = data.streaming;
    }
    // Try to load handler if reference exists and loader is provided
    if (data.handlerRef && options.handlerLoader) {
        try {
            const handler = await options.handlerLoader.load(data.handlerRef);
            if (handler && typeof handler === "function") {
                procedure.handler = handler;
            }
        }
        catch {
            // Handler loading failed, procedure remains a stub
        }
    }
    return procedure;
}
/**
 * Synchronous version that always returns a stub.
 * Use when you don't need to load handlers.
 */
export function deserializeProcedureSync(data) {
    const procedure = {
        path: data.path,
        input: anySchema,
        output: anySchema,
        metadata: { ...data.metadata },
    };
    if (data.streaming !== undefined) {
        procedure.streaming = data.streaming;
    }
    return procedure;
}
// =============================================================================
// Storage Key Utilities
// =============================================================================
/**
 * Get the storage key (ID) for a procedure.
 * Uses the dot-separated path as the key.
 *
 * @param pathOrProcedure - Procedure path or procedure object
 * @returns Storage key string
 */
export function getProcedureKey(pathOrProcedure) {
    const path = Array.isArray(pathOrProcedure) ? pathOrProcedure : pathOrProcedure.path;
    return pathToKey(path);
}
/**
 * Get the storage key from a serialized procedure.
 */
export function getSerializedKey(data) {
    return pathToKey(data.path);
}
// =============================================================================
// Batch Operations
// =============================================================================
/**
 * Serialize multiple procedures.
 *
 * @param procedures - Procedures to serialize
 * @param options - Serialization options
 * @returns Array of [key, serialized] tuples for batch storage
 */
export function serializeProcedures(procedures, options = {}) {
    return procedures.map((proc) => [
        getProcedureKey(proc),
        serializeProcedure(proc, options),
    ]);
}
/**
 * Deserialize multiple procedures.
 *
 * @param items - Array of serialized procedures
 * @param options - Deserialization options
 * @returns Array of procedures
 */
export async function deserializeProcedures(items, options = {}) {
    return Promise.all(items.map((item) => deserializeProcedure(item, options)));
}
// =============================================================================
// Default Handler Loader
// =============================================================================
/**
 * Create a handler loader using dynamic imports.
 *
 * @returns Handler loader that uses import() to load modules
 *
 * @example
 * ```typescript
 * const loader = createDynamicHandlerLoader();
 * const handler = await loader.load({
 *   module: "@mark1russell7/client-cli",
 *   export: "libScanHandler",
 * });
 * ```
 */
export function createDynamicHandlerLoader() {
    return {
        async load(ref) {
            try {
                const module = await import(ref.module);
                return module[ref.export];
            }
            catch {
                return undefined;
            }
        },
    };
}
//# sourceMappingURL=serialization.js.map