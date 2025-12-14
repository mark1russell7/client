/**
 * Route Resolver
 *
 * Resolves nested route structures to procedure definitions.
 * Validates routes against the procedure registry.
 */

import type { AnyProcedure, ProcedurePath } from "../procedures/types";
import type { ProcedureRegistry } from "../procedures/registry";
import type { Route, RouteLeaf, RouteNode } from "./call-types";
import { flattenRoute } from "./call-types";

// =============================================================================
// Resolution Types
// =============================================================================

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
  constructor(private readonly registry: ProcedureRegistry) {}

  /**
   * Resolve a route structure to procedures.
   *
   * @param route - Nested route object
   * @param options - Resolution options
   * @returns Resolution result with procedures or errors
   */
  resolve(
    route: Route,
    options: RouteResolverOptions = {}
  ): RouteResolutionResult {
    const flattened = flattenRoute(route);
    const resolved: ResolvedRoute[] = [];
    const errors: RouteResolutionError[] = [];

    for (const [path, input] of flattened) {
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
        input,
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
  getProcedure(path: ProcedurePath): AnyProcedure | undefined {
    return this.registry.get(path);
  }

  /**
   * Check if a path resolves to a valid procedure.
   *
   * @param path - Procedure path
   * @returns true if procedure exists at path
   */
  hasProcedure(path: ProcedurePath): boolean {
    return this.registry.has(path);
  }

  /**
   * Validate route structure without resolving.
   * Useful for compile-time or early validation.
   *
   * @param route - Route to validate
   * @returns Validation errors or empty array if valid
   */
  validate(route: Route): RouteResolutionError[] {
    const flattened = flattenRoute(route);
    const errors: RouteResolutionError[] = [];

    for (const [path, input] of flattened) {
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
  getProceduresForRoute(route: Route): Array<[ProcedurePath, AnyProcedure]> {
    const flattened = flattenRoute(route);
    const results: Array<[ProcedurePath, AnyProcedure]> = [];

    for (const [path] of flattened) {
      const procedure = this.registry.get(path);
      if (procedure) {
        results.push([path, procedure]);
      }
    }

    return results;
  }
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

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create a route resolver for a registry.
 *
 * @param registry - Procedure registry
 * @returns Route resolver instance
 */
export function createRouteResolver(registry: ProcedureRegistry): RouteResolver {
  return new RouteResolver(registry);
}

/**
 * Quickly validate a route against a registry.
 *
 * @param route - Route to validate
 * @param registry - Procedure registry
 * @returns true if all paths in route are valid procedures
 */
export function isValidRoute(route: Route, registry: ProcedureRegistry): boolean {
  const flattened = flattenRoute(route);

  for (const [path] of flattened) {
    if (!registry.has(path)) {
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
export function getMissingPaths(
  route: Route,
  registry: ProcedureRegistry
): ProcedurePath[] {
  const flattened = flattenRoute(route);
  const missing: ProcedurePath[] = [];

  for (const [path] of flattened) {
    if (!registry.has(path)) {
      missing.push(path);
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
export function matchPath(path: ProcedurePath, pattern: ProcedurePath): boolean {
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
    } else {
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
export function filterRouteByPattern(route: Route, pattern: ProcedurePath): Route {
  const flattened = flattenRoute(route);
  const filtered: Route = {};

  for (const [path, input] of flattened) {
    if (matchPath(path, pattern)) {
      // Rebuild nested structure for this path
      let current: RouteNode = filtered;
      for (let i = 0; i < path.length; i++) {
        const segment = path[i]!;
        const isLast = i === path.length - 1;

        if (isLast) {
          current[segment] = input;
        } else {
          if (!(segment in current)) {
            current[segment] = {};
          }
          current = current[segment] as RouteNode;
        }
      }
    }
  }

  return filtered;
}
