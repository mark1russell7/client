/**
 * Procedure Serialization
 *
 * Utilities for converting procedures to/from serialized format.
 * Enables storage and transmission of procedure definitions.
 */
import type { AnyProcedure, ProcedurePath } from "../types.js";
import type { SerializedProcedure, HandlerReference, HandlerLoader } from "./types.js";
/**
 * Options for serializing a procedure.
 */
export interface SerializeOptions {
    /** Handler reference to store (optional, handlers can't be serialized directly) */
    handlerRef?: HandlerReference | undefined;
    /** Whether to include version info */
    includeVersion?: boolean | undefined;
}
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
export declare function serializeProcedure(procedure: AnyProcedure, options?: SerializeOptions): SerializedProcedure;
/**
 * Options for deserializing a procedure.
 */
export interface DeserializeOptions {
    /** Handler loader to restore handlers from references */
    handlerLoader?: HandlerLoader | undefined;
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
export declare function deserializeProcedure(data: SerializedProcedure, options?: DeserializeOptions): Promise<AnyProcedure>;
/**
 * Synchronous version that always returns a stub.
 * Use when you don't need to load handlers.
 */
export declare function deserializeProcedureSync(data: SerializedProcedure): AnyProcedure;
/**
 * Get the storage key (ID) for a procedure.
 * Uses the dot-separated path as the key.
 *
 * @param pathOrProcedure - Procedure path or procedure object
 * @returns Storage key string
 */
export declare function getProcedureKey(pathOrProcedure: ProcedurePath | AnyProcedure): string;
/**
 * Get the storage key from a serialized procedure.
 */
export declare function getSerializedKey(data: SerializedProcedure): string;
/**
 * Serialize multiple procedures.
 *
 * @param procedures - Procedures to serialize
 * @param options - Serialization options
 * @returns Array of [key, serialized] tuples for batch storage
 */
export declare function serializeProcedures(procedures: AnyProcedure[], options?: SerializeOptions): Array<[string, SerializedProcedure]>;
/**
 * Deserialize multiple procedures.
 *
 * @param items - Array of serialized procedures
 * @param options - Deserialization options
 * @returns Array of procedures
 */
export declare function deserializeProcedures(items: SerializedProcedure[], options?: DeserializeOptions): Promise<AnyProcedure[]>;
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
export declare function createDynamicHandlerLoader(): HandlerLoader;
//# sourceMappingURL=serialization.d.ts.map