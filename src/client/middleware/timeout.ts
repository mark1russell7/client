/**
 * Universal Timeout Middleware
 *
 * Protocol-agnostic timeout handling with per-request and overall timeouts.
 * Works with any transport!
 */

import type { ClientMiddleware, ClientRunner, ClientContext, TypedClientMiddleware } from "../types";
import type { TimeoutContext } from "./contexts";

/**
 * Timeout middleware options.
 */
export interface TimeoutOptions {
  /**
   * Timeout in milliseconds for the entire request (including retries).
   * @default undefined (no overall timeout)
   */
  overall?: number;

  /**
   * Timeout in milliseconds for each individual attempt.
   * Useful with retry middleware for per-attempt timeouts.
   * @default undefined (no per-attempt timeout)
   */
  perAttempt?: number;

  /**
   * Custom timeout error message.
   * @default "Request timeout"
   */
  message?: string;
}

/**
 * Compose multiple AbortSignals into one.
 *
 * Uses AbortSignal.any() if available (Node 20+, modern browsers),
 * otherwise falls back to manual composition with cleanup.
 *
 * Returns a controller whose signal aborts when ANY of the input signals abort.
 *
 * @param signals - Array of signals to compose (undefined values filtered out)
 * @returns Object with controller and cleanup function
 */
function composeAbortSignals(...signals: (AbortSignal | undefined)[]): {
  controller: AbortController;
  cleanup: () => void;
} {
  const validSignals = signals.filter((s): s is AbortSignal => s !== undefined);

  if (validSignals.length === 0) {
    return {
      controller: new AbortController(),
      cleanup: () => {},
    };
  }

  if (validSignals.length === 1) {
    // Single signal - no composition needed
    const signal = validSignals[0];
    // Type guard: signal is guaranteed to be defined since validSignals[0] exists
    if (!signal) {
      return { controller: new AbortController(), cleanup: () => {} };
    }
    if (signal.aborted) {
      const controller = new AbortController();
      controller.abort();
      return { controller, cleanup: () => {} };
    }
    return {
      controller: { signal } as AbortController,
      cleanup: () => {},
    };
  }

  // Use AbortSignal.any() if available (Node 20+, modern browsers)
  // This is more efficient and handles cleanup automatically
  if ("any" in AbortSignal && typeof (AbortSignal as any).any === "function") {
    try {
      const composedSignal = (AbortSignal as any).any(validSignals);
      return {
        controller: { signal: composedSignal } as AbortController,
        cleanup: () => {}, // AbortSignal.any() handles cleanup internally
      };
    } catch {
      // Fall through to manual composition if AbortSignal.any() fails
    }
  }

  // Fallback: Manual composition for older environments
  const controller = new AbortController();
  const abortListeners: Array<() => void> = [];

  for (const signal of validSignals) {
    if (signal.aborted) {
      controller.abort();
      break;
    }

    const listener = () => controller.abort();
    signal.addEventListener("abort", listener, { once: true });
    abortListeners.push(() => signal.removeEventListener("abort", listener));
  }

  const cleanup = () => {
    for (const remove of abortListeners) {
      remove();
    }
  };

  return { controller, cleanup };
}

/**
 * Create overall timeout middleware.
 *
 * Applies timeout to the entire request, including all retry attempts.
 * If timeout is exceeded, the request is aborted.
 *
 * **Context Override**: metadata.timeout.overall takes precedence over options.
 *
 * @param options - Timeout configuration (defaults, can be overridden per-call)
 * @returns Middleware function
 *
 * @example
 * ```typescript
 * // Create middleware with default timeout
 * client.use(createOverallTimeoutMiddleware({ overall: 5000 }));
 *
 * // Override per-call via context
 * await client.call(method, payload, {
 *   context: { timeout: { overall: 10000 } }
 * });
 * ```
 */
