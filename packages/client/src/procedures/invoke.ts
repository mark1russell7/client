/**
 * Procedure invocation: the one way to run a procedure.
 *
 * `Client.exec()`, `Client.route()`, the local transport and `ProcedureServer` run each
 * procedure through `invokeProcedure()`. The function validates the input, makes the context,
 * runs the handler and validates each output. Thus every host applies the same rules
 * (ARCHITECTURE-PROPOSALS-2026-10 P1).
 *
 * A handler gives one value, or it is a generator that yields values (a stream). The result
 * tells which: `{ kind: "value" }` or `{ kind: "stream" }`. A caller that wants one value uses
 * `outputValue()` (the last item of a stream). A caller that wants each value uses `outputItems()`.
 *
 * Interceptors run around each invocation, the nested calls too (roadmap 1.2): policy, tracing,
 * timeouts and metrics for every host. `interceptors.ts` has a timeout, a tracing and a metrics
 * interceptor.
 */

import type {
  AnyProcedure,
  ProcedureClient,
  ProcedureContext,
  ProcedurePath,
  RepositoryProvider,
} from "./types.js";
import { pathToKey } from "./types.js";
import type { ProcedureRegistry } from "./registry.js";
import { PROCEDURE_REGISTRY } from "./registry.js";
import { nestedCallRefusal } from "./policy.js";
import { scopeOf, withScope, type HydrationEvent } from "./ref.js";
import type { EventBus } from "../events/types.js";
import { getGlobalEventBus, withEventBusSignal } from "../events/bus.js";

// =============================================================================
// Errors
// =============================================================================

/** The reasons for which an invocation fails before or after the handler. */
export type InvocationErrorCode =
  | "NOT_FOUND"
  | "NO_HANDLER"
  | "NOT_EXPOSED"
  | "NOT_DECLARED"
  | "VALIDATION_ERROR"
  | "OUTPUT_VALIDATION_ERROR"
  | "NO_OUTPUT"
  | "ABORTED"
  | "TIMEOUT";

/** An error of the invocation itself. An error that the handler throws passes through unchanged. */
export class InvocationError extends Error {
  override readonly name = "InvocationError";
  readonly code: InvocationErrorCode;
  readonly path: ProcedurePath;
  readonly retryable: boolean = false;

  constructor(code: InvocationErrorCode, message: string, path: ProcedurePath) {
    super(message);
    this.code = code;
    this.path = path;
  }
}

function abortError(path: ProcedurePath): InvocationError {
  return new InvocationError("ABORTED", `Procedure was aborted: ${pathToKey(path)}`, path);
}

// =============================================================================
// Types
// =============================================================================

/** The output of an invocation: one value, or a stream of values. */
export type ProcedureOutput<T = unknown> =
  | { readonly kind: "value"; readonly value: T }
  | { readonly kind: "stream"; readonly items: AsyncGenerator<T, void, undefined> };

export interface InvokeOptions {
  /**
   * The hydration observer of the program (see `HydrateOptions.onRef`). It goes to the context
   * (`ctx.onRef`) and to the nested calls, so the hydrations of this program report to it.
   */
  onRef?: ((event: HydrationEvent) => void) | undefined;
  /** The nested calls of `ctx.client` find their procedures here. The default is `PROCEDURE_REGISTRY`. */
  registry?: ProcedureRegistry | undefined;
  metadata?: Record<string, unknown> | undefined;
  /** When the signal aborts, a stream stops, and its handler gets `return()`. */
  signal?: AbortSignal | undefined;
  repository?: RepositoryProvider | undefined;
  /** The bus of `ctx.bus`. The default is the global bus of `getGlobalEventBus()`. */
  bus?: EventBus | undefined;
  /** The input is valid already (for example, the route resolver validated it). */
  inputValidated?: boolean | undefined;
  /**
   * This client replaces the default `ctx.client`, for example a Client that sends unknown paths
   * to its transport. A function gets the invocation, so its nested calls can name their parent.
   */
  client?: ProcedureClient | ((invocation: Invocation) => ProcedureClient) | undefined;
  /**
   * The expose rule of a server. A data-driven procedure (control flow, `runs-refs`, a procedure
   * that `procedure.define` made) can call only the paths for which it gives true. A code
   * procedure with `metadata.calls` can call what it declares and the exposed paths. See
   * `policy.ts` (deep dive MCP-3).
   */
  expose?: ((path: ProcedurePath) => boolean) | undefined;
  /** True: a code procedure without `metadata.calls` can call only the exposed paths. */
  strictCalls?: boolean | undefined;
  /** The interceptors of each invocation, the outermost first. The nested calls get them too. */
  interceptors?: readonly Interceptor[] | undefined;
  /** The invocation whose handler makes this call. The context client sets it for a nested call. */
  parent?: Invocation | undefined;
}

