/**
 * Circuit Breaker Middleware
 *
 * Prevents cascading failures by failing fast when a service is unhealthy.
 * Implements the circuit breaker pattern with three states:
 * - CLOSED: Normal operation (requests pass through)
 * - OPEN: Service unhealthy (requests fail immediately)
 * - HALF_OPEN: Testing if service recovered (limited requests)
 *
 * Works with both client and server!
 */

import type { ClientMiddleware, ClientRunner, ClientContext, TypedClientMiddleware } from "../types.js";
import type { CircuitBreakerContext } from "./contexts.js";

/**
 * Circuit breaker state.
 */
export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

/**
 * Circuit breaker options.
 */
export interface CircuitBreakerOptions {
  /**
   * Number of failures before opening circuit.
   * @default 5
   */
  failureThreshold?: number;

  /**
   * Time window for counting failures (in milliseconds).
   * @default 10000 (10 seconds)
   */
  failureWindow?: number;

  /**
   * Time to wait before attempting to close circuit (in milliseconds).
   * @default 30000 (30 seconds)
   */
  resetTimeout?: number;

  /**
   * Number of successful requests required to close circuit from HALF_OPEN.
   * @default 2
   */
  successThreshold?: number;

  /**
   * Number of probe requests that run at the same time in HALF_OPEN. The other requests fail
   * fast with a CircuitBreakerError until a probe ends.
   * @default successThreshold
   */
  halfOpenMaxRequests?: number;

  /**
   * Custom error predicate.
   * Return true if error should count as failure.
   * @default All errors count as failures
   */
  isFailure?: (error: Error) => boolean;

  /**
   * Callback when circuit state changes.
   */
  onStateChange?: (oldState: CircuitState, newState: CircuitState) => void;
}

/**
 * Failure record for tracking errors.
 */
interface FailureRecord {
  timestamp: number;
  error: Error;
}

/**
 * Circuit breaker statistics.
 */
export interface CircuitBreakerStats {
  state: CircuitState;
  failures: number;
  successes: number;
  totalRequests: number;
  lastFailureTime: number | null;
  lastStateChange: number;
}

/**
 * Circuit breaker error thrown when circuit is open.
 */
export class CircuitBreakerError extends Error {
  constructor(
    public readonly state: CircuitState,
    public readonly lastError: Error | null
  ) {
    super(
      `Circuit breaker is ${state}${lastError ? `: ${lastError.message}` : ""}`
    );
    this.name = "CircuitBreakerError";
  }
}

/**
 * Create circuit breaker middleware.
 *
 * Automatically opens circuit when failure threshold is reached,
 * preventing requests from reaching unhealthy services.
 *
 * @param options - Circuit breaker configuration
 * @returns Middleware function
 *
 * @example
 * ```typescript
 * client.use(createCircuitBreakerMiddleware({
 *   failureThreshold: 5,      // Open after 5 failures
 *   failureWindow: 10000,      // Within 10 seconds
 *   resetTimeout: 30000,       // Try again after 30 seconds
 *   successThreshold: 2        // Close after 2 successes
 * }));
 * ```
 */
