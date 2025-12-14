/**
 * Nested Call API Types
 *
 * Type definitions for the new nested route call structure.
 * Enables typed per-call middleware config and natural batching.
 */
// =============================================================================
// Route Path Utilities
// =============================================================================
/**
 * Convert a nested route structure to an array of [path, input] pairs.
 * Flattens the tree for iteration.
 *
 * @param route - Nested route object
 * @returns Array of [path, input] tuples
 */
export function flattenRoute(route) {
    const results = [];
    function traverse(node, path) {
        // Check if this is a leaf node (procedure input)
        // A leaf has no nested RouteNode children - all values are primitives or arrays
        const isLeaf = Object.values(node).every((v) => typeof v !== "object" || v === null || Array.isArray(v));
        if (isLeaf) {
            results.push([path, node]);
        }
        else {
            // Continue traversing nested nodes
            for (const [key, value] of Object.entries(node)) {
                if (value && typeof value === "object" && !Array.isArray(value)) {
                    traverse(value, [...path, key]);
                }
            }
        }
    }
    traverse(route, []);
    return results;
}
/**
 * Build a nested response structure from flat results.
 *
 * @param results - Array of [path, result] tuples
 * @returns Nested response object
 */
export function buildResponse(results) {
    const response = {};
    for (const [path, result] of results) {
        let current = response;
        for (let i = 0; i < path.length; i++) {
            const segment = path[i];
            const isLast = i === path.length - 1;
            if (isLast) {
                current[segment] = result;
            }
            else {
                if (!(segment in current)) {
                    current[segment] = {};
                }
                current = current[segment];
            }
        }
    }
    return response;
}
/**
 * Check if a route contains multiple procedure calls.
 * Used to determine if batch execution is needed.
 *
 * @param route - Route to check
 * @returns true if route contains multiple procedures
 */
export function isBatchRoute(route) {
    const paths = flattenRoute(route);
    return paths.length > 1;
}
// =============================================================================
// Type-Safe Route Builders
// =============================================================================
/**
 * Helper to create a type-safe route for a single procedure.
 *
 * @param path - Procedure path
 * @param input - Procedure input
 * @returns Route object
 *
 * @example
 * ```typescript
 * const route = createRoute(['users', 'get'], { id: '123' });
 * // { users: { get: { id: '123' } } }
 * ```
 */
export function createRoute(path, input) {
    const route = {};
    let current = route;
    for (let i = 0; i < path.length; i++) {
        const segment = path[i];
        const isLast = i === path.length - 1;
        if (isLast) {
            current[segment] = input;
        }
        else {
            current[segment] = {};
            current = current[segment];
        }
    }
    return route;
}
/**
 * Merge multiple routes into a single batched route.
 *
 * @param routes - Routes to merge
 * @returns Merged route
 */
export function mergeRoutes(...routes) {
    const merged = {};
    function deepMerge(target, source) {
        for (const [key, value] of Object.entries(source)) {
            if (key in target &&
                typeof target[key] === "object" &&
                typeof value === "object" &&
                !Array.isArray(target[key]) &&
                !Array.isArray(value)) {
                deepMerge(target[key], value);
            }
            else {
                target[key] = value;
            }
        }
    }
    for (const route of routes) {
        deepMerge(merged, route);
    }
    return merged;
}
//# sourceMappingURL=call-types.js.map