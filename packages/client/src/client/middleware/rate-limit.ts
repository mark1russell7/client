/**
 * Rate Limiting Middleware
 *
 * Throttles requests using token bucket algorithm.
 * Prevents overwhelming services with too many requests.
 *
 * Works with both client and server!
 *
 * The bucket is a keyed limiter of `@mark1russell7/service/limiter` (CLI-40): the same primitive
 * as the limits of the procedures server. Its policy is a token bucket of `maxRequests` tokens
 * that refills `maxRequests` tokens in each `window`, as before.
 */

import { valueIn, type Quantity } from "@mark1russell7/quantity";
import { keyedLimiter, memoryStore, type Decision, type LimitRule } from "@mark1russell7/service/limiter";
import type { ClientMiddleware, ClientRunner, ClientContext, TypedClientMiddleware } from "../types.js";
import type { RateLimitContext } from "./contexts.js";
import { abortedItem } from "./items.js";
import { optionalMs, type Duration } from "../../duration.js";
import { TIMER_DEFAULTS } from "../../timers.js";
import type { Cancel, Clock } from "../../clock.js";

/**
 * Rate limiting options.
 */
export interface RateLimitOptions {
  /**
   * Maximum number of requests per time window.
   *
   * Kept for compatibility: a value below 1 never lets a request in, and a value above 1 that is
   * not whole gives a bucket of that size. An infinite value limits nothing.
   * @default 100
   */
  maxRequests?: number;

  /**
   * Time window in milliseconds.
   *
   * Kept for compatibility: a window of 0 or less fills the bucket again at each request, so a
   * `maxRequests` of 1 or more limits nothing.
   * @default 60000 (1 minute)
   */
  window?: Duration;

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

  /**
   * The clock of the limiter: the time of the bucket and the timer of the queue (CLI-40). The
   * default reads `Date.now()` and starts its timer with `setTimeout`, as before, so a queued
   * request keeps a process alive. A test gives a fake clock.
   */
  clock?: Clock | undefined;
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
  timestamp: number;
}

/** The name of the keyed limiter of a middleware. Each middleware has its own store, so the name is the same for each one. */
const LIMITER = "client.rateLimit";
/** The one key of the bucket of a middleware. */
const KEY = "client";

/**
 * The clock of a limiter without the option `clock`: `Date.now()` from the start of the
 * middleware, and `setTimeout`. Thus the bucket reads the same time as before, and a queued
 * request keeps a Node process alive until it runs.
 */
function wallClock(): Clock {
  const origin = Date.now();
  return {
    now: () => Date.now() - origin,
    after(delay: number, run: () => void): Cancel {
      const timer = setTimeout(run, Math.max(0, delay));
      return () => clearTimeout(timer);
    },
  };
}

/** This function gives a wait in milliseconds as a quantity. */
const msOf = (value: number): Quantity => ({ value, unit: "ms" });

/**
 * This function gives the take of the bucket of the options. The take decides at once, without a
 * promise.
 *
 * - A whole `maxRequests` of 1 or more and a `window` above 0: a keyed limiter of the service on a
 *   memory store (CLI-40). Its token bucket gives `maxRequests` takes at once, and one more take
 *   each `window / maxRequests`.
 * - Kept for compatibility: a `maxRequests` above 1 that is not whole gives the same store with a
 *   bucket of that size. The keyed limiter refuses such a spec, so the rule is given in numbers.
 * - Kept for compatibility: a `window` of 0 or less fills the bucket again at each request. Thus a
 *   `maxRequests` of 1 or more limits nothing.
 * - Kept for compatibility: a `maxRequests` below 1 never lets a request in. A queued request
 *   waits without an end, and the timer of the queue keeps a process alive, as before.
 * - Kept for compatibility: an infinite `maxRequests` limits nothing.
 */
