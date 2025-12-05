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

import type { ClientMiddleware, ClientRunner, ClientContext } from "../types";

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
): ClientMiddleware {
  const {
    failureThreshold = 5,
    failureWindow = 10000,
    resetTimeout = 30000,
    successThreshold = 2,
    isFailure = () => true,
    onStateChange,
  } = options;

  let state: CircuitState = "CLOSED";
  let failures: FailureRecord[] = [];
  let successes = 0;
  let totalRequests = 0;
  let resetTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Change circuit state.
   */
  function setState(newState: CircuitState): void {
    const oldState = state;
    state = newState;

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

    // Check if threshold exceeded
    if (failures.length >= failureThreshold) {
      if (state === "CLOSED") {
        setState("OPEN");
        scheduleReset();
      } else if (state === "HALF_OPEN") {
        // Failed during testing - reopen circuit
        setState("OPEN");
        successes = 0;
        scheduleReset();
      }
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
  }

  /**
   * Check if request should be allowed.
   */
  function shouldAllowRequest(): boolean {
    if (state === "CLOSED") {
      return true;
    }

    if (state === "OPEN") {
      return false;
    }

    // HALF_OPEN - allow limited requests for testing
    return true;
  }

  return <TReq, TRes>(
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

      try {
        // Execute request
        yield* next(context);

        // Record success
        recordSuccess();
      } catch (error) {
        // Check if error should count as failure
        if (isFailure(error as Error)) {
          recordFailure(error as Error);
        }

        throw error;
      }
    };
  };
}

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
  _middleware: ClientMiddleware
): CircuitBreakerStats | null {
  // This is a placeholder - in practice, you'd need to expose stats
  // through a closure or separate API
  return null;
}
