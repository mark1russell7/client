/**
 * Component Types
 *
 * Components are procedures that return serializable UI descriptors.
 * This enables SSR, caching, and transport over wire.
 *
 * Components integrate with splay's rendering model where a renderer
 * produces output based on data, size, and path context.
 */
// =============================================================================
// Output Helpers
// =============================================================================
/**
 * Create a null output (render nothing).
 */
export function nullOutput() {
    return { type: "__null__" };
}
/**
 * Create a fragment output (multiple children without wrapper).
 */
export function fragment(...children) {
    return { type: "__fragment__", children };
}
/**
 * Check if output is a fragment.
 */
export function isFragment(output) {
    return output.type === "__fragment__";
}
/**
 * Check if output is null.
 */
export function isNullOutput(output) {
    return output.type === "__null__";
}
/**
 * Check if a factory is a streaming generator.
 */
export function isStreamingFactory(factory) {
    return factory.constructor.name === "AsyncGeneratorFunction";
}
//# sourceMappingURL=types.js.map