function bucketOf(maxRequests: number, window: number, clock: Clock): () => Decision {
  if (window <= 0 && maxRequests >= 1) {
    const remaining = Math.floor(maxRequests - 1);
    return () => ({ allowed: true, remaining });
  }
  if (!(maxRequests >= 1)) {
    // The wait of the queue before CLI-40: the time until one token, or 1 ms when it has no value
    const wait = ((1 - maxRequests) * window) / maxRequests;
    const waitMs = Number.isFinite(wait) && wait > 1 ? wait : 1;
    return () => ({ allowed: false, retryAfter: msOf(waitMs), cause: "limit" });
  }
  if (maxRequests === Number.POSITIVE_INFINITY) return () => ({ allowed: true, remaining: Number.POSITIVE_INFINITY });
  const store = memoryStore(clock);
  const rule: LimitRule = Number.isInteger(maxRequests)
    ? keyedLimiter(
        LIMITER,
        {
          key: KEY,
          policy: { type: "token-bucket", rate: { value: maxRequests / window, unit: "count/ms" }, burst: { value: maxRequests, unit: "count" } },
          store: { kind: "local" },
          evict: { maxKeys: { value: 1, unit: "count" } },
        },
        store,
      ).rule
    : { type: "token-bucket", interval: window / maxRequests, burst: maxRequests };
  // The memory store decides in one step without a promise
  return () => store.take({ limiter: LIMITER, key: KEY, rule, maxKeys: 1 }) as Decision;
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
 *   window: minutes(1),
 *   strategy: "reject"   // Throw error when exceeded
 * }));
 *
 * // Queue strategy
 * client.use(createRateLimitMiddleware({
 *   maxRequests: 10,
 *   window: seconds(1),
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
    strategy = "reject",
    maxQueueSize = 100,
    message = "Rate limit exceeded",
    onRateLimitExceeded,
  } = options;
  const window = optionalMs(options.window, "window") ?? TIMER_DEFAULTS.rateLimit.windowMs;
  const clock = options.clock ?? wallClock();
  const takeOfBucket = bucketOf(maxRequests, window, clock);
  let totalRequests = 0;
  let rejectedRequests = 0;
  /** The whole tokens after the last decision: `remaining` of a take, or 0 after a refusal. */
  let tokensAvailable = maxRequests;

  // Queue for "queue" strategy
  const queue: QueuedRequest[] = [];
  let drainTimer: Cancel | undefined;

  /** One take of the bucket, at once, so the requests keep their order, as before. */
  function take(): Decision {
    const decision = takeOfBucket();
    tokensAvailable = decision.allowed ? decision.remaining : 0;
    return decision;
  }

  /**
   * Get current statistics.
   */
  function getStats(): RateLimitStats {
    return {
      tokensAvailable,
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
    if (queue.length === 0 && take().allowed) {
      // Token available
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
        timestamp: clock.now(),
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
   * is not empty. The wait is the `retryAfter` of the refusal of the bucket. The timer of the
   * default clock keeps the process alive while requests wait: before, an unref'd timer let the
   * process exit with queued requests that never ran (deep dive TRN-12).
   */
  function scheduleDrain(): void {
    if (drainTimer !== undefined) return;
    while (queue.length > 0) {
      const decision = take();
      if (!decision.allowed) {
        // The time until the next whole token
        const wait = Math.max(1, Math.ceil(valueIn(decision.retryAfter, "ms")));
        drainTimer = clock.after(wait, () => {
          drainTimer = undefined;
          scheduleDrain();
        });
        return;
      }
      queue.shift()!.resolve();
    }
  }

  const middleware = <TReq, TRes>(next: ClientRunner<TReq, TRes>): ClientRunner<TReq, TRes> => {
    return async function* (context: ClientContext<TReq>) {
      totalRequests++;

      // Acquire token (may throw or wait)
      if (!(await acquireToken(context.message.signal))) {
        yield abortedItem<TRes>(context.message.id);
        return;
      }
      // The state for the other middlewares (RateLimitContext)
      context.message.metadata["rateLimit"] = {
        tokensAvailable,
        maxTokens: maxRequests,
        queueSize: queue.length,
      };

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
 *   users: { maxRequests: 100, window: minutes(1) },
 *   orders: { maxRequests: 50, window: minutes(1) },
 *   default: { maxRequests: 200, window: minutes(1) }
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