export function createCircuitBreakerMiddleware(
  options: CircuitBreakerOptions = {}
): TypedClientMiddleware<CircuitBreakerContext, {}> {
  const {
    failureThreshold = 5,
    failureWindow = 10000,
    resetTimeout = 30000,
    successThreshold = 2,
    isFailure = () => true,
    onStateChange,
  } = options;
  const halfOpenMaxRequests = options.halfOpenMaxRequests ?? successThreshold;

  let state: CircuitState = "CLOSED";
  let failures: FailureRecord[] = [];
  let successes = 0;
  let totalRequests = 0;
  let probesInFlight = 0;
  let lastStateChange = Date.now();
  let resetTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Change circuit state.
   */
  function setState(newState: CircuitState): void {
    const oldState = state;
    state = newState;
    if (oldState !== newState) lastStateChange = Date.now();

    if (oldState !== newState && onStateChange) {
      onStateChange(oldState, newState);
    }

    // Clear reset timer when moving to CLOSED
    if (newState === "CLOSED" && resetTimer) {
      clearTimeout(resetTimer);
      resetTimer = null;
    }
  }

  /**
   * Record a failure.
   */
  function recordFailure(error: Error): void {
    const now = Date.now();

    // Add failure
    failures.push({ timestamp: now, error });

    // Remove old failures outside window
    failures = failures.filter((f) => now - f.timestamp < failureWindow);

    if (state === "HALF_OPEN") {
      // Any failure while testing reopens the circuit immediately — don't wait for the full
      // failureThreshold. See documentation/BUGS-2026-07.md (H11).
      setState("OPEN");
      successes = 0;
      scheduleReset();
    } else if (state === "CLOSED" && failures.length >= failureThreshold) {
      setState("OPEN");
      scheduleReset();
    }
  }

  /**
   * Record a success.
   */
  function recordSuccess(): void {
    if (state === "HALF_OPEN") {
      successes++;
      if (successes >= successThreshold) {
        // Enough successes - close circuit
        setState("CLOSED");
        failures = [];
        successes = 0;
      }
    } else if (state === "CLOSED") {
      // Clear old failures on success
      const now = Date.now();
      failures = failures.filter((f) => now - f.timestamp < failureWindow);
    }
  }

  /**
   * Schedule circuit reset attempt.
   */
  function scheduleReset(): void {
    if (resetTimer) {
      clearTimeout(resetTimer);
    }

    resetTimer = setTimeout(() => {
      if (state === "OPEN") {
        setState("HALF_OPEN");
        successes = 0;
      }
    }, resetTimeout);
    // Don't keep the event loop alive just for the reset timer. See BUGS-2026-07.md (M4).
    resetTimer.unref?.();
  }

  /**
   * Check if request should be allowed. In HALF_OPEN, only `halfOpenMaxRequests` probes run at
   * the same time: the other requests fail fast until a probe ends (deep dive TRN-4: before,
   * HALF_OPEN let all traffic through).
   */
  function shouldAllowRequest(): boolean {
    if (state === "CLOSED") {
      return true;
    }

    if (state === "OPEN") {
      return false;
    }

    return probesInFlight < halfOpenMaxRequests;
  }

  function getStats(): CircuitBreakerStats {
    const now = Date.now();
    return {
      state,
      failures: failures.filter((f) => now - f.timestamp < failureWindow).length,
      successes,
      totalRequests,
      lastFailureTime: failures.length > 0 ? failures[failures.length - 1]!.timestamp : null,
      lastStateChange,
    };
  }

  const middleware = <TReq, TRes>(
    next: ClientRunner<TReq, TRes>
  ): ClientRunner<TReq, TRes> => {
    return async function* (context: ClientContext<TReq>) {
      totalRequests++;

      // Check if circuit allows request
      if (!shouldAllowRequest()) {
        const lastFailure =
          failures.length > 0 ? failures[failures.length - 1] : null;
        const lastError = lastFailure != null ? lastFailure.error : null;
        throw new CircuitBreakerError(state, lastError);
      }

      const probe = state === "HALF_OPEN";
      if (probe) probesInFlight++;
      // The outcome is recorded once, as soon as it is known. Transports report failures as
      // error items (BUGS-2026-07 H11), and a Client with throwOnError stops reading at the
      // error item: the generator then gets return() at the yield, and code after the loop
      // never runs. So the failure is recorded before the error item goes out (deep dive TRN-4).
      let recorded = false;
      const fail = (error: Error): void => {
        if (recorded) return;
        recorded = true;
        if (isFailure(error)) recordFailure(error);
      };
      try {
        for await (const item of next(context)) {
          if (item.status.type === "error") {
            const err = new Error(item.status.message);
            (err as Error & { code?: string }).code = item.status.code;
            fail(err);
          }
          yield item;
        }
      } catch (error) {
        // A thrown error (transport-level, not an error-status item) also counts as a failure.
        fail(error as Error);
        throw error;
      } finally {
        if (probe) probesInFlight--;
        // The stream ended, or the reader stopped early, with no error: a success
        if (!recorded) {
          recorded = true;
          recordSuccess();
        }
      }
    };
  };
  statsOf.set(middleware, getStats);
  return middleware;
}

/** The stats function of each circuit breaker middleware */
const statsOf = new WeakMap<object, () => CircuitBreakerStats>();

/**
 * Get circuit breaker statistics.
 *
 * Note: This requires storing the middleware instance to access stats.
 *
 * @example
 * ```typescript
 * const breaker = createCircuitBreakerMiddleware();
 * client.use(breaker);
 *
 * // Later...
 * const stats = getCircuitBreakerStats(breaker);
 * ```
 */
export function getCircuitBreakerStats(
  middleware: ClientMiddleware | TypedClientMiddleware<CircuitBreakerContext, {}>
): CircuitBreakerStats | null {
  // Before, this function always returned null (deep dive TRN-4)
  return statsOf.get(middleware as object)?.() ?? null;
}