export function createOverallTimeoutMiddleware(options: Pick<TimeoutOptions, "overall" | "message">): TypedClientMiddleware<TimeoutContext, {}> {
  const { overall: defaultOverall, message = "Overall request timeout" } = options;

  return <TReq, TRes>(next: ClientRunner<TReq, TRes>): ClientRunner<TReq, TRes> => {
    return async function* (context: ClientContext<TReq>) {
      // Read from metadata first (user-provided context), then fall back to options
      const overall = (context.message.metadata.timeout as TimeoutContext["timeout"] | undefined)?.overall
        ?? defaultOverall;

      if (!overall) {
        // No timeout - passthrough
        yield* next(context);
        return;
      }

      // Create timeout controller
      const timeoutController = new AbortController();
      const timeoutId = setTimeout(() => timeoutController.abort(), overall);

      // Compose with existing signal
      const { controller: composedController, cleanup } = composeAbortSignals(
        context.message.signal,
        timeoutController.signal,
      );

      // Replace context signal with composed signal
      const originalSignal = context.message.signal;
      context.message.signal = composedController.signal;

      try {
        const responseStream = next(context);
        yield* responseStream;
      } catch (error) {
        // Check if timeout caused the abort
        if (timeoutController.signal.aborted && !originalSignal?.aborted) {
          throw new Error(message);
        }
        throw error;
      } finally {
        clearTimeout(timeoutId);
        cleanup();
      }
    };
  };
}

/**
 * Create per-attempt timeout middleware.
 *
 * Applies timeout to each individual attempt (useful with retry middleware).
 * Each retry gets a fresh timeout.
 *
 * **Context Override**: metadata.timeout.perAttempt takes precedence over options.
 *
 * @param options - Timeout configuration (defaults, can be overridden per-call)
 * @returns Middleware function
 *
 * @example
 * ```typescript
 * // Create middleware with default timeout
 * client.use(createTimeoutMiddleware({ perAttempt: 1000 }));
 *
 * // Override per-call via context
 * await client.call(method, payload, {
 *   context: { timeout: { perAttempt: 2000 } }
 * });
 * ```
 */
export function createTimeoutMiddleware(options: Pick<TimeoutOptions, "perAttempt" | "message">): TypedClientMiddleware<TimeoutContext, {}> {
  const { perAttempt: defaultPerAttempt, message = "Request timeout" } = options;

  return <TReq, TRes>(next: ClientRunner<TReq, TRes>): ClientRunner<TReq, TRes> => {
    return async function* (context: ClientContext<TReq>) {
      // Read from metadata first (user-provided context), then fall back to options
      const perAttempt = (context.message.metadata.timeout as TimeoutContext["timeout"] | undefined)?.perAttempt
        ?? defaultPerAttempt;

      if (!perAttempt) {
        // No timeout - passthrough
        yield* next(context);
        return;
      }

      // Create timeout controller
      const timeoutController = new AbortController();
      const timeoutId = setTimeout(() => timeoutController.abort(), perAttempt);

      // Compose with existing signal
      const { controller: composedController, cleanup } = composeAbortSignals(
        context.message.signal,
        timeoutController.signal,
      );

      // Replace context signal with composed signal
      const originalSignal = context.message.signal;
      context.message.signal = composedController.signal;

      try {
        const responseStream = next(context);
        yield* responseStream;
      } catch (error) {
        // Check if timeout caused the abort
        if (timeoutController.signal.aborted && !originalSignal?.aborted) {
          throw new Error(message);
        }
        throw error;
      } finally {
        clearTimeout(timeoutId);
        cleanup();
      }
    };
  };
}

/**
 * Create combined timeout middleware with both overall and per-attempt timeouts.
 *
 * @param options - Timeout configuration
 * @returns Middleware function
 *
 * @example
 * ```typescript
 * client.use(createCombinedTimeoutMiddleware({
 *   overall: 5000,     // 5 seconds total
 *   perAttempt: 1000   // 1 second per attempt
 * }));
 * ```
 */
export function createCombinedTimeoutMiddleware(options: TimeoutOptions): TypedClientMiddleware<TimeoutContext, {}> {
  const { overall, perAttempt, message = "Request timeout" } = options;

  return <TReq, TRes>(next: ClientRunner<TReq, TRes>): ClientRunner<TReq, TRes> => {
    // Compose both timeout middlewares
    let composed: ClientRunner<TReq, TRes> = next;

    if (perAttempt) {
      const perAttemptMiddleware = createTimeoutMiddleware({ perAttempt, message: `${message} (per-attempt)` }) as ClientMiddleware<TReq, TRes>;
      composed = perAttemptMiddleware(composed);
    }

    if (overall) {
      const overallMiddleware = createOverallTimeoutMiddleware({ overall, message: `${message} (overall)` }) as ClientMiddleware<TReq, TRes>;
      composed = overallMiddleware(composed);
    }

    return composed;
  };
}
