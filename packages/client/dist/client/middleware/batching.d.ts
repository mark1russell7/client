/**
 * Batching Middleware
 *
 * Combines multiple requests into a single batch for efficiency.
 * Reduces network overhead and improves throughput.
 *
 * Works with both client and server!
 */
import type { ClientMiddleware, Message, TypedClientMiddleware } from "../types";
import type { BatchingContext } from "./contexts";
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
export declare function createBatchingMiddleware(options?: BatchingOptions): TypedClientMiddleware<BatchingContext, {}>;
/**
 * Get batching statistics.
 *
 * Note: This is a placeholder - proper implementation would
 * require exposing the queue through the middleware instance.
 */
export declare function getBatchingStats(_middleware: ClientMiddleware): BatchingStats | null;
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
export declare function createAdaptiveBatchingMiddleware(options?: {
    minBatchSize?: number;
    maxBatchSize?: number;
    targetLatency?: number;
}): ClientMiddleware;
//# sourceMappingURL=batching.d.ts.map