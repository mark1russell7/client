/**
 * Client Context System
 *
 * Provides hierarchical context passing for middleware configuration.
 * Context can be set at client-level, inherited by child clients, and
 * overridden per-call.
 *
 * @example
 * ```typescript
 * // Client-level context
 * const authedClient = client.withContext({
 *   auth: { token: "user-token" },
 *   timeout: { overall: 5000 }
 * });
 *
 * // Per-call override
 * await authedClient.call(method, payload, {
 *   context: { retry: { maxAttempts: 10 } }
 * });
 * ```
 */
// =============================================================================
// Context Merging
// =============================================================================
/**
 * Deep merge context objects with later values taking priority.
 *
 * Merges nested objects recursively, while replacing primitives and arrays.
 * Undefined values are skipped (don't override existing values).
 *
 * @example
 * ```typescript
 * const base = { auth: { token: "a", userId: "1" }, timeout: { overall: 5000 } };
 * const override = { auth: { token: "b" }, retry: { maxAttempts: 3 } };
 *
 * mergeContext(base, override);
 * // Result: {
 * //   auth: { token: "b", userId: "1" },
 * //   timeout: { overall: 5000 },
 * //   retry: { maxAttempts: 3 }
 * // }
 * ```
 */
export function mergeContext(base, ...overrides) {
    const result = { ...(base ?? {}) };
    for (const override of overrides) {
        if (!override)
            continue;
        for (const [key, value] of Object.entries(override)) {
            if (value === undefined)
                continue;
            if (isPlainObject(value) && isPlainObject(result[key])) {
                // Deep merge objects
                result[key] = mergeContext(result[key], value);
            }
            else {
                // Replace primitives, arrays, and other values
                result[key] = value;
            }
        }
    }
    return result;
}
/**
 * Check if a value is a plain object (not array, null, Date, etc.).
 */
function isPlainObject(value) {
    if (value === null || typeof value !== "object") {
        return false;
    }
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
}
// =============================================================================
// Type Helpers
// =============================================================================
/**
 * Known keys that distinguish CallOptions from legacy Metadata.
 * If any of these keys are present, the object is CallOptions.
 */
const CALL_OPTIONS_KEYS = ["context", "metadata", "signal", "schema"];
/**
 * Check if options object is CallOptions or legacy Metadata.
 *
 * CallOptions has at least one of the known CallOptions keys.
 * Metadata is a plain object without these specific keys.
 */
export function isCallOptions(options) {
    if (!options || typeof options !== "object") {
        return false;
    }
    return CALL_OPTIONS_KEYS.some((key) => key in options);
}
/**
 * Normalize call options to always be CallOptions format.
 * Handles backward compatibility with legacy Metadata parameter.
 */
export function normalizeCallOptions(options) {
    if (!options) {
        return {};
    }
    if (isCallOptions(options)) {
        return options;
    }
    // Legacy: raw Metadata object
    return { metadata: options };
}
//# sourceMappingURL=context.js.map