/**
 * The resilience preset (roadmap R10): the timeouts, the cache, the retry, the circuit breaker and
 * the rate limit of a client, in the one order that works.
 *
 * The first layer is the outermost one:
 *
 * 1. The overall timeout: it covers the whole call, retries included.
 * 2. The cache: a hit makes no request, so no try and no slot of the rate limit.
 * 3. The retry: it starts each try.
 * 4. The circuit breaker: it counts each try, and an open breaker stops a retry loop.
 * 5. The rate limit: each try takes a slot.
 * 6. The timeout of one try: inside the retry, so the retry can start the next try.
 *
 * Each order pitfall of a hand-made stack is impossible here: an overall timeout inside the
 * retry, a per-try timeout outside it, or a rate limit outside the retry. The deadline of the
 * call goes to the server as `procedure-timeout` with each try (`client/deadline.ts`).
 */

import type { ClientMiddleware, ClientRunner, TypedClientMiddleware } from "../types.js";
import type { CacheContext, CircuitBreakerContext, RateLimitContext, RetryContext, TimeoutContext } from "./contexts.js";
import { createCacheMiddleware, type CacheOptions } from "./cache.js";
import { createCircuitBreakerMiddleware, type CircuitBreakerOptions } from "./circuit-breaker.js";
import { createRateLimitMiddleware, type RateLimitOptions } from "./rate-limit.js";
import { createRetryMiddleware, type RetryOptions } from "./retry.js";
import { createOverallTimeoutMiddleware, createTimeoutMiddleware } from "./timeout.js";

/** The parts of the preset. An absent part is not in the stack. */
export interface ResilienceOptions {
  /** The time of the whole call, retries included, in milliseconds. */
  overall?: number | undefined;
  /** The time of one try, in milliseconds. It is at most the remaining time of the call. */
  perAttempt?: number | undefined;
  /** The retry. Its `idempotent` option decides which calls go again after an indeterminate try. */
  retry?: RetryOptions | undefined;
  /** The circuit breaker. */
  breaker?: CircuitBreakerOptions | undefined;
  /** The cache of the reads that opt in. */
  cache?: CacheOptions | undefined;
  /** The rate limit of the tries. */
  rateLimit?: RateLimitOptions | undefined;
  /** The message of a timeout error. */
  message?: string | undefined;
}

/** The context that the preset gives: the context of each part that it can have. */
export type ResilienceContext = TimeoutContext & Partial<RetryContext & CacheContext & CircuitBreakerContext & RateLimitContext>;

/**
 * This function gives one middleware with the parts of `options` in the correct order (see the
 * file comment). Add it with one `use()`.
 *
 * @example
 * ```typescript
 * const client = new Client(transport).use(
 *   resilience({
 *     overall: 10_000,
 *     perAttempt: 3_000,
 *     retry: { maxRetries: 2, idempotent: idempotentIn(registry) },
 *     breaker: { failureThreshold: 5 },
 *   }),
 * );
 * ```
 */
export function resilience(options: ResilienceOptions): TypedClientMiddleware<ResilienceContext, {}> {
  const layers: ClientMiddleware[] = [];
  const message = options.message;
  if (options.overall) {
    layers.push(createOverallTimeoutMiddleware({ overall: options.overall, ...(message ? { message: `${message} (overall)` } : {}) }) as ClientMiddleware);
  }
  if (options.cache) layers.push(createCacheMiddleware(options.cache) as ClientMiddleware);
  if (options.retry) layers.push(createRetryMiddleware(options.retry) as ClientMiddleware);
  if (options.breaker) layers.push(createCircuitBreakerMiddleware(options.breaker) as ClientMiddleware);
  if (options.rateLimit) layers.push(createRateLimitMiddleware(options.rateLimit) as ClientMiddleware);
  if (options.perAttempt) {
    layers.push(createTimeoutMiddleware({ perAttempt: options.perAttempt, ...(message ? { message: `${message} (per-attempt)` } : {}) }) as ClientMiddleware);
  }
  const composed = <TReq, TRes>(next: ClientRunner<TReq, TRes>): ClientRunner<TReq, TRes> =>
    layers.reduceRight<ClientRunner<TReq, TRes>>((inner, layer) => (layer as ClientMiddleware<TReq, TRes>)(inner), next);
  return composed as TypedClientMiddleware<ResilienceContext, {}>;
}
