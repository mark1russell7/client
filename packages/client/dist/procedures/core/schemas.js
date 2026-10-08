/**
 * Common Schemas
 *
 * Shared schema definitions for procedures that accept any input/output.
 * Centralizes the ZodLike-compatible pass-through schema and Zod adapters.
 */
// =============================================================================
// Any Schema - Pass-through validation
// =============================================================================
/**
 * A ZodLike schema that accepts any value and passes it through.
 * Used for procedures with dynamic or unknown input/output types.
 */
export const anySchema = {
    parse: (value) => value,
    safeParse: (value) => ({ success: true, data: value }),
};
/**
 * Typed version of anySchema for specific type annotations.
 * Useful when you want to assert a specific type at compile time.
 */
export function typedAnySchema() {
    return {
        parse: (value) => value,
        safeParse: (value) => ({ success: true, data: value }),
    };
}
// =============================================================================
// Zod Adapter - Wraps a Zod schema for the procedure system
// =============================================================================
/**
 * Wraps a Zod schema (or any object with a `parse` method) for use with
 * the client procedure system. Adds `safeParse` with error mapping and
 * the `_output` phantom field for type inference.
 */
export function zodAdapter(schema) {
    return {
        parse: (data) => schema.parse(data),
        safeParse: (data) => {
            try {
                const parsed = schema.parse(data);
                return { success: true, data: parsed };
            }
            catch (error) {
                const err = error;
                return {
                    success: false,
                    error: {
                        message: err.message ?? "Validation failed",
                        errors: Array.isArray(err.errors)
                            ? err.errors.map((e) => {
                                const errObj = e;
                                return {
                                    path: (errObj.path ?? []),
                                    message: errObj.message ?? "Unknown error",
                                };
                            })
                            : [],
                    },
                };
            }
        },
        _output: undefined,
    };
}
// =============================================================================
// Output Schema - Pass-through schema for output types
// =============================================================================
/**
 * Creates a pass-through schema for output types (no validation).
 * Equivalent to `typedAnySchema` but with the `_output` phantom field.
 */
export function outputSchema() {
    return {
        parse: (data) => data,
        safeParse: (data) => ({ success: true, data: data }),
        _output: undefined,
    };
}
//# sourceMappingURL=schemas.js.map