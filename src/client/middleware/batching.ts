/**
 * Batching Middleware
 *
 * Combines multiple requests into a single batch for efficiency.
 * Reduces network overhead and improves throughput.
 *
 * Works with both client and server!
 */

import type { ClientMiddleware, ClientRunner, ClientContext, Message, ResponseItem, TypedClientMiddleware } from "../types.js";
import type { BatchingContext } from "./contexts.js";

/**
 * Batching options.
 */
export interface BatchingOptions {
  /**
   * Maximum batch size (number of requests).
   * @default 10
   */
  maxBatchSize?: number;

  /**
   * Maximum wait time before sending batch (in milliseconds).
   * @default 10
   */
  maxWaitTime?: number;

  /**
   * Only batch requests to the same service.
   * @default true
   */
  sameServiceOnly?: boolean;

  /**
   * Custom batch key function.
   * Requests with the same key will be batched together.
   * @default Group by service name
   */
  getBatchKey?: (message: Message) => string;

  /**
   * Callback when batch is sent.
   */
  onBatchSent?: (batchSize: number, batchKey: string) => void;
}

/**
 * Batching statistics.
 */
export interface BatchingStats {
  totalRequests: number;
  totalBatches: number;
  averageBatchSize: number;
  pendingRequests: number;
}

/**
 * Batched request entry.
 */
interface BatchedRequest<TReq = unknown, TRes = unknown> {
  context: ClientContext<TReq>;
  next: ClientRunner<TReq, TRes>;
  resolve: (response: AsyncIterable<ResponseItem<TRes>>) => void;
  reject: (error: Error) => void;
}

/**
 * Batch queue for collecting requests.
 */
class BatchQueue {
  private requests: Map<string, BatchedRequest[]> = new Map();
  private timers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private stats = {
    totalRequests: 0,
    totalBatches: 0,
  };

  constructor(
    private options: {
      maxBatchSize: number;
      maxWaitTime: number;
      sameServiceOnly: boolean;
      getBatchKey: (message: Message) => string;
      onBatchSent?: (batchSize: number, batchKey: string) => void;
    },
    private processBatch: (key: string, requests: BatchedRequest[]) => void
  ) {}

  /**
   * Add request to batch queue.
   */
  add<TReq, TRes>(
    key: string,
    request: BatchedRequest<TReq, TRes>
  ): void {
    this.stats.totalRequests++;

    // Get or create batch for this key
    let batch = this.requests.get(key);
    if (!batch) {
      batch = [];
      this.requests.set(key, batch);
    }

    batch.push(request as BatchedRequest);

    // Check if batch is full
    if (batch.length >= this.options.maxBatchSize) {
      this.flush(key);
    } else if (batch.length === 1) {
      // First request in batch - start timer
      this.startTimer(key);
    }
  }

  /**
   * Start timer for batch.
   */
  private startTimer(key: string): void {
    const timer = setTimeout(() => {
      this.flush(key);
    }, this.options.maxWaitTime);

    this.timers.set(key, timer);
  }

  /**
   * Flush batch (send it).
   */
  private flush(key: string): void {
    const batch = this.requests.get(key);
    if (!batch || batch.length === 0) {
      return;
    }

    // Clear timer
    const timer = this.timers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(key);
    }

    // Remove from queue
    this.requests.delete(key);

    // Update stats
    this.stats.totalBatches++;

    // Notify callback
    if (this.options.onBatchSent) {
      this.options.onBatchSent(batch.length, key);
    }

    // Process batch
    this.processBatch(key, batch);
  }

  /**
   * Get statistics.
   */
  getStats(): BatchingStats {
    let pendingRequests = 0;
    for (const batch of this.requests.values()) {
      pendingRequests += batch.length;
    }

    const averageBatchSize =
      this.stats.totalBatches > 0
        ? this.stats.totalRequests / this.stats.totalBatches
        : 0;

    return {
      totalRequests: this.stats.totalRequests,
      totalBatches: this.stats.totalBatches,
      averageBatchSize,
      pendingRequests,
    };
  }
}

/**
 * Create batching middleware.
 *
 * Automatically combines multiple requests into batches for efficiency.
 *
 * @param options - Batching configuration
 * @returns Middleware function
 *
 * @example
 * ```typescript
 * client.use(createBatchingMiddleware({
 *   maxBatchSize: 10,      // Combine up to 10 requests
 *   maxWaitTime: 10,       // Wait max 10ms before sending
 *   sameServiceOnly: true  // Only batch requests to same service
 * }));
 * ```
 *
 * @example
 * ```typescript
 * // Custom batching by operation
 * client.use(createBatchingMiddleware({
 *   getBatchKey: (msg) => `${msg.method.service}:${msg.method.operation}`
 * }));
 * ```
 */
