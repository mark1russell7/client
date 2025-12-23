/**
 * Consumption Types
 *
 * Types for configuring how procedure outputs are consumed.
 * Supports sponge (accumulate), stream (iterate), and handler modes.
 */
/**
 * Default output config when none specified.
 * Sponge mode for backward compatibility.
 */
export const DEFAULT_OUTPUT_CONFIG = { type: "sponge" };
// =============================================================================
// Type Guards
// =============================================================================
/**
 * Check if a route leaf uses the new { in, out } format.
 */
export function isRouteLeafWithConfig(leaf) {
    return leaf !== null && typeof leaf === "object" && "in" in leaf;
}
/**
 * Check if output config is sponge mode.
 */
export function isSpongeConfig(config) {
    return config === undefined || ("type" in config && config.type === "sponge");
}
/**
 * Check if output config is stream mode.
 */
export function isStreamConfig(config) {
    return config !== undefined && "type" in config && config.type === "stream";
}
/**
 * Check if output config is handler mode.
 */
export function isHandlerConfig(config) {
    return config !== undefined && !("type" in config);
}
/**
 * Check if a handler callback is a procedure path.
 */
export function isProcedureCallback(callback) {
    return Array.isArray(callback);
}
// =============================================================================
// Extraction Utilities
// =============================================================================
/**
 * Extract input from a route leaf (handles both formats).
 */
export function extractInput(leaf) {
    if (isRouteLeafWithConfig(leaf)) {
        return leaf.in;
    }
    return leaf;
}
/**
 * Extract output config from a route leaf.
 * Returns sponge config for legacy leaves.
 */
export function extractOutputConfig(leaf) {
    if (isRouteLeafWithConfig(leaf)) {
        return leaf.out ?? DEFAULT_OUTPUT_CONFIG;
    }
    return DEFAULT_OUTPUT_CONFIG;
}
// =============================================================================
// Output Config Defaults
// =============================================================================
/**
 * Create a sponge output config.
 */
export function sponge(options) {
    return { type: "sponge", ...options };
}
/**
 * Create a stream output config.
 */
export function stream(options) {
    return { type: "stream", ...options };
}
/**
 * Create a handler output config.
 */
export function handlers(config) {
    return config;
}
/**
 * Type-safe consumption mode check.
 */
export function getConsumptionMode(config) {
    if (isStreamConfig(config))
        return 'stream';
    if (isHandlerConfig(config))
        return 'handlers';
    return 'sponge';
}
//# sourceMappingURL=consumption.js.map