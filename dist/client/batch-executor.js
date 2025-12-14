/**
 * Batch Executor
 *
 * Executes multiple procedure calls with configurable strategies:
 * - all: Wait for all results (Promise.all)
 * - race: Return first result (Promise.race)
 * - stream: Yield results as they arrive
 */
import { buildResponse } from "./call-types";
// =============================================================================
// Batch Executor Class
// =============================================================================
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
export class BatchExecutor {
    execute;
    constructor(execute) {
        this.execute = execute;
    }
    /**
     * Execute resolved routes with the specified strategy.
     *
     * @param resolved - Resolved routes to execute
     * @param context - Execution context
     * @param config - Batch configuration
     * @returns Batch execution result
     */
    async executeBatch(resolved, context, config = { strategy: "all" }) {
        switch (config.strategy) {
            case "race":
                return this.executeRace(resolved, context);
            case "stream":
                // For non-streaming API, collect all stream results
                return this.collectStream(resolved, context, config);
            case "all":
            default:
                return this.executeAll(resolved, context, config);
        }
    }
    /**
     * Execute all routes in parallel and wait for all results.
     */
    async executeAll(resolved, context, config) {
        const startTime = Date.now();
        const results = [];
        const promises = resolved.map(async (route) => {
            const callStart = Date.now();
            try {
                const result = await this.execute(route, context);
                return {
                    path: route.path,
                    result,
                    duration: Date.now() - callStart,
                };
            }
            catch (error) {
                return {
                    path: route.path,
                    result: this.createErrorResult(route.path, error),
                    duration: Date.now() - callStart,
                };
            }
        });
        // Wait for all if continueOnError, otherwise fail fast
        if (config?.continueOnError) {
            const settled = await Promise.allSettled(promises);
            for (const result of settled) {
                if (result.status === "fulfilled") {
                    results.push(result.value);
                }
            }
        }
        else {
            const completed = await Promise.all(promises);
            results.push(...completed);
        }
        const response = buildResponse(results.map(({ path, result }) => [path, result]));
        return {
            response,
            success: results.every((r) => r.result.success),
            duration: Date.now() - startTime,
            results,
        };
    }
    /**
     * Execute routes and return when first one completes.
     */
    async executeRace(resolved, context) {
        const startTime = Date.now();
        const promises = resolved.map(async (route) => {
            const callStart = Date.now();
            try {
                const result = await this.execute(route, context);
                return {
                    path: route.path,
                    result,
                    duration: Date.now() - callStart,
                };
            }
            catch (error) {
                return {
                    path: route.path,
                    result: this.createErrorResult(route.path, error),
                    duration: Date.now() - callStart,
                };
            }
        });
        const winner = await Promise.race(promises);
        const results = [winner];
        const response = buildResponse([[winner.path, winner.result]]);
        return {
            response,
            success: winner.result.success,
            duration: Date.now() - startTime,
            results,
        };
    }
    /**
     * Execute routes and stream results as they arrive.
     */
    async *executeStream(resolved, context, config) {
        const concurrency = config?.streamConfig?.concurrency ?? resolved.length;
        const pending = [...resolved];
        const inFlight = new Set();
        while (pending.length > 0 || inFlight.size > 0) {
            // Start new requests up to concurrency limit
            while (pending.length > 0 && inFlight.size < concurrency) {
                const route = pending.shift();
                const callStart = Date.now();
                const promise = this.execute(route, context)
                    .then((result) => ({
                    path: route.path,
                    result,
                    duration: Date.now() - callStart,
                }))
                    .catch((error) => ({
                    path: route.path,
                    result: this.createErrorResult(route.path, error),
                    duration: Date.now() - callStart,
                }));
                inFlight.add(promise);
                // Remove from in-flight when done
                promise.then(() => inFlight.delete(promise));
            }
            // Wait for at least one to complete
            if (inFlight.size > 0) {
                const completed = await Promise.race(inFlight);
                yield completed;
            }
        }
    }
    /**
     * Get a streaming response with both iterator and completion promise.
     */
    getStreamingResponse(resolved, context, config) {
        const results = [];
        const stream = this.executeStream(resolved, context, config);
        // Create async iterator that also collects results
        const wrappedStream = async function* () {
            for await (const item of stream) {
                results.push([item.path, item.result]);
                yield item;
            }
        };
        // Create completion promise
        const complete = (async () => {
            // Consume the stream to populate results
            const iterator = wrappedStream();
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            for await (const _ of iterator) {
                // Just consume
            }
            return buildResponse(results);
        })();
        return {
            results: wrappedStream(),
            complete,
        };
    }
    /**
     * Collect stream results into a batch result.
     */
    async collectStream(resolved, context, config) {
        const startTime = Date.now();
        const results = [];
        for await (const result of this.executeStream(resolved, context, config)) {
            results.push(result);
        }
        const response = buildResponse(results.map(({ path, result }) => [path, result]));
        return {
            response,
            success: results.every((r) => r.result.success),
            duration: Date.now() - startTime,
            results,
        };
    }
    /**
     * Create an error result from an exception.
     */
    createErrorResult(path, error) {
        const message = error instanceof Error ? error.message : String(error);
        const code = error instanceof Error && "code" in error
            ? String(error.code)
            : "EXECUTION_ERROR";
        return {
            success: false,
            error: {
                code,
                message,
                retryable: false,
                path,
            },
        };
    }
}
// =============================================================================
// Factory Functions
// =============================================================================
/**
 * Create a batch executor with a procedure executor function.
 *
 * @param execute - Function that executes a single procedure
 * @returns Batch executor instance
 */
export function createBatchExecutor(execute) {
    return new BatchExecutor(execute);
}
/**
 * Determine the optimal batch strategy based on route count and config.
 *
 * @param routeCount - Number of routes to execute
 * @param config - User-provided batch config
 * @returns Effective batch strategy
 */
export function determineStrategy(routeCount, config) {
    if (config?.strategy) {
        return config.strategy;
    }
    // Default: single route doesn't need batching
    if (routeCount === 1) {
        return "all";
    }
    // Default for multiple routes
    return "all";
}
// =============================================================================
// Concurrency Control
// =============================================================================
/**
 * Semaphore for limiting concurrent executions.
 */
export class Semaphore {
    permits;
    waiting = [];
    constructor(permits) {
        this.permits = permits;
    }
    async acquire() {
        if (this.permits > 0) {
            this.permits--;
            return;
        }
        return new Promise((resolve) => {
            this.waiting.push(resolve);
        });
    }
    release() {
        if (this.waiting.length > 0) {
            const next = this.waiting.shift();
            next();
        }
        else {
            this.permits++;
        }
    }
    async withPermit(fn) {
        await this.acquire();
        try {
            return await fn();
        }
        finally {
            this.release();
        }
    }
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
export async function executeWithConcurrency(resolved, execute, context, concurrency) {
    const semaphore = new Semaphore(concurrency);
    const results = [];
    await Promise.all(resolved.map(async (route) => {
        const result = await semaphore.withPermit(() => execute(route, context));
        results.push({ path: route.path, result });
    }));
    return results;
}
//# sourceMappingURL=batch-executor.js.map