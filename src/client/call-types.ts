/**
 * Nested Call API Types
 *
 * Type definitions for the new nested route call structure.
 * Enables typed per-call middleware config and natural batching.
 */

import type { ProcedurePath } from "../procedures/types";

// =============================================================================
// Middleware Override Types
// =============================================================================

/**
 * Per-call retry configuration override.
 */
export interface RetryOverride {
  /** Maximum number of retry attempts */
  attempts?: number;
  /** Delay between retries in milliseconds */
  delay?: number;
  /** Exponential backoff multiplier */
  backoffMultiplier?: number;
  /** Maximum delay between retries */
  maxDelay?: number;
}

/**
 * Per-call timeout configuration override.
 */
export interface TimeoutOverride {
  /** Overall request timeout in milliseconds */
  ms?: number;
  /** Per-attempt timeout for retries */
  perAttempt?: number;
}

/**
 * Per-call cache configuration override.
 */
export interface CacheOverride {
  /** Time-to-live in milliseconds */
  ttl?: number;
  /** Skip cache for this request */
  bypass?: boolean;
  /** Force cache refresh */
  refresh?: boolean;
}

/**
 * Per-call middleware configuration overrides.
 * Each middleware can define its own override type.
 */
export interface MiddlewareOverrides {
  retry?: RetryOverride;
  timeout?: TimeoutOverride;
  cache?: CacheOverride;
  /** Extensible for custom middleware overrides */
  [key: string]: unknown;
}

// =============================================================================
// Batch Strategy Types
// =============================================================================

/**
 * Batch execution strategy.
 */
export type BatchStrategy = "all" | "race" | "stream";

/**
 * Stream configuration for batch execution.
 */
export interface StreamConfig {
  /** Buffer size for streaming results */
  bufferSize?: number;
  /** Emit partial results as they arrive */
  emitPartial?: boolean;
  /** Maximum concurrent requests */
  concurrency?: number;
}

/**
 * Batch execution configuration.
 */
export interface BatchConfig {
  /** Execution strategy */
  strategy: BatchStrategy;
  /** Stream-specific configuration */
  streamConfig?: StreamConfig;
  /** Continue on individual route errors */
  continueOnError?: boolean;
}

// =============================================================================
// Route Types
// =============================================================================

/**
 * Leaf node in the route tree - contains the actual input payload.
 * Any object that is not another RouteNode is considered a leaf (procedure input).
 */
export type RouteLeaf = Record<string, unknown>;

/**
 * Recursive route node - can contain nested nodes or leaf payloads.
 */
export type RouteNode = {
  [key: string]: RouteNode | RouteLeaf;
};

/**
 * Root route structure for a call.
 * The structure maps to procedure paths in the registry.
 */
export type Route = RouteNode;

// =============================================================================
// Call Request Types
// =============================================================================

/**
 * Nested call request structure.
 *
 * @example
 * ```typescript
 * const request: CallRequest = {
 *   middlewares: {
 *     retry: { attempts: 3 },
 *     timeout: { ms: 5000 }
 *   },
 *   batch: { strategy: 'all' },
 *   route: {
 *     collections: {
 *       users: {
 *         get: { id: "123" }
 *       }
 *     },
 *     weather: {
 *       forecast: { city: "NYC", days: 5 }
 *     }
 *   }
 * };
 * ```
 */
export interface CallRequest<TRoute extends Route = Route> {
  /** Per-call middleware configuration overrides */
  middlewares?: MiddlewareOverrides;

  /** Batch execution configuration (for multiple routes) */
  batch?: BatchConfig;

  /** Nested route structure mapping to procedures */
  route: TRoute;

  /** Abort signal for cancellation */
  signal?: AbortSignal;
}

/**
 * Simplified call request for single-route calls.
 * Omits batch config since there's only one route.
 */
export interface SingleCallRequest<TRoute extends Route = Route> {
  middlewares?: MiddlewareOverrides;
  route: TRoute;
  signal?: AbortSignal;
}

// =============================================================================
// Call Response Types
// =============================================================================

/**
 * Result of a single procedure call.
 */
export interface ProcedureCallResult<TOutput = unknown> {
  /** Whether the call succeeded */
  success: boolean;
  /** Output data (present if success=true) */
  data?: TOutput;
  /** Error info (present if success=false) */
  error?: {
    code: string;
    message: string;
    retryable: boolean;
    path: ProcedurePath;
  };
}

/**
 * Response type that mirrors the route structure.
 * Each leaf node becomes a ProcedureCallResult.
 */
