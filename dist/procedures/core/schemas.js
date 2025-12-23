/**
 * Common Schemas
 *
 * Shared schema definitions for procedures that accept any input/output.
 * Centralizes the ZodLike-compatible pass-through schema.
 */
// =============================================================================
// Any Schema - Pass-through validation
// =============================================================================
/**
 * A ZodLike schema that accepts any value and passes it through.
 * Used for procedures with dynamic or unknown input/output types.
 *
 * @example
 * ```typescript
 * import { anySchema } from "./schemas.js";
 *
 * const myProcedure = {
 *   path: ["my", "proc"],
 *   input: anySchema,
 *   output: anySchema,
 *   // ...
 * };
 * ```
 */
export const anySchema = {
    parse: (value) => value,
    safeParse: (value) => ({ success: true, data: value }),
};
/**
 * Typed version of anySchema for specific type annotations.
 * Useful when you want to assert a specific type at compile time.
 *
 * @example
 * ```typescript
 * import { typedAnySchema } from "./schemas.js";
 *
 * const myProcedure = {
 *   input: typedAnySchema<{ id: string }>(),
 *   output: typedAnySchema<User>(),
 * };
 * ```
 */
export function typedAnySchema() {
    return {
        parse: (value) => value,
        safeParse: (value) => ({ success: true, data: value }),
    };
}
//# sourceMappingURL=schemas.js.map