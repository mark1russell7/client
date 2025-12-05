/**
 * Rate Limiting Middleware
 *
 * Throttles requests using token bucket algorithm.
 * Prevents overwhelming services with too many requests.
 *
 * Works with both client and server!
 */

import type { ClientMiddleware, ClientRunner, ClientContext } from "../types";

/**
 * Rate limiting options.
 */
export interface RateLimitOptions {
  /**
   * Maximum number of requests per time window.
   * @default 100
   */
  maxRequests?: number;

  /**
   * Time window in milliseconds.
   * @default 60000 (1 minute)
   */
  window?: number;

  /**
   * Behavior when rate limit is exceeded.
   * - "reject": Throw error immediately
   * - "queue": Queue requests and process when capacity available
   * @default "reject"
   */
  strategy?: "reject" | "queue";

  /**
   * Maximum queue size (only for "queue" strategy).
   * @default 100
   */
  maxQueueSize?: number;

  /**
   * Custom error message.
   */
  message?: string;

  /**
   * Callback when rate limit is exceeded.
   */
  onRateLimitExceeded?: (stats: RateLimitStats) => void;
}

/**
 * Rate limit statistics.
 */
export interface RateLimitStats {
  tokensAvailable: number;
  maxTokens: number;
  queueSize: number;
  totalRequests: number;
  rejectedRequests: number;
}

/**
 * Rate limit error thrown when limit exceeded.
 */
export class RateLimitError extends Error {
  constructor(
    message: string,
    public readonly stats: RateLimitStats
  ) {
    super(message);
    this.name = "RateLimitError";
  }
}

/**
 * Queued request for "queue" strategy.
 */
interface QueuedRequest {
  resolve: () => void;
  reject: (error: Error) => void;
  timestamp: number;
}

/**
 * Create rate limiting middleware using token bucket algorithm.
 *
 * @param options - Rate limiting configuration
 * @returns Middleware function
 *
 * @example
 * ```typescript
 * // Reject strategy (default)
 * client.use(createRateLimitMiddleware({
 *   maxRequests: 100,    // 100 requests
 *   window: 60000,       // per minute
 *   strategy: "reject"   // Throw error when exceeded
 * }));
 *
 * // Queue strategy
 * client.use(createRateLimitMiddleware({
 *   maxRequests: 10,
 *   window: 1000,
 *   strategy: "queue",   // Queue requests when exceeded
 *   maxQueueSize: 50
 * }));
 * ```
 */
export function createRateLimitMiddleware(
  options: RateLimitOptions = {}
): ClientMiddleware {
  const {
    maxRequests = 100,
    window = 60000,
    strategy = "reject",
    maxQueueSize = 100,
    message = "Rate limit exceeded",
    onRateLimitExceeded,
  } = options;

  // Token bucket state
  let tokens = maxRequests;
  let lastRefill = Date.now();
  let totalRequests = 0;
  let rejectedRequests = 0;

  // Queue for "queue" strategy
  const queue: QueuedRequest[] = [];
  let processingQueue = false;

  /**
   * Refill tokens based on elapsed time.
   */
  function refillTokens(): void {
    const now = Date.now();
    const elapsed = now - lastRefill;

    if (elapsed >= window) {
      // Full refill
      tokens = maxRequests;
      lastRefill = now;
    } else {
      // Partial refill (tokens per millisecond * elapsed time)
      const tokensToAdd = (maxRequests / window) * elapsed;
      tokens = Math.min(maxRequests, tokens + tokensToAdd);
      lastRefill = now;
    }
  }

  /**
   * Get current statistics.
   */
  function getStats(): RateLimitStats {
    return {
      tokensAvailable: Math.floor(tokens),
      maxTokens: maxRequests,
      queueSize: queue.length,
      totalRequests,
      rejectedRequests,
    };
  }

  /**
   * Acquire a token (blocking for queue strategy).
   */
  async function acquireToken(): Promise<void> {
    refillTokens();

    if (tokens >= 1) {
      // Token available
      tokens -= 1;
      return;
    }

    // No tokens available
    const stats = getStats();

    if (strategy === "reject") {
      // Reject immediately
      rejectedRequests++;
      if (onRateLimitExceeded) {
        onRateLimitExceeded(stats);
      }
      throw new RateLimitError(message, stats);
    }

    // Queue strategy - wait for token
    if (queue.length >= maxQueueSize) {
      rejectedRequests++;
      if (onRateLimitExceeded) {
        onRateLimitExceeded(stats);
      }
      throw new RateLimitError(`${message} (queue full)`, stats);
    }

    return new Promise((resolve, reject) => {
      queue.push({
        resolve,
        reject,
        timestamp: Date.now(),
      });

      // Start processing queue if not already running
      if (!processingQueue) {
        processQueue();
      }
    });
  }

  /**
   * Process queued requests.
   */
  function processQueue(): void {
    if (processingQueue || queue.length === 0) {
      return;
    }

    processingQueue = true;

    const interval = setInterval(() => {
      refillTokens();

      while (queue.length > 0 && tokens >= 1) {
        const request = queue.shift();
        if (request) {
          tokens -= 1;
          request.resolve();
        }
      }

      if (queue.length === 0) {
        clearInterval(interval);
        processingQueue = false;
      }
    }, 100); // Check every 100ms
  }

  return <TReq, TRes>(next: ClientRunner<TReq, TRes>): ClientRunner<TReq, TRes> => {
    return async function* (context: ClientContext<TReq>) {
      totalRequests++;

      // Acquire token (may throw or wait)
      await acquireToken();

      // Execute request
      yield* next(context);
    };
  };
}

/**
 * Create per-service rate limiter.
 *
 * Applies different rate limits based on service name.
 *
 * @example
 * ```typescript
 * client.use(createPerServiceRateLimiter({
 *   users: { maxRequests: 100, window: 60000 },
 *   orders: { maxRequests: 50, window: 60000 },
 *   default: { maxRequests: 200, window: 60000 }
 * }));
 * ```
 */
export function createPerServiceRateLimiter(
  limits: Record<string, RateLimitOptions> & { default?: RateLimitOptions }
): ClientMiddleware {
  // Create rate limiter for each service
  const limiters = new Map<string, ClientMiddleware>();

  for (const [service, options] of Object.entries(limits)) {
    limiters.set(service, createRateLimitMiddleware(options));
  }

  const defaultLimiter = limits.default
    ? createRateLimitMiddleware(limits.default)
    : null;

  return <TReq, TRes>(next: ClientRunner<TReq, TRes>): ClientRunner<TReq, TRes> => {
    return async function* (context: ClientContext<TReq>) {
      // Get service name from context
      const service = context.message.method.service;

      // Get appropriate limiter
      const limiter = limiters.get(service) ?? defaultLimiter;

      if (limiter) {
        // Apply service-specific rate limit
        const typedLimiter = limiter as ClientMiddleware<TReq, TRes>;
        const limitedNext = typedLimiter(next);
        yield* limitedNext(context);
      } else {
        // No rate limit for this service
        yield* next(context);
      }
    };
  };
}
