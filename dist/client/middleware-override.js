/**
 * Middleware Override Support
 *
 * Enables per-call middleware configuration overrides.
 * Middleware can check for overrides in the request metadata.
 */
// =============================================================================
// Override Keys
// =============================================================================
/**
 * Metadata key where middleware overrides are stored.
 */
export const MIDDLEWARE_OVERRIDES_KEY = "__middlewareOverrides";
// =============================================================================
// Override Access Functions
// =============================================================================
/**
 * Get middleware overrides from request metadata.
 *
 * @param metadata - Request metadata
 * @returns Middleware overrides or undefined
 */
export function getMiddlewareOverrides(metadata) {
    return metadata[MIDDLEWARE_OVERRIDES_KEY];
}
/**
 * Get retry override from request metadata.
 *
 * @param metadata - Request metadata
 * @returns Retry override or undefined
 */
export function getRetryOverride(metadata) {
    const overrides = getMiddlewareOverrides(metadata);
    return overrides?.retry;
}
/**
 * Get timeout override from request metadata.
 *
 * @param metadata - Request metadata
 * @returns Timeout override or undefined
 */
export function getTimeoutOverride(metadata) {
    const overrides = getMiddlewareOverrides(metadata);
    return overrides?.timeout;
}
/**
 * Get cache override from request metadata.
 *
 * @param metadata - Request metadata
 * @returns Cache override or undefined
 */
export function getCacheOverride(metadata) {
    const overrides = getMiddlewareOverrides(metadata);
    return overrides?.cache;
}
/**
 * Get a custom middleware override from request metadata.
 *
 * @param metadata - Request metadata
 * @param key - Override key
 * @returns Override value or undefined
 */
export function getOverride(metadata, key) {
    const overrides = getMiddlewareOverrides(metadata);
    return overrides?.[key];
}
// =============================================================================
// Override Merge Utilities
// =============================================================================
/**
 * Merge default config with per-call override.
 * Override values take precedence over defaults.
 *
 * @param defaults - Default configuration
 * @param override - Per-call override
 * @returns Merged configuration
 */
export function mergeOverride(defaults, override) {
    if (!override) {
        return defaults;
    }
    return {
        ...defaults,
        ...override,
    };
}
/**
 * Merge retry configuration with override.
 */
export function mergeRetryConfig(defaults, metadata) {
    const override = getRetryOverride(metadata);
    return mergeOverride(defaults, override);
}
/**
 * Merge timeout configuration with override.
 */
export function mergeTimeoutConfig(defaults, metadata) {
    const override = getTimeoutOverride(metadata);
    return mergeOverride(defaults, override);
}
/**
 * Merge cache configuration with override.
 */
export function mergeCacheConfig(defaults, metadata) {
    const override = getCacheOverride(metadata);
    return mergeOverride(defaults, override);
}
/**
 * Create a function that gets effective config by merging defaults with overrides.
 *
 * @param config - Override-aware configuration
 * @returns Function that returns effective config for a request
 *
 * @example
 * ```typescript
 * const getRetryConfig = createOverrideGetter({
 *   defaults: { attempts: 3, delay: 1000 },
 *   overrideKey: 'retry'
 * });
 *
 * // In middleware:
 * const config = getRetryConfig(context.message.metadata);
 * // Uses defaults merged with any per-call retry override
 * ```
 */
export function createOverrideGetter(config) {
    return (metadata) => {
        const override = getOverride(metadata, config.overrideKey);
        return mergeOverride(config.defaults, override);
    };
}
// =============================================================================
// Middleware Helpers
// =============================================================================
/**
 * Check if a specific override is present in metadata.
 *
 * @param metadata - Request metadata
 * @param key - Override key to check
 * @returns true if override is present
 */
export function hasOverride(metadata, key) {
    const overrides = getMiddlewareOverrides(metadata);
    return overrides !== undefined && key in overrides;
}
/**
 * Set middleware overrides in metadata.
 * Useful for testing or programmatic override injection.
 *
 * @param metadata - Metadata to modify
 * @param overrides - Overrides to set
 * @returns Modified metadata
 */
export function setMiddlewareOverrides(metadata, overrides) {
    return {
        ...metadata,
        [MIDDLEWARE_OVERRIDES_KEY]: overrides,
    };
}
/**
 * Clear middleware overrides from metadata.
 *
 * @param metadata - Metadata to modify
 * @returns Metadata without overrides
 */
export function clearMiddlewareOverrides(metadata) {
    const { [MIDDLEWARE_OVERRIDES_KEY]: _, ...rest } = metadata;
    return rest;
}
//# sourceMappingURL=middleware-override.js.map