/**
 * Interceptors for every host (roadmap 1.2): a timeout, tracing and metrics.
 *
 * An interceptor runs around each invocation of `invokeProcedure()`, also the nested calls. A
 * host takes a list: `ProcedureServer({ interceptors })`, `new Client({ interceptors })` or
 * `invokeProcedure(procedure, input, { interceptors })`. See `invoke.ts` for the types.
 */

import { InvocationError, type Interceptor, type Invocation, type ProcedureOutput } from "./invoke.js";
import { pathToKey, type ProcedurePath } from "./types.js";

// =============================================================================
// Timeout
// =============================================================================

export interface TimeoutInterceptorOptions {
  /** The time limit in milliseconds. 0 or less: no limit. */
  ms: number;
  /**
   * The invocations to limit. The default is the calls of the host (depth 0): a nested call gets
   * the signal of its parent, so the limit of the parent ends it too.
   */
  appliesTo?: ((invocation: Invocation) => boolean) | undefined;
  /** This function gets each invocation that the interceptor limits (for tests and logs). */
  onLimit?: ((invocation: Invocation) => void) | undefined;
}

/** A signal that aborts when one of the signals aborts. */
function anySignal(signals: AbortSignal[]): AbortSignal {
  const any = (AbortSignal as { any?: (signals: AbortSignal[]) => AbortSignal }).any;
  if (any) return any(signals);
  const controller = new AbortController();
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      break;
    }
    signal.addEventListener("abort", () => controller.abort(signal.reason), { once: true });
  }
  return controller.signal;
}

function timeoutError(path: ProcedurePath, ms: number): InvocationError {
  return new InvocationError("TIMEOUT", `Procedure timed out after ${ms} ms: ${pathToKey(path)}`, path);
}

/**
 * The items of a stream until the deadline. At the deadline, the reader gets the TIMEOUT error
 * and the stream gets `return()`.
 */
async function* itemsUntil<T>(
  items: AsyncGenerator<T, void, undefined>,
  deadline: Promise<never>,
  done: () => void,
): AsyncGenerator<T, void, undefined> {
  let finished = false;
  try {
    for (;;) {
      const step = await Promise.race([items.next(), deadline]);
      if (step.done) {
        finished = true;
        return;
      }
      yield step.value;
    }
  } finally {
    done();
    // The generator can wait on an await that the aborted signal ends later: do not wait for it
    if (!finished) void items.return(undefined).catch(() => undefined);
  }
}

/**
 * This interceptor ends an invocation that runs longer than `ms`: the reader gets a TIMEOUT
 * error, and the handler's signal aborts. A handler that ignores its signal can run on, but its
 * result is not used. For a stream, the limit covers the whole stream.
 */
export function timeoutInterceptor(options: TimeoutInterceptorOptions): Interceptor {
  const { ms } = options;
  const appliesTo = options.appliesTo ?? ((invocation: Invocation) => invocation.depth === 0);
  return async (invocation, next) => {
    if (!(ms > 0) || !appliesTo(invocation)) return next();
    options.onLimit?.(invocation);

    const controller = new AbortController();
    const signal = invocation.signal ? anySignal([invocation.signal, controller.signal]) : controller.signal;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        const error = timeoutError(invocation.path, ms);
        controller.abort(error);
        reject(error);
      }, ms);
    });
    // A deadline that no one waits for must not be an unhandled rejection
    deadline.catch(() => undefined);
    const stop = (): void => clearTimeout(timer);

    let output: ProcedureOutput<unknown>;
    try {
      output = await Promise.race([next({ signal }), deadline]);
    } catch (error) {
      stop();
      throw error;
    }
    if (output.kind === "value") {
      stop();
      return output;
    }
    return { kind: "stream", items: itemsUntil(output.items, deadline, stop) };
  };
}

// =============================================================================
// Tracing
// =============================================================================

/** One invocation as a span of a trace. */
export interface InvocationSpan {
  readonly id: string;
  /** The span of the invocation whose handler made this call. A call of a host has none. */
  readonly parentId: string | undefined;
  /** The same for every span of one call of a host. */
  readonly traceId: string;
  readonly path: ProcedurePath;
  readonly key: string;
  readonly depth: number;
  /** The start, in milliseconds from `now()`. */
  readonly start: number;
  end: number | undefined;
  durationMs: number | undefined;
  status: "running" | "ok" | "error";
  /** The message of the error. */
  error?: string | undefined;
  /** The code of an invocation error (`TIMEOUT`, `VALIDATION_ERROR` and so on). */
  code?: string | undefined;
  kind?: "value" | "stream" | undefined;
  /** The number of items of a stream. */
  items?: number | undefined;
}

