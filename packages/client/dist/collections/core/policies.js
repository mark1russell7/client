/**
 * Policy types for configurable collection behaviors.
 *
 * Policies define how collections handle edge cases like overflow,
 * underflow, and eviction. These are used by behavior decorators
 * to provide flexible, composable behavior.
 */
// ============================================================================
// Default policies
// ============================================================================
/**
 * Default overflow policy: throw an error.
 */
export const DEFAULT_OVERFLOW_POLICY = "throw";
/**
 * Default underflow policy: throw an error.
 */
export const DEFAULT_UNDERFLOW_POLICY = "throw";
/**
 * Default eviction policy: FIFO (oldest first).
 */
export const DEFAULT_EVICTION_POLICY = "fifo";
/**
 * Default retry policy: 3 attempts with exponential backoff.
 */
export const DEFAULT_RETRY_POLICY = {
    maxAttempts: 3,
    initialDelay: 100,
    backoff: "exponential",
    maxDelay: 5000,
    jitter: true,
};
/**
 * Default conflict resolution: last write wins.
 */
export const DEFAULT_CONFLICT_POLICY = "last-write-wins";
/**
 * Default growth policy: double capacity.
 */
export const DEFAULT_GROWTH_POLICY = {
    strategy: "double",
    maxCapacity: Number.MAX_SAFE_INTEGER,
};
/**
 * Default validation policy: throw on invalid.
 */
export const DEFAULT_VALIDATION_POLICY = "throw";
//# sourceMappingURL=policies.js.map