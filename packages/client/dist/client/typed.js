/**
 * Typed Procedure Caller
 *
 * Creates a typed wrapper around a procedure caller function.
 * Provides compile-time autocomplete for procedure paths, inputs, and outputs.
 *
 * @example
 * ```typescript
 * import { createTypedCaller } from "@mark1russell7/client";
 * import type { MongoProcedures, ProcedureInput, ProcedureOutput } from "@mark1russell7/client-mongo";
 *
 * // Create typed caller
 * const call = createTypedCaller<MongoProcedures>(client.call.bind(client));
 *
 * // Full autocomplete on path and input!
 * const result = await call(
 *   ["mongo", "documents", "find"],
 *   { query: { status: "active" } },
 *   { metadata: { collection: "users" } }
 * );
 * // result is typed as FindOutput
 * ```
 */
/**
 * Create a typed procedure caller
 *
 * Wraps a base caller function to provide compile-time type safety
 * for procedure paths, inputs, and outputs.
 *
 * @param caller - Base caller function (e.g., client.call.bind(client))
 * @returns Typed caller with autocomplete
 *
 * @example
 * ```typescript
 * import type { MongoProcedures } from "@mark1russell7/client-mongo";
 *
 * const typedCall = createTypedCaller<MongoProcedures>(client.call.bind(client));
 *
 * // TypeScript knows:
 * // - path must be a valid procedure path
 * // - input must match the procedure's input type
 * // - result is the procedure's output type
 * const result = await typedCall(
 *   ["mongo", "documents", "find"],
 *   { query: {}, page: 1 }
 * );
 * ```
 */
export function createTypedCaller(caller) {
    return caller;
}
//# sourceMappingURL=typed.js.map