// =============================================================================
// Interceptors
// =============================================================================

let invocationCount = 0;

/** One invocation, as an interceptor sees it. */
export interface Invocation {
  /** A number that identifies the invocation in this process. `next()` keeps it. */
  readonly id: number;
  readonly procedure: AnyProcedure;
  readonly path: ProcedurePath;
  /** The input before its validation. */
  readonly input: unknown;
  readonly metadata: Record<string, unknown>;
  readonly signal: AbortSignal | undefined;
  /** The invocation whose handler made this nested call. A call of a host has none. */
  readonly parent: Invocation | undefined;
  /** 0 for a call of a host, 1 for its nested calls, and so on. */
  readonly depth: number;
}

/** The changes that an interceptor gives to the next step: the handler and the nested calls get them. */
export interface InvocationChanges {
  signal?: AbortSignal | undefined;
  metadata?: Record<string, unknown> | undefined;
}

/** The rest of the chain: the next interceptors, then the validation and the handler. */
export type InvocationNext = (changes?: InvocationChanges) => Promise<ProcedureOutput<unknown>>;

/**
 * A function around an invocation. It can examine the invocation, refuse it (throw), change its
 * signal or metadata (`next(changes)`), and examine or wrap the output.
 */
export type Interceptor = (invocation: Invocation, next: InvocationNext) => Promise<ProcedureOutput<unknown>>;

// =============================================================================
// Invocation
// =============================================================================

/** True for a value that `for await` can read: a generator, a stream. A string is not one. */
export function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return (
    value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    typeof (value as { [Symbol.asyncIterator]?: unknown })[Symbol.asyncIterator] === "function"
  );
}

function validateOutput(procedure: AnyProcedure, output: unknown): unknown {
  const result = procedure.output.safeParse(output);
  if (!result.success) {
    throw new InvocationError(
      "OUTPUT_VALIDATION_ERROR",
      `Output validation failed for ${pathToKey(procedure.path)}: ${result.error.message}`,
      procedure.path,
    );
  }
  return result.data;
}

