/**
 * Typed Procedures Interface
 *
 * Provides compile-time autocomplete for client-mongo procedures.
 * Import this type and use with a typed caller for full type safety.
 *
 * @example
 * ```typescript
 * import type { MongoProcedures } from "@mark1russell7/client-mongo";
 * import { createTypedCaller } from "@mark1russell7/client";
 *
 * const call = createTypedCaller<MongoProcedures>(client.call);
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
export {};
//# sourceMappingURL=procedures.types.js.map