export function createBatchingMiddleware(
  options: BatchingOptions = {}
): TypedClientMiddleware<BatchingContext, {}> {
  const sameServiceOnly = options.sameServiceOnly ?? true;
  const opts = {
    maxBatchSize: options.maxBatchSize ?? 10,
    maxWaitTime: options.maxWaitTime ?? 10,
    sameServiceOnly,
    getBatchKey:
      options.getBatchKey ??
      ((msg) =>
        sameServiceOnly
          ? msg.method.service
          : "__all__"),
    ...(options.onBatchSent !== undefined && { onBatchSent: options.onBatchSent }),
  };

  /**
   * Process a batch of requests.
   */
  async function processBatch(_key: string, requests: BatchedRequest[]): Promise<void> {
    // Note: This is a simplified implementation.
    // In practice, you'd need transport-level support for batching.
    // The transport would need to:
    // 1. Accept multiple messages
    // 2. Send them in a single network request
    // 3. Return multiple responses
    // 4. Match responses to requests by ID

    // For now, we execute requests individually
    // Real batching requires transport cooperation
    for (const request of requests) {
      try {
        const response = request.next(request.context);
        request.resolve(response);
      } catch (error) {
        request.reject(error as Error);
      }
    }
  }

  // Create shared batch queue
  const queue = new BatchQueue(opts, processBatch);

  return <TReq, TRes>(next: ClientRunner<TReq, TRes>): ClientRunner<TReq, TRes> => {
    return async function* (context: ClientContext<TReq>) {
      // Get batch key for this request
      const key = opts.getBatchKey(context.message);

      // Create promise for batched response
      const responsePromise = new Promise<AsyncIterable<ResponseItem<TRes>>>(
        (resolve, reject) => {
          queue.add(key, {
            context,
            next: next as ClientRunner<unknown, unknown>,
            resolve: resolve as (response: AsyncIterable<ResponseItem<unknown>>) => void,
            reject,
          });
        }
      );

      // Wait for batch to complete and yield response
      const response = await responsePromise;
      yield* response;
    };
  };
}

/**
 * Get batching statistics.
 *
 * Note: This is a placeholder - proper implementation would
 * require exposing the queue through the middleware instance.
 */
export function getBatchingStats(
  _middleware: ClientMiddleware
): BatchingStats | null {
  return null;
}

/**
 * Create adaptive batching middleware.
 *
 * Automatically adjusts batch size based on request patterns.
 *
 * @example
 * ```typescript
 * client.use(createAdaptiveBatchingMiddleware({
 *   minBatchSize: 2,
 *   maxBatchSize: 50,
 *   targetLatency: 20  // Target 20ms latency
 * }));
 * ```
 */
export function createAdaptiveBatchingMiddleware(options: {
  minBatchSize?: number;
  maxBatchSize?: number;
  targetLatency?: number;
} = {}): ClientMiddleware {
  const {
    minBatchSize = 2,
    maxBatchSize = 50,
    targetLatency = 20,
  } = options;

  let currentBatchSize = minBatchSize;
  let recentLatencies: number[] = [];

  /**
   * Adjust batch size based on latency.
   */
  function adjustBatchSize(): void {
    if (recentLatencies.length < 5) {
      return;
    }

    const avgLatency =
      recentLatencies.reduce((sum, l) => sum + l, 0) / recentLatencies.length;

    if (avgLatency > targetLatency && currentBatchSize > minBatchSize) {
      // Too slow - reduce batch size
      currentBatchSize = Math.max(minBatchSize, currentBatchSize - 1);
    } else if (avgLatency < targetLatency * 0.5 && currentBatchSize < maxBatchSize) {
      // Too fast - increase batch size
      currentBatchSize = Math.min(maxBatchSize, currentBatchSize + 1);
    }

    // Keep only recent latencies
    recentLatencies = recentLatencies.slice(-10);
  }

  return <TReq, TRes>(next: ClientRunner<TReq, TRes>): ClientRunner<TReq, TRes> => {
    const batchingMiddleware = createBatchingMiddleware({
      maxBatchSize: currentBatchSize,
      maxWaitTime: targetLatency,
    }) as ClientMiddleware<TReq, TRes>;

    return async function* (context: ClientContext<TReq>) {
      const start = Date.now();

      try {
        const batchedNext = batchingMiddleware(next);
        yield* batchedNext(context);
      } finally {
        const latency = Date.now() - start;
        recentLatencies.push(latency);
        adjustBatchSize();
      }
    };
  };
}
