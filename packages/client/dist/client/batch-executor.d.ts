/**
 * Batch Executor
 *
 * Executes multiple procedure calls with configurable strategies:
 * - all: Wait for all results (Promise.all)
 * - race: Return first result (Promise.race)
 * - stream: Yield results as they arrive
 */
import type { ProcedurePath, ProcedureContext } from "../procedures/types";
import type { Route, BatchConfig, BatchStrategy, ProcedureCallResult, CallResponse, StreamingCallResponse } from "./call-types";
import type { ResolvedRoute } from "./route-resolver";
/**
 * Function that executes a single procedure call.
 */
export type ProcedureExecutor = (resolved: ResolvedRoute, context: ExecutionContext) => Promise<ProcedureCallResult>;
/**
 * Execution context for procedure calls.
 */
export interface ExecutionContext {
    /** Abort signal for cancellation */
    signal?: AbortSignal;
    /** Request metadata */
    metadata: Record<string, unknown>;
    /** Procedure context (for handlers) */
    procedureContext?: ProcedureContext;
}
/**
 * Result of batch execution.
 */
export interface BatchExecutionResult<TRoute extends Route = Route> {
    /** Mirrored response structure */
    response: CallResponse<TRoute>;
    /** Whether all calls succeeded */
    success: boolean;
    /** Total execution time in ms */
    duration: number;
    /** Individual call results with paths */
    results: Array<{
        path: ProcedurePath;
        result: ProcedureCallResult;
        duration: number;
    }>;
}
/**
 * Executes batched procedure calls with configurable strategies.
 *
 * @example
 * ```typescript
 * const executor = new BatchExecutor(execute);
 *
 * // Execute all routes in parallel
 * const result = await executor.executeAll(resolved, context);
 *
 * // Stream results as they arrive
 * for await (const { path, result } of executor.executeStream(resolved, context)) {
 *   console.log(`${path.join('.')}: ${result.success}`);
 * }
 * ```
 */
export declare class BatchExecutor {
    private readonly execute;
    constructor(execute: ProcedureExecutor);
    /**
     * Execute resolved routes with the specified strategy.
     *
     * @param resolved - Resolved routes to execute
     * @param context - Execution context
     * @param config - Batch configuration
     * @returns Batch execution result
     */
    executeBatch<TRoute extends Route>(resolved: ResolvedRoute[], context: ExecutionContext, config?: BatchConfig): Promise<BatchExecutionResult<TRoute>>;
    /**
     * Execute all routes in parallel and wait for all results.
     */
    executeAll<TRoute extends Route>(resolved: ResolvedRoute[], context: ExecutionContext, config?: BatchConfig): Promise<BatchExecutionResult<TRoute>>;
    /**
     * Execute routes and return when first one completes.
     */
    executeRace<TRoute extends Route>(resolved: ResolvedRoute[], context: ExecutionContext): Promise<BatchExecutionResult<TRoute>>;
    /**
     * Execute routes and stream results as they arrive.
     */
    executeStream(resolved: ResolvedRoute[], context: ExecutionContext, config?: BatchConfig): AsyncGenerator<{
        path: ProcedurePath;
        result: ProcedureCallResult;
        duration: number;
    }>;
    /**
     * Get a streaming response with both iterator and completion promise.
     */
    getStreamingResponse<TRoute extends Route>(resolved: ResolvedRoute[], context: ExecutionContext, config?: BatchConfig): StreamingCallResponse<TRoute>;
    /**
     * Collect stream results into a batch result.
     */
    private collectStream;
    /**
     * Create an error result from an exception.
     */
    private createErrorResult;
}
/**
 * Create a batch executor with a procedure executor function.
 *
 * @param execute - Function that executes a single procedure
 * @returns Batch executor instance
 */
export declare function createBatchExecutor(execute: ProcedureExecutor): BatchExecutor;
/**
 * Determine the optimal batch strategy based on route count and config.
 *
 * @param routeCount - Number of routes to execute
 * @param config - User-provided batch config
 * @returns Effective batch strategy
 */
export declare function determineStrategy(routeCount: number, config?: BatchConfig): BatchStrategy;
/**
 * Semaphore for limiting concurrent executions.
 */
export declare class Semaphore {
    private permits;
    private waiting;
    constructor(permits: number);
    acquire(): Promise<void>;
    release(): void;
    withPermit<T>(fn: () => Promise<T>): Promise<T>;
}
/**
 * Execute procedures with concurrency limit.
 *
 * @param resolved - Routes to execute
 * @param execute - Executor function
 * @param context - Execution context
 * @param concurrency - Maximum concurrent executions
 * @returns Array of results
 */
export declare function executeWithConcurrency(resolved: ResolvedRoute[], execute: ProcedureExecutor, context: ExecutionContext, concurrency: number): Promise<Array<{
    path: ProcedurePath;
    result: ProcedureCallResult;
}>>;
//# sourceMappingURL=batch-executor.d.ts.map