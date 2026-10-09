/**
 * Rate Limiting Middleware
 *
 * Throttles requests using token bucket algorithm.
 * Prevents overwhelming services with too many requests.
 *
 * Works with both client and server!
 */

import type { ClientMiddleware, ClientRunner, ClientContext, TypedClientMiddleware } from "../types.js";
import type { RateLimitContext } from "./contexts.js";
import { abortedItem } from "./items.js";

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
): TypedClientMiddleware<RateLimitContext, {}> {
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
  let drainTimer: ReturnType<typeof setTimeout> | undefined;

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
   * Acquire a token (blocking for queue strategy). Returns false when the signal aborted the
   * wait. A new request waits behind the queued requests, also when a token is free: before,
   * an arrival could take the token of a queued request (deep dive TRN-12).
   */
  async function acquireToken(signal?: AbortSignal): Promise<boolean> {
    refillTokens();

    if (queue.length === 0 && tokens >= 1) {
      // Token available
      tokens -= 1;
      return true;
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

    if (signal?.aborted) return false;

    return new Promise<boolean>((resolve) => {
      const request: QueuedRequest = {
        resolve: () => {
          signal?.removeEventListener("abort", onAbort);
          resolve(true);
        },
        reject: () => resolve(false),
        timestamp: Date.now(),
      };
      // A queued request whose caller aborts leaves the queue (before, it kept its place)
      const onAbort = (): void => {
        const index = queue.indexOf(request);
        if (index >= 0) queue.splice(index, 1);
        resolve(false);
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      queue.push(request);
      scheduleDrain();
    });
  }

  /**
   * Give tokens to the queued requests, in order, and wait for the next token while the queue
   * is not empty. The timer keeps the process alive while requests wait: before, an unref'd
   * timer let the process exit with queued requests that never ran (deep dive TRN-12).
   */
  function scheduleDrain(): void {
    if (drainTimer !== undefined) return;
    refillTokens();
    while (queue.length > 0 && tokens >= 1) {
      tokens -= 1;
      queue.shift()!.resolve();
    }
    if (queue.length === 0) return;
    // The time until the next whole token
    const wait = Math.max(1, Math.ceil(((1 - tokens) * window) / maxRequests));
    drainTimer = setTimeout(() => {
      drainTimer = undefined;
      scheduleDrain();
    }, wait);
  }

  const middleware = <TReq, TRes>(next: ClientRunner<TReq, TRes>): ClientRunner<TReq, TRes> => {
    return async function* (context: ClientContext<TReq>) {
      totalRequests++;

      // Acquire token (may throw or wait)
      if (!(await acquireToken(context.message.signal))) {
        yield abortedItem<TRes>(context.message.id);
        return;
      }

      // Execute request
      yield* next(context);
    };
  };
  return middleware;
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
