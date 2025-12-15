/**
 * Nested Call API Types
 *
 * Type definitions for the new nested route call structure.
 * Enables typed per-call middleware config and natural batching.
 */
import type { ProcedurePath } from "../procedures/types.js";
import type { RouteLeaf, OutputConfig } from "./consumption.js";
export type { RouteLeaf, RouteLeafWithConfig, OutputConfig } from "./consumption.js";
export { isRouteLeafWithConfig, extractInput, extractOutputConfig } from "./consumption.js";
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
/**
 * Recursive route node - can contain nested nodes or leaf payloads.
 * Leaf nodes are either:
 * - RouteLeafWithConfig: { in: input, out?: outputConfig }
 * - LegacyRouteLeaf: plain object (backward compatible)
 */
export type RouteNode = {
    [key: string]: RouteNode | RouteLeaf;
};
/**
 * Root route structure for a call.
 * The structure maps to procedure paths in the registry.
 */
export type Route = RouteNode;
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
export type CallResponse<TRoute> = TRoute extends RouteLeaf ? ProcedureCallResult : {
    [K in keyof TRoute]: TRoute[K] extends RouteNode ? CallResponse<TRoute[K]> : ProcedureCallResult;
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
/**
 * Extract all paths from a route structure.
 * Used internally for route validation and resolution.
 */
export type ExtractRoutePaths<TRoute, TPrefix extends string[] = []> = TRoute extends RouteLeaf ? TPrefix : TRoute extends RouteNode ? {
    [K in keyof TRoute]: TRoute[K] extends RouteNode ? ExtractRoutePaths<TRoute[K], [...TPrefix, K & string]> : [...TPrefix, K & string];
}[keyof TRoute] : never;
/**
 * Validate that a route structure only contains valid procedure paths.
 * This is a compile-time check.
 */
export type ValidateRoute<TRoute, TRegisteredPaths extends string[][]> = ExtractRoutePaths<TRoute> extends TRegisteredPaths[number] ? TRoute : never;
/**
 * Flattened route entry with path, input, and output configuration.
 */
export interface FlattenedRouteEntry {
    /** Procedure path */
    path: ProcedurePath;
    /** Extracted input payload */
    input: unknown;
    /** Output configuration (default: sponge) */
    outputConfig: OutputConfig;
    /** Original leaf node (for reference) */
    leaf: RouteLeaf;
}
/**
 * Convert a nested route structure to an array of flattened entries.
 * Handles both new { in, out } format and legacy plain objects.
 *
 * @param route - Nested route object
 * @returns Array of flattened route entries
 */
export declare function flattenRoute(route: Route): FlattenedRouteEntry[];
/**
 * Legacy flatten function for backward compatibility.
 * Returns [path, leaf] pairs without output config extraction.
 *
 * @deprecated Use flattenRoute() which returns FlattenedRouteEntry[]
 */
export declare function flattenRouteLegacy(route: Route): Array<[ProcedurePath, RouteLeaf]>;
/**
 * Build a nested response structure from flat results.
 *
 * @param results - Array of [path, result] tuples
 * @returns Nested response object
 */
export declare function buildResponse<TRoute extends Route>(results: Array<[ProcedurePath, ProcedureCallResult]>): CallResponse<TRoute>;
/**
 * Check if a route contains multiple procedure calls.
 * Used to determine if batch execution is needed.
 *
 * @param route - Route to check
 * @returns true if route contains multiple procedures
 */
export declare function isBatchRoute(route: Route): boolean;
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
export declare function createRoute<TInput extends RouteLeaf>(path: ProcedurePath, input: TInput): Route;
/**
 * Merge multiple routes into a single batched route.
 *
 * @param routes - Routes to merge
 * @returns Merged route
 */
export declare function mergeRoutes(...routes: Route[]): Route;
//# sourceMappingURL=call-types.d.ts.map