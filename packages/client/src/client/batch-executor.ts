/**
 * Batch Executor
 *
 * Executes multiple procedure calls with configurable strategies:
 * - all: Wait for all results
 * - race: Return first result, and abort the other calls
 * - stream: Yield results as they arrive
 *
 * Each call gets its own abort signal, linked to the signal of the batch. The executor aborts a
 * call that can no longer change the result: a loser of a race, a call that still runs when the
 * reader of a stream stops, or (with `continueOnError: false`) every call after the first failure.
 */

import type { ProcedurePath, ProcedureContext } from "../procedures/types.js";
import type {
  Route,
  BatchConfig,
  BatchStrategy,
  ProcedureCallResult,
  CallResponse,
  StreamingCallResponse,
} from "./call-types.js";
import { buildResponse } from "./call-types.js";
import type { ResolvedRoute } from "./route-resolver.js";

// =============================================================================
// Executor Types
// =============================================================================

/**
 * Function that executes a single procedure call.
 */
export type ProcedureExecutor = (
  resolved: ResolvedRoute,
  context: ExecutionContext
) => Promise<ProcedureCallResult>;

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

/** The result of one call of a batch. */
export interface BatchItem {
  path: ProcedurePath;
  result: ProcedureCallResult;
  duration: number;
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
  results: BatchItem[];
}

/** An abort controller whose signal also aborts when the parent signal aborts. */
function linkedController(parent: AbortSignal | undefined): AbortController {
  const controller = new AbortController();
  if (parent) {
    if (parent.aborted) {
      controller.abort(parent.reason);
    } else {
      parent.addEventListener("abort", () => controller.abort(parent.reason), { once: true });
    }
  }
  return controller;
}