export type CallResponse<TRoute> = TRoute extends RouteLeaf
  ? ProcedureCallResult
  : {
      [K in keyof TRoute]: TRoute[K] extends RouteNode
        ? CallResponse<TRoute[K]>
        : ProcedureCallResult;
    };

/**
 * Streaming response for batch calls with stream strategy.
 */
export interface StreamingCallResponse<TRoute extends Route = Route> {
  /** Async iterator yielding results as they arrive */
  results: AsyncIterable<{
    /** Path to the result in the route structure */
    path: ProcedurePath;
    /** The procedure result */
    result: ProcedureCallResult;
  }>;

  /** Promise that resolves to the complete response when all results arrive */
  complete: Promise<CallResponse<TRoute>>;
}

// =============================================================================
// Type Inference Utilities
// =============================================================================

/**
 * Extract all paths from a route structure.
 * Used internally for route validation and resolution.
 */
export type ExtractRoutePaths<TRoute, TPrefix extends string[] = []> =
  TRoute extends RouteLeaf
    ? TPrefix
    : TRoute extends RouteNode
      ? {
          [K in keyof TRoute]: TRoute[K] extends RouteNode
            ? ExtractRoutePaths<TRoute[K], [...TPrefix, K & string]>
            : [...TPrefix, K & string];
        }[keyof TRoute]
      : never;

/**
 * Validate that a route structure only contains valid procedure paths.
 * This is a compile-time check.
 */
export type ValidateRoute<TRoute, TRegisteredPaths extends string[][]> =
  ExtractRoutePaths<TRoute> extends TRegisteredPaths[number] ? TRoute : never;

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
export function flattenRoute(route: Route): Array<[ProcedurePath, RouteLeaf]> {
  const results: Array<[ProcedurePath, RouteLeaf]> = [];

  function traverse(node: RouteNode | RouteLeaf, path: ProcedurePath): void {
    // Check if this is a leaf node (procedure input)
    // A leaf has no nested RouteNode children - all values are primitives or arrays
    const isLeaf = Object.values(node).every(
      (v) => typeof v !== "object" || v === null || Array.isArray(v)
    );

    if (isLeaf) {
      results.push([path, node as RouteLeaf]);
    } else {
      // Continue traversing nested nodes
      for (const [key, value] of Object.entries(node)) {
        if (value && typeof value === "object" && !Array.isArray(value)) {
          traverse(value as RouteNode, [...path, key]);
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
export function buildResponse<TRoute extends Route>(
  results: Array<[ProcedurePath, ProcedureCallResult]>
): CallResponse<TRoute> {
  const response: Record<string, unknown> = {};

  for (const [path, result] of results) {
    let current = response;

    for (let i = 0; i < path.length; i++) {
      const segment = path[i]!;
      const isLast = i === path.length - 1;

      if (isLast) {
        current[segment] = result;
      } else {
        if (!(segment in current)) {
          current[segment] = {};
        }
        current = current[segment] as Record<string, unknown>;
      }
    }
  }

  return response as CallResponse<TRoute>;
}

/**
 * Check if a route contains multiple procedure calls.
 * Used to determine if batch execution is needed.
 *
 * @param route - Route to check
 * @returns true if route contains multiple procedures
 */
export function isBatchRoute(route: Route): boolean {
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
export function createRoute<TInput extends RouteLeaf>(
  path: ProcedurePath,
  input: TInput
): Route {
  const route: Record<string, unknown> = {};
  let current = route;

  for (let i = 0; i < path.length; i++) {
    const segment = path[i]!;
    const isLast = i === path.length - 1;

    if (isLast) {
      current[segment] = input;
    } else {
      current[segment] = {};
      current = current[segment] as Record<string, unknown>;
    }
  }

  return route as Route;
}

/**
 * Merge multiple routes into a single batched route.
 *
 * @param routes - Routes to merge
 * @returns Merged route
 */
export function mergeRoutes(...routes: Route[]): Route {
  const merged: Record<string, unknown> = {};

  function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): void {
    for (const [key, value] of Object.entries(source)) {
      if (
        key in target &&
        typeof target[key] === "object" &&
        typeof value === "object" &&
        !Array.isArray(target[key]) &&
        !Array.isArray(value)
      ) {
        deepMerge(target[key] as Record<string, unknown>, value as Record<string, unknown>);
      } else {
        target[key] = value;
      }
    }
  }

  for (const route of routes) {
    deepMerge(merged, route as Record<string, unknown>);
  }

  return merged as Route;
}
