/**
 * Route Resolver
 *
 * Resolves nested route structures to procedure definitions.
 * Validates routes against the procedure registry.
 */
import type { AnyProcedure, ProcedurePath } from "../procedures/types";
import type { ProcedureRegistry } from "../procedures/registry";
import type { Route, RouteLeaf } from "./call-types";
/**
 * Resolved route entry with procedure and input.
 */
export interface ResolvedRoute {
    /** Path to the procedure */
    path: ProcedurePath;
    /** The procedure definition */
    procedure: AnyProcedure;
    /** Input payload for the procedure */
    input: RouteLeaf;
}
/**
 * Resolution error for a specific path.
 */
export interface RouteResolutionError {
    /** Path that failed to resolve */
    path: ProcedurePath;
    /** Error type */
    type: "not_found" | "invalid_input" | "validation_error";
    /** Error message */
    message: string;
}
/**
 * Result of route resolution.
 */
export interface RouteResolutionResult {
    /** Successfully resolved routes */
    resolved: ResolvedRoute[];
    /** Errors encountered during resolution */
    errors: RouteResolutionError[];
    /** Whether all routes resolved successfully */
    success: boolean;
}
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
export declare class RouteResolver {
    private readonly registry;
    constructor(registry: ProcedureRegistry);
    /**
     * Resolve a route structure to procedures.
     *
     * @param route - Nested route object
     * @param options - Resolution options
     * @returns Resolution result with procedures or errors
     */
    resolve(route: Route, options?: RouteResolverOptions): RouteResolutionResult;
    /**
     * Resolve a single path to a procedure.
     *
     * @param path - Procedure path
     * @returns Procedure or undefined if not found
     */
    getProcedure(path: ProcedurePath): AnyProcedure | undefined;
    /**
     * Check if a path resolves to a valid procedure.
     *
     * @param path - Procedure path
     * @returns true if procedure exists at path
     */
    hasProcedure(path: ProcedurePath): boolean;
    /**
     * Validate route structure without resolving.
     * Useful for compile-time or early validation.
     *
     * @param route - Route to validate
     * @returns Validation errors or empty array if valid
     */
    validate(route: Route): RouteResolutionError[];
    /**
     * Get all procedures that would be invoked by a route.
     * Does not validate inputs.
     *
     * @param route - Route structure
     * @returns Array of [path, procedure] tuples for found procedures
     */
    getProceduresForRoute(route: Route): Array<[ProcedurePath, AnyProcedure]>;
}
/**
 * Options for route resolution.
 */
export interface RouteResolverOptions {
    /** Whether to validate input against schemas (default: true) */
    validateInput?: boolean;
    /** Continue resolving even if some routes fail (default: false) */
    continueOnError?: boolean;
}
/**
 * Create a route resolver for a registry.
 *
 * @param registry - Procedure registry
 * @returns Route resolver instance
 */
export declare function createRouteResolver(registry: ProcedureRegistry): RouteResolver;
/**
 * Quickly validate a route against a registry.
 *
 * @param route - Route to validate
 * @param registry - Procedure registry
 * @returns true if all paths in route are valid procedures
 */
export declare function isValidRoute(route: Route, registry: ProcedureRegistry): boolean;
/**
 * Get missing paths from a route.
 *
 * @param route - Route to check
 * @param registry - Procedure registry
 * @returns Array of paths not found in registry
 */
export declare function getMissingPaths(route: Route, registry: ProcedureRegistry): ProcedurePath[];
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
export declare function matchPath(path: ProcedurePath, pattern: ProcedurePath): boolean;
/**
 * Filter routes by path pattern.
 *
 * @param route - Route to filter
 * @param pattern - Pattern to match
 * @returns Route with only matching paths
 */
export declare function filterRouteByPattern(route: Route, pattern: ProcedurePath): Route;
//# sourceMappingURL=route-resolver.d.ts.map