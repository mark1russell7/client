/**
 * Aggregation Result Types
 *
 * Standardized, consistent result types for all aggregation primitives.
 * These provide a uniform interface for handling aggregation outcomes.
 */
/**
 * Create a successful step result.
 */
export function successResult(value, duration) {
    return { success: true, value, duration };
}
/**
 * Create a failed step result.
 */
export function errorResult(error, duration) {
    const message = error instanceof Error ? error.message : error;
    return { success: false, error: message, duration };
}
/**
 * Create a chain result from step results.
 */
export function createChainResult(results) {
    const success = results.every(r => r.success);
    const duration = results.reduce((sum, r) => sum + r.duration, 0);
    const lastResult = results[results.length - 1];
    const final = lastResult?.success ? lastResult.value : undefined;
    return { results, final, success, duration };
}
/**
 * Create a parallel result from task results.
 */
export function createParallelResult(results) {
    const errors = [];
    results.forEach((result, index) => {
        if (!result.success) {
            errors.push({ index, error: result.error });
        }
    });
    return {
        results,
        allSucceeded: errors.length === 0,
        errors,
        duration: Math.max(...results.map(r => r.duration), 0),
    };
}
/**
 * Create a map result from item results.
 */
export function createMapResult(items) {
    const values = items
        .filter((item) => item.success)
        .map(item => item.value);
    return {
        items,
        values,
        allSucceeded: items.every(item => item.success),
        duration: items.reduce((sum, item) => sum + item.duration, 0),
    };
}
// =============================================================================
// Type Guards
// =============================================================================
/**
 * Check if a step result is successful.
 */
export function isSuccess(result) {
    return result.success;
}
/**
 * Check if a step result is an error.
 */
export function isError(result) {
    return !result.success;
}
// =============================================================================
// Result Utilities
// =============================================================================
/**
 * Extract the value from a successful result, or throw on error.
 */
export function unwrap(result) {
    if (result.success) {
        return result.value;
    }
    throw new Error(result.error);
}
/**
 * Extract the value from a successful result, or return a default.
 */
export function unwrapOr(result, defaultValue) {
    if (result.success) {
        return result.value;
    }
    return defaultValue;
}
/**
 * Map a successful result's value, passing through errors.
 */
export function mapResult(result, fn) {
    if (result.success) {
        return { success: true, value: fn(result.value), duration: result.duration };
    }
    return result;
}
//# sourceMappingURL=results.js.map