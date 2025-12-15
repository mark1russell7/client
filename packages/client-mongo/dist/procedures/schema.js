/**
 * Minimal Schema Helpers
 *
 * Zod-like interface for the client procedure system.
 * No actual validation - just type passthrough.
 */
/**
 * Create a pass-through schema for type T
 */
export function schema() {
    return {
        parse: (data) => data,
        safeParse: (data) => ({ success: true, data: data }),
        _output: undefined,
    };
}
//# sourceMappingURL=schema.js.map