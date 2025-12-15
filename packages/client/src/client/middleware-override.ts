/**
 * Middleware Override Support
 *
 * Enables per-call middleware configuration overrides.
 * Middleware can check for overrides in the request metadata.
 */

import type { MiddlewareOverrides, RetryOverride, TimeoutOverride, CacheOverride } from "./call-types.js";
import type { Metadata } from "./types.js";

// =============================================================================
// Override Keys
// =============================================================================

/**
 * Metadata key where middleware overrides are stored.
 */
export const MIDDLEWARE_OVERRIDES_KEY = "__middlewareOverrides" as const;

// =============================================================================
// Override Access Functions
// =============================================================================

/**
 * Get middleware overrides from request metadata.
 *
 * @param metadata - Request metadata
 * @returns Middleware overrides or undefined
 */
export function getMiddlewareOverrides(
  metadata: Metadata
): MiddlewareOverrides | undefined {
  return metadata[MIDDLEWARE_OVERRIDES_KEY] as MiddlewareOverrides | undefined;
}

/**
 * Get retry override from request metadata.
 *
 * @param metadata - Request metadata
 * @returns Retry override or undefined
 */
export function getRetryOverride(metadata: Metadata): RetryOverride | undefined {
  const overrides = getMiddlewareOverrides(metadata);
  return overrides?.retry;
}

/**
 * Get timeout override from request metadata.
 *
 * @param metadata - Request metadata
 * @returns Timeout override or undefined
 */
export function getTimeoutOverride(metadata: Metadata): TimeoutOverride | undefined {
  const overrides = getMiddlewareOverrides(metadata);
  return overrides?.timeout;
}

/**
 * Get cache override from request metadata.
 *
 * @param metadata - Request metadata
 * @returns Cache override or undefined
 */
export function getCacheOverride(metadata: Metadata): CacheOverride | undefined {
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
export function getOverride<T = unknown>(
  metadata: Metadata,
  key: string
): T | undefined {
  const overrides = getMiddlewareOverrides(metadata);
  return overrides?.[key] as T | undefined;
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
export function mergeOverride<T extends object>(
  defaults: T,
  override: Partial<T> | undefined
): T {
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
export function mergeRetryConfig(
  defaults: RetryOverride,
  metadata: Metadata
): RetryOverride {
  const override = getRetryOverride(metadata);
  return mergeOverride(defaults, override);
}

/**
 * Merge timeout configuration with override.
 */
export function mergeTimeoutConfig(
  defaults: TimeoutOverride,
  metadata: Metadata
): TimeoutOverride {
  const override = getTimeoutOverride(metadata);
  return mergeOverride(defaults, override);
}

/**
 * Merge cache configuration with override.
 */
export function mergeCacheConfig(
  defaults: CacheOverride,
  metadata: Metadata
): CacheOverride {
  const override = getCacheOverride(metadata);
  return mergeOverride(defaults, override);
}

// =============================================================================
// Override-Aware Middleware Factory
// =============================================================================

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
export function createOverrideGetter<TConfig extends object>(
  config: OverrideAwareConfig<TConfig>
): (metadata: Metadata) => TConfig {
  return (metadata: Metadata): TConfig => {
    const override = getOverride<Partial<TConfig>>(metadata, config.overrideKey);
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
export function hasOverride(metadata: Metadata, key: string): boolean {
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
export function setMiddlewareOverrides(
  metadata: Metadata,
  overrides: MiddlewareOverrides
): Metadata {
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
export function clearMiddlewareOverrides(metadata: Metadata): Metadata {
  const { [MIDDLEWARE_OVERRIDES_KEY]: _, ...rest } = metadata;
  return rest;
}

// =============================================================================
// Type Utilities
// =============================================================================

/**
 * Extract the configuration type that a middleware accepts.
 */
export type ExtractMiddlewareConfig<T> = T extends (config: infer C) => unknown
  ? C
  : never;

/**
 * Make all properties of a config type optional for override purposes.
 */
export type OverrideOf<T> = Partial<T>;
