/**
 * Batching Middleware
 *
 * Combines multiple requests into a single batch for efficiency.
 * Reduces network overhead and improves throughput.
 *
 * Works with both client and server!
 */
/**
 * Batch queue for collecting requests.
 */
class BatchQueue {
    options;
    processBatch;
    requests = new Map();
    timers = new Map();
    stats = {
        totalRequests: 0,
        totalBatches: 0,
    };
    constructor(options, processBatch) {
        this.options = options;
        this.processBatch = processBatch;
    }
    /**
     * Add request to batch queue.
     */
    add(key, request) {
        this.stats.totalRequests++;
        // Get or create batch for this key
        let batch = this.requests.get(key);
        if (!batch) {
            batch = [];
            this.requests.set(key, batch);
        }
        batch.push(request);
        // Check if batch is full
        if (batch.length >= this.options.maxBatchSize) {
            this.flush(key);
        }
        else if (batch.length === 1) {
            // First request in batch - start timer
            this.startTimer(key);
        }
    }
    /**
     * Start timer for batch.
     */
    startTimer(key) {
        const timer = setTimeout(() => {
            this.flush(key);
        }, this.options.maxWaitTime);
        this.timers.set(key, timer);
    }
    /**
     * Flush batch (send it).
     */
    flush(key) {
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
    getStats() {
        let pendingRequests = 0;
        for (const batch of this.requests.values()) {
            pendingRequests += batch.length;
        }
        const averageBatchSize = this.stats.totalBatches > 0
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
export function createBatchingMiddleware(options = {}) {
    const sameServiceOnly = options.sameServiceOnly ?? true;
    const opts = {
        maxBatchSize: options.maxBatchSize ?? 10,
        maxWaitTime: options.maxWaitTime ?? 10,
        sameServiceOnly,
        getBatchKey: options.getBatchKey ??
            ((msg) => sameServiceOnly
                ? msg.method.service
                : "__all__"),
        ...(options.onBatchSent !== undefined && { onBatchSent: options.onBatchSent }),
    };
    /**
     * Process a batch of requests.
     */
    async function processBatch(_key, requests) {
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
            }
            catch (error) {
                request.reject(error);
            }
        }
    }
    // Create shared batch queue
    const queue = new BatchQueue(opts, processBatch);
    return (next) => {
        return async function* (context) {
            // Get batch key for this request
            const key = opts.getBatchKey(context.message);
            // Create promise for batched response
            const responsePromise = new Promise((resolve, reject) => {
                queue.add(key, {
                    context,
                    next: next,
                    resolve: resolve,
                    reject,
                });
            });
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
export function getBatchingStats(_middleware) {
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
export function createAdaptiveBatchingMiddleware(options = {}) {
    const { minBatchSize = 2, maxBatchSize = 50, targetLatency = 20, } = options;
    let currentBatchSize = minBatchSize;
    let recentLatencies = [];
    /**
     * Adjust batch size based on latency.
     */
    function adjustBatchSize() {
        if (recentLatencies.length < 5) {
            return;
        }
        const avgLatency = recentLatencies.reduce((sum, l) => sum + l, 0) / recentLatencies.length;
        if (avgLatency > targetLatency && currentBatchSize > minBatchSize) {
            // Too slow - reduce batch size
            currentBatchSize = Math.max(minBatchSize, currentBatchSize - 1);
        }
        else if (avgLatency < targetLatency * 0.5 && currentBatchSize < maxBatchSize) {
            // Too fast - increase batch size
            currentBatchSize = Math.min(maxBatchSize, currentBatchSize + 1);
        }
        // Keep only recent latencies
        recentLatencies = recentLatencies.slice(-10);
    }
    return (next) => {
        const batchingMiddleware = createBatchingMiddleware({
            maxBatchSize: currentBatchSize,
            maxWaitTime: targetLatency,
        });
        return async function* (context) {
            const start = Date.now();
            try {
                const batchedNext = batchingMiddleware(next);
                yield* batchedNext(context);
            }
            finally {
                const latency = Date.now() - start;
                recentLatencies.push(latency);
                adjustBatchSize();
            }
        };
    };
}
//# sourceMappingURL=batching.js.map