/** The next item, or an abort error when the signal aborts first. */
function nextOrAbort<T>(iterator: AsyncIterator<T>, signal: AbortSignal, path: ProcedurePath): Promise<IteratorResult<T>> {
  if (signal.aborted) return Promise.reject(abortError(path));
  return new Promise((resolve, reject) => {
    const onAbort = (): void => reject(abortError(path));
    signal.addEventListener("abort", onAbort, { once: true });
    iterator.next().then(
      (result) => {
        signal.removeEventListener("abort", onAbort);
        resolve(result);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

/**
 * The items of a handler's stream, each validated with the output schema. When the reader stops
 * early or an item is not valid, the handler's generator gets `return()`, so its `finally` runs.
 */
async function* validatedItems(
  procedure: AnyProcedure,
  source: AsyncIterable<unknown>,
  signal: AbortSignal | undefined,
): AsyncGenerator<unknown, void, undefined> {
  const iterator = source[Symbol.asyncIterator]();
  let done = false;
  let aborted = false;
  try {
    for (;;) {
      let step: IteratorResult<unknown>;
      try {
        step = signal ? await nextOrAbort(iterator, signal, procedure.path) : await iterator.next();
      } catch (error) {
        // The handler threw (its generator is done), or the signal aborted (it is not)
        if (error instanceof InvocationError && error.code === "ABORTED") aborted = true;
        else done = true;
        throw error;
      }
      if (step.done) {
        done = true;
        return;
      }
      yield validateOutput(procedure, step.value);
    }
  } finally {
    if (!done) {
      // The generator of an aborted handler can wait on an await: do not wait for it
      const closing = Promise.resolve(iterator.return?.()).catch(() => undefined);
      if (!aborted) await closing;
    }
  }
}

/**
 * This function runs a procedure: it validates the input, makes the context, runs the handler
 * and validates the output. It throws an `InvocationError` for an invocation that cannot run,
 * and the handler's own error when the handler throws. The interceptors of the options run
 * around these steps.
 */
export async function invokeProcedure<TOutput = unknown>(
  procedure: AnyProcedure,
  input: unknown,
  options: InvokeOptions = {},
): Promise<ProcedureOutput<TOutput>> {
  const { path } = procedure;
  if (!procedure.handler) {
    throw new InvocationError("NO_HANDLER", `Procedure has no handler: ${pathToKey(path)}`, path);
  }
  if (options.signal?.aborted) throw abortError(path);

  const invocation: Invocation = {
    id: ++invocationCount,
    procedure,
    path,
    input,
    metadata: options.metadata ?? {},
    signal: options.signal,
    parent: options.parent,
    depth: options.parent ? options.parent.depth + 1 : 0,
  };
  const interceptors = options.interceptors ?? [];
  if (interceptors.length === 0) return runInvocation<TOutput>(invocation, options);

  const dispatch = (index: number, current: Invocation, currentOptions: InvokeOptions): Promise<ProcedureOutput<unknown>> => {
    const interceptor = interceptors[index];
    if (!interceptor) return runInvocation(current, currentOptions);
    return interceptor(current, (changes) => {
      if (!changes) return dispatch(index + 1, current, currentOptions);
      const changed: Invocation = {
        ...current,
        signal: changes.signal ?? current.signal,
        metadata: changes.metadata ?? current.metadata,
      };
      return dispatch(index + 1, changed, { ...currentOptions, signal: changed.signal, metadata: changed.metadata });
    });
  };
  return dispatch(0, invocation, options) as Promise<ProcedureOutput<TOutput>>;
}

/** The end of the chain: the validation, the context, the handler and the output. */
async function runInvocation<TOutput>(invocation: Invocation, options: InvokeOptions): Promise<ProcedureOutput<TOutput>> {
  const { procedure, path, input } = invocation;
  const handler = procedure.handler!;
  if (options.signal?.aborted) throw abortError(path);

  let data: unknown = input;
  if (!options.inputValidated) {
    const parsed = procedure.input.safeParse(input);
    if (!parsed.success) {
      throw new InvocationError(
        "VALIDATION_ERROR",
        `Input validation failed for ${pathToKey(path)}: ${parsed.error.message}`,
        path,
      );
    }
    // A parse makes a new object, without the hidden scope of a raw input (`withScope()`). The
    // scope goes onto the parsed data, so a runner with a Zod schema can read the names of the
    // caller (docs review DOC-10: before, each runner needed its own workaround).
    data = parsed.data === input ? input : withScope(parsed.data, scopeOf(input));
  }

  // The handler starts here, before the first await (the site's trace depends on it)
  const result: unknown = await handler(data, createProcedureContext(procedure, options, invocation));
  if (isAsyncIterable(result)) {
    return { kind: "stream", items: validatedItems(procedure, result, options.signal) as AsyncGenerator<TOutput, void, undefined> };
  }
  return { kind: "value", value: validateOutput(procedure, result) as TOutput };
}

/** This function finds the procedure at a path in the registry of the options, then runs it. */
export async function invokePath<TOutput = unknown>(
  path: ProcedurePath,
  input: unknown,
  options: InvokeOptions = {},
): Promise<ProcedureOutput<TOutput>> {
  const procedure = (options.registry ?? PROCEDURE_REGISTRY).get(path);
  if (!procedure) {
    throw new InvocationError("NOT_FOUND", `Procedure not found: ${pathToKey(path)}`, path);
  }
  return invokeProcedure<TOutput>(procedure, input, options);
}

// =============================================================================
// Consumption
// =============================================================================

/**
 * One value of an output: the value, or the last item of a stream (the "sponge" mode). An
 * empty stream is an error.
 */
export async function outputValue<T>(output: ProcedureOutput<T>, path: ProcedurePath = []): Promise<T> {
  if (output.kind === "value") return output.value;
  let last: { value: T } | undefined;
  for await (const item of output.items) last = { value: item };
  if (!last) {
    throw new InvocationError("NO_OUTPUT", `Procedure gave no output: ${pathToKey(path)}`, path);
  }
  return last.value;
}

/** Each value of an output: the items of a stream, or the one value. */
export async function* outputItems<T>(output: ProcedureOutput<T>): AsyncGenerator<T, void, undefined> {
  if (output.kind === "value") {
    yield output.value;
    return;
  }
  yield* output.items;
}

/** The items of an output that `start` gives. Nothing runs until the reader asks for the first item. */
export async function* streamOutput<T>(start: () => Promise<ProcedureOutput<T>>): AsyncGenerator<T, void, undefined> {
  yield* outputItems(await start());
}

// =============================================================================
// Context
// =============================================================================

/**
 * The context of a procedure. Its `client` calls other procedures through `invokePath()` with
 * the same options, so the nested calls get the same metadata, signal, rules and interceptors.
 * With an invocation, the nested calls name it as their parent.
 */
export function createProcedureContext(
  procedure: AnyProcedure,
  options: InvokeOptions = {},
  invocation?: Invocation,
): ProcedureContext {
  const nestedOptions: InvokeOptions = invocation ? { ...options, parent: invocation } : options;
  let client: ProcedureClient;
  if (typeof options.client === "function") {
    client = invocation ? options.client(invocation) : registryClient(procedure, nestedOptions);
  } else {
    client = options.client ?? registryClient(procedure, nestedOptions);
  }
  const context: ProcedureContext = {
    metadata: options.metadata ?? {},
    path: procedure.path,
    client,
    registry: options.registry ?? PROCEDURE_REGISTRY,
  };
  if (options.signal) context.signal = options.signal;
  if (options.repository) context.repository = options.repository;
  if (options.onRef) context.onRef = options.onRef;
  // Every context has a bus. With a signal, the waits of the handler on the bus end when the
  // invocation aborts, so a stream handler that waits on ctx.bus.stream() can finish. (Before,
  // no host set ctx.bus: deep dive CORE-15.)
  const bus = options.bus ?? getGlobalEventBus();
  context.bus = options.signal ? withEventBusSignal(bus, options.signal) : bus;
  return context;
}

/** The client of a procedure's context: it runs the nested calls from the registry. */
function registryClient(caller: AnyProcedure, options: InvokeOptions): ProcedureClient {
  const start = <TOutput>(path: ProcedurePath, input: unknown): Promise<ProcedureOutput<TOutput>> => {
    // The call policy of the host, with the immediate caller (BUGS-2026-07 H18, deep dive MCP-3).
    // It runs before the lookup, so a refused path tells nothing about the procedure.
    const refusal = nestedCallRefusal(caller, path, options);
    if (refusal) {
      return Promise.reject(new InvocationError(refusal.code, refusal.message, path));
    }
    return invokePath<TOutput>(path, input, options);
  };
  return {
    async call<TInput, TOutput>(path: ProcedurePath, input: TInput): Promise<TOutput> {
      return outputValue(await start<TOutput>(path, input), path);
    },
    stream<TInput, TOutput>(path: ProcedurePath, input: TInput): AsyncIterable<TOutput> {
      return streamOutput(() => start<TOutput>(path, input));
    },
  };
}