export interface TracingInterceptorOptions {
  /** This function gets each span when its invocation ends (a stream: when the stream ends). */
  onSpan: (span: InvocationSpan) => void;
  /** This function gets each span when its invocation starts. */
  onStart?: ((span: InvocationSpan) => void) | undefined;
  /** The clock. The default is `performance.now()`. */
  now?: (() => number) | undefined;
}

let traceCount = 0;

/**
 * This interceptor makes a span for each invocation, with the span of its parent. A host can
 * send the spans to a trace backend, a log or the site's trace view.
 */
export function tracingInterceptor(options: TracingInterceptorOptions): Interceptor {
  const now = options.now ?? (() => performance.now());
  const prefix = `t${++traceCount}-${Math.random().toString(36).slice(2, 8)}`;
  let spanCount = 0;
  /** The open spans, by the id of their invocation */
  const open = new Map<number, InvocationSpan>();

  const finish = (span: InvocationSpan, invocationId: number, error?: unknown): void => {
    span.end = now();
    span.durationMs = span.end - span.start;
    if (error !== undefined) {
      span.status = "error";
      span.error = error instanceof Error ? error.message : String(error);
      const code = (error as { code?: unknown }).code;
      if (typeof code === "string") span.code = code;
    } else {
      span.status = "ok";
    }
    open.delete(invocationId);
    options.onSpan(span);
  };

  return async (invocation, next) => {
    const parent = invocation.parent ? open.get(invocation.parent.id) : undefined;
    const id = `${prefix}-${++spanCount}`;
    const span: InvocationSpan = {
      id,
      parentId: parent?.id,
      traceId: parent?.traceId ?? id,
      path: invocation.path,
      key: pathToKey(invocation.path),
      depth: invocation.depth,
      start: now(),
      end: undefined,
      durationMs: undefined,
      status: "running",
    };
    open.set(invocation.id, span);
    options.onStart?.(span);

    let output: ProcedureOutput<unknown>;
    try {
      output = await next();
    } catch (error) {
      finish(span, invocation.id, error);
      throw error;
    }
    if (output.kind === "value") {
      span.kind = "value";
      finish(span, invocation.id);
      return output;
    }
    span.kind = "stream";
    span.items = 0;
    const items = output.items;
    return {
      kind: "stream",
      items: (async function* () {
        let failure: unknown;
        try {
          for await (const item of items) {
            span.items = (span.items ?? 0) + 1;
            yield item;
          }
        } catch (error) {
          failure = error;
          throw error;
        } finally {
          finish(span, invocation.id, failure);
        }
      })(),
    };
  };
}

// =============================================================================
// Metrics
// =============================================================================

/** The counts of one procedure. */
export interface ProcedureMetrics {
  calls: number;
  errors: number;
  /** The sum of the durations, in milliseconds. */
  totalMs: number;
  maxMs: number;
}

/** A metrics interceptor and its counts. */
export interface MetricsInterceptor {
  interceptor: Interceptor;
  /** A copy of the counts, by procedure key. */
  snapshot(): Record<string, ProcedureMetrics>;
  reset(): void;
}

/** This function makes an interceptor that counts the calls, the errors and the time of each procedure. */
export function metricsInterceptor(options: { now?: () => number } = {}): MetricsInterceptor {
  const counts = new Map<string, ProcedureMetrics>();
  const record = (key: string, duration: number, failed: boolean): void => {
    const entry = counts.get(key) ?? { calls: 0, errors: 0, totalMs: 0, maxMs: 0 };
    entry.calls++;
    if (failed) entry.errors++;
    entry.totalMs += duration;
    entry.maxMs = Math.max(entry.maxMs, duration);
    counts.set(key, entry);
  };
  return {
    interceptor: tracingInterceptor({
      onSpan: (span) => record(span.key, span.durationMs ?? 0, span.status === "error"),
      ...(options.now ? { now: options.now } : {}),
    }),
    snapshot: () => Object.fromEntries([...counts].map(([key, value]) => [key, { ...value }])),
    reset: () => counts.clear(),
  };
}
