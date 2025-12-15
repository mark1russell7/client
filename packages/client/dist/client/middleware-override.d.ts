/**
 * Middleware Override Support
 *
 * Enables per-call middleware configuration overrides.
 * Middleware can check for overrides in the request metadata.
 */
import type { MiddlewareOverrides, RetryOverride, TimeoutOverride, CacheOverride } from "./call-types.js";
import type { Metadata } from "./types.js";
/**
 * Metadata key where middleware overrides are stored.
 */
export declare const MIDDLEWARE_OVERRIDES_KEY: "__middlewareOverrides";
/**
 * Get middleware overrides from request metadata.
 *
 * @param metadata - Request metadata
 * @returns Middleware overrides or undefined
 */
export declare function getMiddlewareOverrides(metadata: Metadata): MiddlewareOverrides | undefined;
/**
 * Get retry override from request metadata.
 *
 * @param metadata - Request metadata
 * @returns Retry override or undefined
 */
export declare function getRetryOverride(metadata: Metadata): RetryOverride | undefined;
/**
 * Get timeout override from request metadata.
 *
 * @param metadata - Request metadata
 * @returns Timeout override or undefined
 */
export declare function getTimeoutOverride(metadata: Metadata): TimeoutOverride | undefined;
/**
 * Get cache override from request metadata.
 *
 * @param metadata - Request metadata
 * @returns Cache override or undefined
 */
export declare function getCacheOverride(metadata: Metadata): CacheOverride | undefined;
/**
 * Get a custom middleware override from request metadata.
 *
 * @param metadata - Request metadata
 * @param key - Override key
 * @returns Override value or undefined
 */
export declare function getOverride<T = unknown>(metadata: Metadata, key: string): T | undefined;
/**
 * Merge default config with per-call override.
 * Override values take precedence over defaults.
 *
 * @param defaults - Default configuration
 * @param override - Per-call override
 * @returns Merged configuration
 */
export declare function mergeOverride<T extends object>(defaults: T, override: Partial<T> | undefined): T;
/**
 * Merge retry configuration with override.
 */
export declare function mergeRetryConfig(defaults: RetryOverride, metadata: Metadata): RetryOverride;
/**
 * Merge timeout configuration with override.
 */
export declare function mergeTimeoutConfig(defaults: TimeoutOverride, metadata: Metadata): TimeoutOverride;
/**
 * Merge cache configuration with override.
 */
export declare function mergeCacheConfig(defaults: CacheOverride, metadata: Metadata): CacheOverride;
/**
 * Configuration for an override-aware middleware.
 */
export interface OverrideAwareConfig<TConfig> {
    /** Default configuration */
    defaults: TConfig;
    /** Key in middleware overrides */
    overrideKey: string;
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
export declare function createOverrideGetter<TConfig extends object>(config: OverrideAwareConfig<TConfig>): (metadata: Metadata) => TConfig;
/**
 * Check if a specific override is present in metadata.
 *
 * @param metadata - Request metadata
 * @param key - Override key to check
 * @returns true if override is present
 */
export declare function hasOverride(metadata: Metadata, key: string): boolean;
/**
 * Set middleware overrides in metadata.
 * Useful for testing or programmatic override injection.
 *
 * @param metadata - Metadata to modify
 * @param overrides - Overrides to set
 * @returns Modified metadata
 */
export declare function setMiddlewareOverrides(metadata: Metadata, overrides: MiddlewareOverrides): Metadata;
/**
 * Clear middleware overrides from metadata.
 *
 * @param metadata - Metadata to modify
 * @returns Metadata without overrides
 */
export declare function clearMiddlewareOverrides(metadata: Metadata): Metadata;
/**
 * Extract the configuration type that a middleware accepts.
 */
export type ExtractMiddlewareConfig<T> = T extends (config: infer C) => unknown ? C : never;
/**
 * Make all properties of a config type optional for override purposes.
 */
export type OverrideOf<T> = Partial<T>;
//# sourceMappingURL=middleware-override.d.ts.map