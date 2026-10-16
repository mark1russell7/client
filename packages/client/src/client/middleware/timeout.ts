/**
 * Universal Timeout Middleware
 *
 * Protocol-agnostic timeout handling with per-request and overall timeouts.
 * Works with any transport!
 */

import type { ClientRunner, ClientContext, ResponseItem, TypedClientMiddleware } from "../types.js";
import { ABORTED_FIRST, abortedItem, errorItem, nextOrAbort, withDelivery } from "./items.js";
import type { TimeoutContext } from "./contexts.js";
import { deadlineOf, narrowDeadline, restoreDeadline } from "../deadline.js";
import { resilience } from "./resilience.js";
import { optionalMs, type Duration } from "../../duration.js";

/**
 * Timeout middleware options.
 */
export interface TimeoutOptions {
  /**
   * The time of the entire request (including retries), for example `seconds(10)`.
   * @default undefined (no overall timeout)
   */
  overall?: Duration | undefined;

  /**
   * The time of each individual attempt, for example `seconds(2)`.
   * Useful with retry middleware for per-attempt timeouts.
   * @default undefined (no per-attempt timeout)
   */
  perAttempt?: Duration | undefined;

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

  // Fallback: Manual composition for older environments. The composed signal keeps the reason of
  // the signal that aborted, as with AbortSignal.any() (before, it got a new AbortError).
  const controller = new AbortController();
  const abortListeners: Array<() => void> = [];

  for (const signal of validSignals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      break;
    }

    const listener = () => controller.abort(signal.reason);
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
 * The middleware does not wait for a transport that ignores the signal: not after the timeout,
 * and not after an abort of the caller, which gives an ABORTED item.
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
  // The overall timeout is the deadline of the call: the transport sends its remaining time to
  // the server (roadmap R10). The timeout of one try is not: the server keeps a keyed write
  // until the next try can get its result, and the request signal stops another call.
  const deadlineBefore = retryable ? deadlineOf(context.message.metadata) : narrowDeadline(context.message.metadata, Date.now() + ms);

  // Compose with existing signal
  const originalSignal = context.message.signal;
  const { controller: composedController, cleanup } = composeAbortSignals(originalSignal, timeoutController.signal);
  context.message.signal = composedController.signal;
  const timedOut = (): boolean => timeoutController.signal.aborted && !originalSignal?.aborted;
  // The request left before the time ran out: the server can still run it (R1)
  const timeoutItem = (): ResponseItem<TRes> =>
    withDelivery(errorItem<TRes>(context.message.id, "TIMEOUT", message, retryable), "indeterminate");

  const iterator = next(context)[Symbol.asyncIterator]();
  // "running": a next() may be pending; "done": the iterator ended; "abandoned": the timeout won
  let phase: "running" | "done" | "abandoned" = "running";
  try {
    for (;;) {
      // The timeout and the abort of the caller both end the wait (roadmap R30: before, the wait
      // ignored the abort of the caller, so a transport that ignored the signal kept the caller
      // waiting until the timeout, and the caller got TIMEOUT for its own abort)
      const result = await nextOrAbort(iterator, composedController.signal);
      if (result === ABORTED_FIRST) {
        phase = "abandoned";
        // The transport did not stop in time: end it in the background, and give the timeout or the abort
        void Promise.resolve(iterator.return?.()).catch(() => undefined);
        yield timedOut() ? timeoutItem() : abortedItem<TRes>(context.message.id);
        return;
      }
      if (result.done) {
        phase = "done";
        return;
      }
      // An item or an error of the transport comes before the abort. `nextOrAbort` adds its abort
      // listener before it calls `next()`, so a later abort gives ABORTED_FIRST, not an item.
      yield result.value;
    }
  } catch (error) {
    phase = "done";
    throw error;
  } finally {
    clearTimeout(timeoutId);
    restoreDeadline(context.message.metadata, deadlineBefore);
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
 * client.use(createOverallTimeoutMiddleware({ overall: seconds(5) }));
 *
 * // Override per-call via context
 * await client.call(method, payload, {
 *   context: { timeout: { overall: seconds(10) } }
 * });
 * ```
 */
export function createOverallTimeoutMiddleware(options: Pick<TimeoutOptions, "overall" | "message">): TypedClientMiddleware<TimeoutContext, {}> {
  const { message = "Overall request timeout" } = options;
  const defaultOverall = optionalMs(options.overall, "overall");

  return <TReq, TRes>(next: ClientRunner<TReq, TRes>): ClientRunner<TReq, TRes> => {
    return async function* (context: ClientContext<TReq>) {
      // Read from metadata first (user-provided context), then fall back to options
      const overall =
        optionalMs((context.message.metadata.timeout as TimeoutContext["timeout"] | undefined)?.overall, "timeout.overall") ??
        defaultOverall;

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
 * client.use(createTimeoutMiddleware({ perAttempt: seconds(1) }));
 *
 * // Override per-call via context
 * await client.call(method, payload, {
 *   context: { timeout: { perAttempt: seconds(2) } }
 * });
 * ```
 */
export function createTimeoutMiddleware(options: Pick<TimeoutOptions, "perAttempt" | "message">): TypedClientMiddleware<TimeoutContext, {}> {
  const { message = "Request timeout" } = options;
  const defaultPerAttempt = optionalMs(options.perAttempt, "perAttempt");

  return <TReq, TRes>(next: ClientRunner<TReq, TRes>): ClientRunner<TReq, TRes> => {
    return async function* (context: ClientContext<TReq>) {
      // Read from metadata first (user-provided context), then fall back to options
      const perAttempt =
        optionalMs((context.message.metadata.timeout as TimeoutContext["timeout"] | undefined)?.perAttempt, "timeout.perAttempt") ??
        defaultPerAttempt;

      if (!perAttempt) {
        // No timeout - passthrough
        yield* next(context);
        return;
      }

      // The limit of one try is at most the remaining time of the call (roadmap R10)
      const deadline = deadlineOf(context.message.metadata);
      const limit = deadline === undefined ? perAttempt : Math.max(0, Math.min(perAttempt, deadline - Date.now()));

      // A retry middleware outside this one can start a new attempt
      yield* runWithTimeout(next, context, limit, message, true);
    };
  };
}

/**
 * Create combined timeout middleware with both overall and per-attempt timeouts.
 *
 * @deprecated Use `resilience({ overall, perAttempt, retry })`. This function puts the two
 * timeouts in one slot, so a retry middleware that you add with another `use()` cannot sit
 * between them: the retry is outside both, or inside both. `resilience` puts the retry between
 * them (roadmap R10).
 *
 * @param options - Timeout configuration
 * @returns Middleware function
 *
 * @example
 * ```typescript
 * client.use(resilience({ overall: seconds(5), perAttempt: seconds(1), retry: { maxRetries: 2 } }));
 * ```
 */
export function createCombinedTimeoutMiddleware(options: TimeoutOptions): TypedClientMiddleware<TimeoutContext, {}> {
  const { overall, perAttempt, message = "Request timeout" } = options;
  return resilience({ overall, perAttempt, message }) as TypedClientMiddleware<TimeoutContext, {}>;
}
