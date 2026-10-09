/**
 * Universal Timeout Middleware
 *
 * Protocol-agnostic timeout handling with per-request and overall timeouts.
 * Works with any transport!
 */

import type { ClientMiddleware, ClientRunner, ClientContext, ResponseItem, TypedClientMiddleware } from "../types.js";
import { ABORTED_FIRST, errorItem, nextOrAbort } from "./items.js";
import type { TimeoutContext } from "./contexts.js";

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
 * Run `next` with a timeout. When the time runs out, the request's signal aborts, and the
 * reader gets one TIMEOUT error item in place of the transport's ABORTED item or thrown error.
 * The middleware does not wait for a transport that ignores the signal.
 *
 * Before, the middleware waited for a thrown error, but the transports yield error items: the
 * reader got "ABORTED" (not retryable), so a per-attempt timeout with retry never retried, and
 * a transport that ignored the signal kept the caller waiting (deep dive TRN-7).
 */
async function* runWithTimeout<TReq, TRes>(
  next: ClientRunner<TReq, TRes>,
  context: ClientContext<TReq>,
  ms: number,
  message: string,
  retryable: boolean,
): AsyncGenerator<ResponseItem<TRes>, void, undefined> {
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), ms);

  // Compose with existing signal
  const originalSignal = context.message.signal;
  const { controller: composedController, cleanup } = composeAbortSignals(originalSignal, timeoutController.signal);
  context.message.signal = composedController.signal;
  const timedOut = (): boolean => timeoutController.signal.aborted && !originalSignal?.aborted;
  const timeoutItem = (): ResponseItem<TRes> => errorItem<TRes>(context.message.id, "TIMEOUT", message, retryable);

  const iterator = next(context)[Symbol.asyncIterator]();
  // "running": a next() may be pending; "done": the iterator ended; "abandoned": the timeout won
  let phase: "running" | "done" | "abandoned" = "running";
  try {
    for (;;) {
      const result = await nextOrAbort(iterator, timeoutController.signal);
      if (result === ABORTED_FIRST) {
        phase = "abandoned";
        // The transport did not stop in time: end it in the background, and give the timeout
        void Promise.resolve(iterator.return?.()).catch(() => undefined);
        yield timeoutItem();
        return;
      }
      if (result.done) {
        phase = "done";
        return;
      }
      if (result.value.status.type === "error" && timedOut()) {
        // The transport saw the aborted signal and reported ABORTED: it is a timeout
        yield timeoutItem();
        return;
      }
      yield result.value;
    }
  } catch (error) {
    phase = "done";
    if (timedOut()) {
      yield timeoutItem();
      return;
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
    cleanup();
    // Restore the caller's original signal; we only swapped in the composed signal for this
    // attempt. Leaving the (possibly aborted) composed signal in place poisons subsequent
    // retry attempts with instant aborts. See documentation/BUGS-2026-07.md (H10).
    if (originalSignal) {
      context.message.signal = originalSignal;
    } else {
      delete context.message.signal;
    }
    // The reader stopped early: the transport stops too
    if (phase === "running") await iterator.return?.();
  }
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

      // The overall timeout ends the request: a retry inside it cannot help
      yield* runWithTimeout(next, context, overall, message, false);
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

      // A retry middleware outside this one can start a new attempt
      yield* runWithTimeout(next, context, perAttempt, message, true);
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
