/**
 * Route Resolver
 *
 * Resolves nested route structures to procedure definitions.
 * Validates routes against the procedure registry.
 */
import { flattenRoute } from "./call-types.js";
// =============================================================================
// Route Resolver Class
// =============================================================================
/**
 * Resolves nested route structures to procedures.
 *
 * Features:
 * - Path-based procedure lookup
 * - Input validation against schemas
 * - Batch resolution for multi-route calls
 * - Detailed error reporting
 *
 * @example
 * ```typescript
 * const resolver = new RouteResolver(registry);
 *
 * const result = resolver.resolve({
 *   collections: {
 *     users: {
 *       get: { id: '123' }
 *     }
 *   }
 * });
 *
 * if (result.success) {
 *   for (const { path, procedure, input } of result.resolved) {
 *     // Execute procedure with input
 *   }
 * }
 * ```
 */
export class RouteResolver {
    registry;
    constructor(registry) {
        this.registry = registry;
    }
    /**
     * Resolve a route structure to procedures.
     *
     * @param route - Nested route object
     * @param options - Resolution options
     * @returns Resolution result with procedures or errors
     */
    resolve(route, options = {}) {
        const flattened = flattenRoute(route);
        const resolved = [];
        const errors = [];
        for (const entry of flattened) {
            const { path, input } = entry;
            const procedure = this.registry.get(path);
            if (!procedure) {
                errors.push({
                    path,
                    type: "not_found",
                    message: `No procedure registered at path: ${path.join(".")}`,
                });
                continue;
            }
            // Validate input if schema validation is enabled
            if (options.validateInput !== false) {
                const validationResult = procedure.input.safeParse(input);
                if (!validationResult.success) {
                    errors.push({
                        path,
                        type: "validation_error",
                        message: `Input validation failed: ${validationResult.error.message}`,
                    });
                    if (!options.continueOnError) {
                        break;
                    }
                    continue;
                }
            }
            resolved.push({
                path,
                procedure,
                input: entry.leaf,
            });
        }
        return {
            resolved,
            errors,
            success: errors.length === 0,
        };
    }
    /**
     * Resolve a single path to a procedure.
     *
     * @param path - Procedure path
     * @returns Procedure or undefined if not found
     */
    getProcedure(path) {
        return this.registry.get(path);
    }
    /**
     * Check if a path resolves to a valid procedure.
     *
     * @param path - Procedure path
     * @returns true if procedure exists at path
     */
    hasProcedure(path) {
        return this.registry.has(path);
    }
    /**
     * Validate route structure without resolving.
     * Useful for compile-time or early validation.
     *
     * @param route - Route to validate
     * @returns Validation errors or empty array if valid
     */
    validate(route) {
        const flattened = flattenRoute(route);
        const errors = [];
        for (const entry of flattened) {
            const { path, input } = entry;
            const procedure = this.registry.get(path);
            if (!procedure) {
                errors.push({
                    path,
                    type: "not_found",
                    message: `No procedure registered at path: ${path.join(".")}`,
                });
                continue;
            }
            const validationResult = procedure.input.safeParse(input);
            if (!validationResult.success) {
                errors.push({
                    path,
                    type: "validation_error",
                    message: `Input validation failed: ${validationResult.error.message}`,
                });
            }
        }
        return errors;
    }
    /**
     * Get all procedures that would be invoked by a route.
     * Does not validate inputs.
     *
     * @param route - Route structure
     * @returns Array of [path, procedure] tuples for found procedures
     */
    getProceduresForRoute(route) {
        const flattened = flattenRoute(route);
        const results = [];
        for (const entry of flattened) {
            const procedure = this.registry.get(entry.path);
            if (procedure) {
                results.push([entry.path, procedure]);
            }
        }
        return results;
    }
}
// =============================================================================
// Helper Functions
// =============================================================================
/**
 * Create a route resolver for a registry.
 *
 * @param registry - Procedure registry
 * @returns Route resolver instance
 */
export function createRouteResolver(registry) {
    return new RouteResolver(registry);
}
/**
 * Quickly validate a route against a registry.
 *
 * @param route - Route to validate
 * @param registry - Procedure registry
 * @returns true if all paths in route are valid procedures
 */
export function isValidRoute(route, registry) {
    const flattened = flattenRoute(route);
    for (const entry of flattened) {
        if (!registry.has(entry.path)) {
            return false;
        }
    }
    return true;
}
/**
 * Get missing paths from a route.
 *
 * @param route - Route to check
 * @param registry - Procedure registry
 * @returns Array of paths not found in registry
 */
export function getMissingPaths(route, registry) {
    const flattened = flattenRoute(route);
    const missing = [];
    for (const entry of flattened) {
        if (!registry.has(entry.path)) {
            missing.push(entry.path);
        }
    }
    return missing;
}
// =============================================================================
// Path Matching Utilities
// =============================================================================
/**
 * Check if a path matches a pattern with wildcards.
 * Supports '*' for single segment and '**' for multiple segments.
 *
 * @param path - Path to check
 * @param pattern - Pattern to match against
 * @returns true if path matches pattern
 *
 * @example
 * ```typescript
 * matchPath(['users', 'get'], ['users', '*']);     // true
 * matchPath(['users', 'orders', 'list'], ['users', '**']); // true
 * ```
 */
export function matchPath(path, pattern) {
    let pathIndex = 0;
    let patternIndex = 0;
    while (patternIndex < pattern.length) {
        const segment = pattern[patternIndex];
        if (segment === "**") {
            // Match rest of path
            if (patternIndex === pattern.length - 1) {
                return true;
            }
            // Try to match remaining pattern at each position
            for (let i = pathIndex; i <= path.length; i++) {
                if (matchPath(path.slice(i), pattern.slice(patternIndex + 1))) {
                    return true;
                }
            }
            return false;
        }
        if (pathIndex >= path.length) {
            return false;
        }
        if (segment === "*" || segment === path[pathIndex]) {
            pathIndex++;
            patternIndex++;
        }
        else {
            return false;
        }
    }
    return pathIndex === path.length;
}
/**
 * Filter routes by path pattern.
 *
 * @param route - Route to filter
 * @param pattern - Pattern to match
 * @returns Route with only matching paths
 */
export function filterRouteByPattern(route, pattern) {
    const flattened = flattenRoute(route);
    const filtered = {};
    for (const entry of flattened) {
        if (matchPath(entry.path, pattern)) {
            // Rebuild nested structure for this path
            let current = filtered;
            for (let i = 0; i < entry.path.length; i++) {
                const segment = entry.path[i];
                const isLast = i === entry.path.length - 1;
                if (isLast) {
                    current[segment] = entry.leaf;
                }
                else {
                    if (!(segment in current)) {
                        current[segment] = {};
                    }
                    current = current[segment];
                }
            }
        }
    }
    return filtered;
}
//# sourceMappingURL=route-resolver.js.map