function cancelledResult(path: ProcedurePath, message: string): ProcedureCallResult {
  return { success: false, error: { code: "CANCELLED", message, retryable: false, path } };
}

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
  constructor(private readonly execute: ProcedureExecutor) {}

  /**
   * Execute resolved routes with the specified strategy.
   *
   * @param resolved - Resolved routes to execute
   * @param context - Execution context
   * @param config - Batch configuration
   * @returns Batch execution result
   */
  async executeBatch<TRoute extends Route>(
    resolved: ResolvedRoute[],
    context: ExecutionContext,
    config: BatchConfig = { strategy: "all" }
  ): Promise<BatchExecutionResult<TRoute>> {
    switch (config.strategy) {
      case "race":
        return this.executeRace<TRoute>(resolved, context);
      case "stream":
        // For non-streaming API, collect all stream results
        return this.collectStream<TRoute>(resolved, context, config);
      case "all":
      default:
        return this.executeAll<TRoute>(resolved, context, config);
    }
  }

  /**
   * Execute all routes in parallel and wait for all results. The results are in route order.
   *
   * With `continueOnError: false`, the first failure cancels the other calls: each gets a
   * `CANCELLED` result. By default, every call runs to its end.
   */
  async executeAll<TRoute extends Route>(
    resolved: ResolvedRoute[],
    context: ExecutionContext,
    config?: BatchConfig
  ): Promise<BatchExecutionResult<TRoute>> {
    // The stream with emitPartial: false holds every result, then gives them in route order
    return this.collect<TRoute>(
      this.executeStream(resolved, context, {
        strategy: "all",
        ...config,
        streamConfig: { ...config?.streamConfig, emitPartial: false },
      })
    );
  }

  /**
   * Execute routes and return when the first one completes. The executor aborts the other calls.
   */
  async executeRace<TRoute extends Route>(
    resolved: ResolvedRoute[],
    context: ExecutionContext
  ): Promise<BatchExecutionResult<TRoute>> {
    const startTime = Date.now();
    const controllers = resolved.map(() => linkedController(context.signal));
    const calls = resolved.map((route, index) =>
      this.runOne(route, { ...context, signal: controllers[index]!.signal }).then((item) => ({ item, index }))
    );

    const winner = await Promise.race(calls);
    controllers.forEach((controller, index) => {
      if (index !== winner.index) controller.abort();
    });

    return {
      response: buildResponse<TRoute>([[winner.item.path, winner.item.result]]),
      success: winner.item.result.success,
      duration: Date.now() - startTime,
      results: [winner.item],
    };
  }

  /**
   * Execute routes and stream results as they arrive.
   *
   * Each completed call goes into a queue, so every result reaches the reader, also when several
   * calls complete in one tick. (Before, the executor gave only the winner of each
   * `Promise.race`: the other calls of that tick were lost: deep dive CORE-2.)
   *
   * - `streamConfig.concurrency`: the maximum number of calls that run at one time.
   * - `streamConfig.bufferSize`: when this many results wait for the reader, the executor starts
   *   no new call. 0 or no value: no limit.
   * - `streamConfig.emitPartial`: false holds every result, then yields them in route order.
   * - `continueOnError: false`: the first failure cancels the calls that wait or run.
   *
   * When the reader stops early, the executor aborts the calls that still run.
   */
  async *executeStream(
    resolved: ResolvedRoute[],
    context: ExecutionContext,
    config?: BatchConfig
  ): AsyncGenerator<BatchItem> {
    const concurrency = Math.max(1, config?.streamConfig?.concurrency ?? resolved.length);
    const emitPartial = config?.streamConfig?.emitPartial ?? true;
    // A buffer limit with emitPartial: false would stop the batch: the results are never read early
    const bufferSize = emitPartial ? config?.streamConfig?.bufferSize ?? 0 : 0;
    const failFast = config?.continueOnError === false;

    const pending = resolved.map((route, index) => ({ route, index }));
    const running = new Map<number, { path: ProcedurePath; controller: AbortController }>();
    const done: Array<BatchItem & { index: number }> = [];
    let stopped = false;
    let wake: (() => void) | undefined;
    const notify = (): void => {
      const resolve = wake;
      wake = undefined;
      resolve?.();
    };

    const cancelRest = (): void => {
      stopped = true;
      const message = "Cancelled after another route failed";
      for (const { route, index } of pending.splice(0)) {
        done.push({ path: route.path, result: cancelledResult(route.path, message), duration: 0, index });
      }
      for (const [index, call] of running) {
        call.controller.abort();
        done.push({ path: call.path, result: cancelledResult(call.path, message), duration: 0, index });
      }
      running.clear();
    };

    const fill = (): void => {
      while (
        !stopped &&
        pending.length > 0 &&
        running.size < concurrency &&
        (bufferSize <= 0 || done.length < bufferSize)
      ) {
        const { route, index } = pending.shift()!;
        const controller = linkedController(context.signal);
        running.set(index, { path: route.path, controller });
        void this.runOne(route, { ...context, signal: controller.signal }).then((item) => {
          // A cancelled call has its result already
          if (!running.delete(index)) return;
          done.push({ ...item, index });
          if (failFast && !item.result.success) cancelRest();
          fill();
          notify();
        });
      }
    };

    const strip = ({ path, result, duration }: BatchItem & { index: number }): BatchItem => ({ path, result, duration });

    try {
      fill();
      for (;;) {
        if (emitPartial && done.length > 0) {
          yield strip(done.shift()!);
          fill();
          continue;
        }
        if (running.size === 0 && (pending.length === 0 || stopped)) break;
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
      }
      if (!emitPartial) {
        done.sort((a, b) => a.index - b.index);
        for (const item of done.splice(0)) yield strip(item);
      }
    } finally {
      // The reader stopped early, or the batch ended: abort the calls that still run
      stopped = true;
      for (const call of running.values()) call.controller.abort();
      running.clear();
    }
  }

  /**
   * Get a streaming response with both iterator and completion promise.
   */
  getStreamingResponse<TRoute extends Route>(
    resolved: ResolvedRoute[],
    context: ExecutionContext,
    config?: BatchConfig
  ): StreamingCallResponse<TRoute> {
    const results: Array<[ProcedurePath, ProcedureCallResult]> = [];
    const stream = this.executeStream(resolved, context, config);

    // One pump consumes the stream. The results iterator reads the items from a buffer, so
    // every item reaches both the iterator and the final response. (BUGS-2026-07 H12: the
    // iterator and the completion promise each iterated the same generator, so they split
    // the items between them.)
    const buffered: BatchItem[] = [];
    let finished = false;
    let failure: { error: unknown } | undefined;
    let wake: (() => void) | undefined;
    const notify = (): void => {
      const resolve = wake;
      wake = undefined;
      resolve?.();
    };

    const complete = (async () => {
      try {
        for await (const item of stream) {
          results.push([item.path, item.result]);
          buffered.push(item);
          notify();
        }
      } catch (error) {
        failure = { error };
        throw error;
      } finally {
        finished = true;
        notify();
      }
      return buildResponse<TRoute>(results);
    })();
    // A caller that only uses the iterator still sees the failure there
    complete.catch(() => {});

    const iterate = async function* (): AsyncGenerator<BatchItem> {
      let index = 0;
      for (;;) {
        if (index < buffered.length) {
          yield buffered[index++]!;
          continue;
        }
        if (finished) {
          if (failure) throw failure.error;
          return;
        }
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
      }
    };

    return {
      results: iterate(),
      complete,
    };
  }

  /**
   * Collect stream results into a batch result.
   */
  private async collectStream<TRoute extends Route>(
    resolved: ResolvedRoute[],
    context: ExecutionContext,
    config?: BatchConfig
  ): Promise<BatchExecutionResult<TRoute>> {
    return this.collect<TRoute>(this.executeStream(resolved, context, config));
  }

  private async collect<TRoute extends Route>(items: AsyncIterable<BatchItem>): Promise<BatchExecutionResult<TRoute>> {
    const startTime = Date.now();
    const results: BatchItem[] = [];
    for await (const item of items) {
      results.push(item);
    }
    return {
      response: buildResponse<TRoute>(results.map(({ path, result }) => [path, result])),
      success: results.every((r) => r.result.success),
      duration: Date.now() - startTime,
      results,
    };
  }

  /** Run one call. The result is never a rejection: an exception becomes an error result. */
  private async runOne(route: ResolvedRoute, context: ExecutionContext): Promise<BatchItem> {
    const callStart = Date.now();
    try {
      const result = await this.execute(route, context);
      return { path: route.path, result, duration: Date.now() - callStart };
    } catch (error) {
      return { path: route.path, result: this.createErrorResult(route.path, error), duration: Date.now() - callStart };
    }
  }

  /**
   * Create an error result from an exception.
   */
  private createErrorResult(path: ProcedurePath, error: unknown): ProcedureCallResult {
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
export function createBatchExecutor(execute: ProcedureExecutor): BatchExecutor {
  return new BatchExecutor(execute);
}

/**
 * Determine the optimal batch strategy based on route count and config.
 *
 * @param routeCount - Number of routes to execute
 * @param config - User-provided batch config
 * @returns Effective batch strategy
 */
export function determineStrategy(
  routeCount: number,
  config?: BatchConfig
): BatchStrategy {
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
  private permits: number;
  private waiting: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }

    return new Promise((resolve) => {
      this.waiting.push(resolve);
    });
  }

  release(): void {
    if (this.waiting.length > 0) {
      const next = this.waiting.shift()!;
      next();
    } else {
      this.permits++;
    }
  }

  async withPermit<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
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
export async function executeWithConcurrency(
  resolved: ResolvedRoute[],
  execute: ProcedureExecutor,
  context: ExecutionContext,
  concurrency: number
): Promise<Array<{ path: ProcedurePath; result: ProcedureCallResult }>> {
  const semaphore = new Semaphore(concurrency);
  const results: Array<{ path: ProcedurePath; result: ProcedureCallResult }> = [];

  await Promise.all(
    resolved.map(async (route) => {
      const result = await semaphore.withPermit(() => execute(route, context));
      results.push({ path: route.path, result });
    })
  );

  return results;
}
