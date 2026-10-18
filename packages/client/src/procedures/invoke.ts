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
 *
 * Each invocation operates with a capability (CAPABILITIES-2026-10, `capability.ts`). A nested
 * call gets the same capability or a narrower one. The admission refuses a procedure whose
 * declared effects the capability does not permit (`FORBIDDEN`). The host can give resources
 * for the capability (`ctx.resources`) and a filter of the output that leaves the host.
 */

import type {
  AnyProcedure,
  Capability,
  CapabilityRequest,
  ClearanceOrder,
  NestedCallOptions,
  ProcedureClient,
  ProcedureContext,
  ProcedurePath,
  RepositoryProvider,
  ResourcesOf,
} from "./types.js";
import { pathToKey } from "./types.js";
import { validateSchema } from "./schema.js";
import type { ProcedureRegistry } from "./registry.js";
import { PROCEDURE_REGISTRY } from "./registry.js";
import { nestedCallRefusal } from "./policy.js";
import { scopeOf, withScope, type HydrationEvent } from "./ref.js";
import { UNLIMITED_CAPABILITY, capabilityRefusal, examinesNestedCall, narrowCapability, type CapabilityRefusalReason } from "./capability.js";
import { NARROWING_METADATA_KEY, narrowWithin, narrowingOf, type NarrowingNote } from "./narrowing.js";
import { timeoutAfterMs } from "./interceptors.js";
import type { Elicit } from "./elicit.js";
import type { ReportProgress } from "./progress.js";
import type { EventBus } from "../events/types.js";
import type { Principal } from "../server/types.js";
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
  | "TIMEOUT"
  /** The capability of the call does not permit it (CAPABILITIES-2026-10). `reason` tells why. */
  | "FORBIDDEN";

/**
 * The reason of a `FORBIDDEN` error. It is a refusal of the capability, or a refusal of a module
 * that the host configured:
 * - `outside-root`: the input has a path outside the root of the host (`createFsModule({ root })`
 *   of `@procedures/fs`).
 * - `host-not-allowed`: the input has a URL whose host the host does not allow, or a redirect goes
 *   to such a host (`createHttpModule({ allow })` of `@procedures/http`).
 * - `topic-not-allowed`: the `allow` function of an `EventPublisher` refuses a topic of a
 *   subscription (`documentation/EVENTS.md`).
 * - `partition-not-allowed`: the partition resolver of the collection procedures refuses the
 *   partition of a call (roadmap CLI-17).
 */
export type ForbiddenReason = CapabilityRefusalReason | "outside-root" | "host-not-allowed" | "topic-not-allowed" | "partition-not-allowed";

/** An error of the invocation itself. An error that the handler throws passes through unchanged. */
export class InvocationError extends Error {
  override readonly name = "InvocationError";
  readonly code: InvocationErrorCode;
  readonly path: ProcedurePath;
  readonly retryable: boolean = false;
  /**
   * The reason of a `FORBIDDEN` error: `effects-undeclared`, `effects-exceeded`, `clearance`,
   * `deadline`, `outside-root`, `host-not-allowed`, `topic-not-allowed` or `partition-not-allowed`.
   */
  readonly reason: ForbiddenReason | undefined;

  constructor(code: InvocationErrorCode, message: string, path: ProcedurePath, reason?: ForbiddenReason) {
    super(message);
    this.code = code;
    this.path = path;
    this.reason = reason;
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
  /**
   * The function that asks the person at the caller (`ctx.elicit`, CLI-12). A face of the host
   * gives it. The nested calls get the same function.
   */
  elicit?: Elicit | undefined;
  /**
   * The function that tells the caller the progress of the call (`ctx.progress`). Only the call
   * of the host gets it in its context, not its nested calls.
   */
  progress?: ReportProgress | undefined;
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
  /**
   * The capability of the call: its clearance, permitted effects and deadline. The host makes it
   * from its authentication. The nested calls get it, or a narrower one. Absent: no limits.
   */
  capability?: Capability | undefined;
  /**
   * A narrower capability that the caller asks for (CLI-30). The invocation of the host combines
   * it with the narrowing key of `metadata` (`procedure-narrowing`) by the meet, so each source can
   * only narrow. A part that asks for more has no effect. The nested calls get the narrowed
   * capability.
   */
  narrow?: CapabilityRequest | undefined;
  /**
   * This function gets the notes of the narrowing of the call (CLI-30): each part that has no
   * effect, and the part that refuses the call. A server gives them to its debug reports.
   */
  onNarrowingNotes?: ((notes: readonly NarrowingNote[]) => void) | undefined;
  /** The order of the clearance values. Narrowing two different clearances needs it. */
  clearanceOrder?: ClearanceOrder | undefined;
  /** The resources of an invocation for its capability (`ctx.resources`). */
  resources?: ((invocation: Invocation) => ResourcesOf) | undefined;
  /**
   * The filter of the output that leaves the host (the call of the host, not its nested calls).
   * It drops a refused stream item. A refused value gives `FORBIDDEN` (reason `clearance`).
   */
  admitItem?: AdmitItem | undefined;
  /**
   * The principal of the call, from the authentication of the host. It goes to `ctx.principal`,
   * to the invocation and to the nested calls.
   */
  principal?: Principal | undefined;
}

/**
 * The output filter of a host. It can look up data (the clearance of a record), so it can give a
 * promise.
 */
export type AdmitItem = (item: unknown, invocation: Invocation) => boolean | Promise<boolean>;

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
  /** The capability of the invocation (frozen). */
  readonly capability: Capability;
  /** The principal of the call: who sends it. A call from this process has none. */
  readonly principal?: Principal | undefined;
}

/** The changes that an interceptor gives to the next step: the handler and the nested calls get them. */
export interface InvocationChanges {
  signal?: AbortSignal | undefined;
  metadata?: Record<string, unknown> | undefined;
  /** A request for a narrower capability. The framework calculates the result: it is never wider. */
  capability?: CapabilityRequest | undefined;
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

/** The output (or one stream item), validated by the output schema of the procedure. */
async function validateOutput(procedure: AnyProcedure, output: unknown): Promise<unknown> {
  const result = await validateSchema(procedure.output, output);
  if (!result.ok) {
    throw new InvocationError(
      "OUTPUT_VALIDATION_ERROR",
      `Output validation failed for ${pathToKey(procedure.path)}: ${result.message}`,
      procedure.path,
    );
  }
  return result.value;
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
      yield await validateOutput(procedure, step.value);
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
 * The options of an invocation with its narrowing applied (CLI-30). The sources are the narrowing
 * key of the metadata, for the call of a host only (the nested calls get the metadata of their
 * caller), and the option `narrow`. They combine by the meet. A part that is not valid throws:
 * `INVALID_REQUEST` for a part that is not well formed, `FORBIDDEN` (reason `clearance`) for a
 * clearance outside the order or clearances without a meet.
 */
function narrowedOptions(path: ProcedurePath, options: InvokeOptions): InvokeOptions {
  const metadata = options.parent === undefined ? options.metadata : undefined;
  const keyed = metadata !== undefined && Object.hasOwn(metadata, NARROWING_METADATA_KEY);
  if (!keyed && !options.narrow) return options;
  const wire = metadata !== undefined && keyed ? narrowingOf(metadata[NARROWING_METADATA_KEY]) : narrowingOf(undefined);
  const sources = options.narrow ? [...wire.narrowings, options.narrow] : wire.narrowings;
  const narrowed = narrowWithin(options.capability, sources, options.clearanceOrder);
  const notes = [...wire.notes, ...narrowed.notes];
  if (notes.length > 0) options.onNarrowingNotes?.(notes);
  const refusal = notes.find((note) => note.kind === "refused");
  if (refusal?.code === "FORBIDDEN") throw new InvocationError("FORBIDDEN", refusal.message, path, "clearance");
  if (refusal) throw Object.assign(new Error(refusal.message), { code: "INVALID_REQUEST" });
  return { ...options, narrow: undefined, capability: narrowed.capability };
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
  // The narrowing of the call applies one time, here, for each face and each path of the process:
  // the nested calls get the result (CLI-30)
  options = narrowedOptions(path, options);
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
    capability: options.capability ?? UNLIMITED_CAPABILITY,
    ...(options.principal !== undefined ? { principal: options.principal } : {}),
  };
  // A deadline that the parent does not have (from a host, a request or a narrowed nested call)
  // ends the invocation at that time, as the timeout interceptor does
  const deadline = invocation.capability.deadline;
  const ownDeadline = deadline !== undefined && options.parent?.capability.deadline !== deadline;
  const interceptors = ownDeadline
    ? [timeoutAfterMs({ ms: Math.max(0, deadline - Date.now()), appliesTo: () => true }), ...(options.interceptors ?? [])]
    : (options.interceptors ?? []);
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
        capability: changes.capability
          ? narrowCapability(current.capability, changes.capability, currentOptions.clearanceOrder)
          : current.capability,
      };
      return dispatch(index + 1, changed, {
        ...currentOptions,
        signal: changed.signal,
        metadata: changed.metadata,
        capability: changed.capability,
      });
    });
  };
  return dispatch(0, invocation, options) as Promise<ProcedureOutput<TOutput>>;
}

/** The end of the chain: the validation, the context, the handler and the output. */
async function runInvocation<TOutput>(invocation: Invocation, options: InvokeOptions): Promise<ProcedureOutput<TOutput>> {
  const { procedure, path, input } = invocation;
  const handler = procedure.handler!;
  if (options.signal?.aborted) throw abortError(path);

  // The admission: before the input validation, so a refused call learns nothing from its input
  const parent = invocation.parent;
  if (!parent || examinesNestedCall(parent.procedure, parent.capability, invocation.capability)) {
    const refusal = capabilityRefusal(procedure, invocation.capability);
    if (refusal?.reason === "deadline") throw new InvocationError("TIMEOUT", refusal.message, path);
    if (refusal) throw new InvocationError("FORBIDDEN", refusal.message, path, refusal.reason);
  }

  let data: unknown = input;
  if (!options.inputValidated) {
    // A synchronous schema gives its result at once, so the handler starts before an await
    let parsed = validateSchema(procedure.input, input);
    if (parsed instanceof Promise) parsed = await parsed;
    if (!parsed.ok) {
      throw new InvocationError(
        "VALIDATION_ERROR",
        `Input validation failed for ${pathToKey(path)}: ${parsed.message}`,
        path,
      );
    }
    // A parse makes a new object, without the hidden scope of a raw input (`withScope()`). The
    // scope goes onto the parsed data, so a runner with a Zod schema can read the names of the
    // caller (docs review DOC-10: before, each runner needed its own workaround).
    data = parsed.value === input ? input : withScope(parsed.value, scopeOf(input));
  }

  // The handler starts here, before the first await (the site's trace depends on it)
  const result: unknown = await handler(data, createProcedureContext(procedure, { ...options, capability: invocation.capability }, invocation));
  // The output filter examines only what leaves the host
  const admit = invocation.depth === 0 ? options.admitItem : undefined;
  if (isAsyncIterable(result)) {
    const items = validatedItems(procedure, result, options.signal);
    return {
      kind: "stream",
      items: (admit ? admittedItems(items, admit, invocation) : items) as AsyncGenerator<TOutput, void, undefined>,
    };
  }
  const value = await validateOutput(procedure, result);
  if (admit && !(await admit(value, invocation))) {
    throw new InvocationError("FORBIDDEN", `The clearance of the call does not permit the output of ${pathToKey(path)}`, path, "clearance");
  }
  return { kind: "value", value: value as TOutput };
}

/** The items that the output filter of the host admits. */
async function* admittedItems(
  items: AsyncGenerator<unknown, void, undefined>,
  admit: AdmitItem,
  invocation: Invocation,
): AsyncGenerator<unknown, void, undefined> {
  for await (const item of items) {
    if (await admit(item, invocation)) yield item;
  }
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
    capability: options.capability ?? UNLIMITED_CAPABILITY,
    resources: invocation && options.resources ? options.resources(invocation) : (EMPTY_RESOURCES as ResourcesOf),
  };
  if (options.signal) context.signal = options.signal;
  if (options.expose) context.expose = options.expose;
  if (options.repository) context.repository = options.repository;
  if (options.onRef) context.onRef = options.onRef;
  if (options.principal !== undefined) context.principal = options.principal;
  // The procedure of the parent invocation made this call (roadmap R33: the root of the files)
  if (invocation?.parent) context.caller = invocation.parent.procedure;
  // The output filter of the host, for the data that a handler sends later (roadmap CLI-15)
  const admitItem = options.admitItem;
  if (invocation && invocation.depth === 0 && admitItem) context.admit = async (item) => admitItem(item, invocation);
  // Every context has a bus. With a signal, the waits of the handler on the bus end when the
  // invocation aborts, so a stream handler that waits on ctx.bus.stream() can finish. (Before,
  // no host set ctx.bus: deep dive CORE-15.)
  const bus = options.bus ?? getGlobalEventBus();
  context.bus = options.signal ? withEventBusSignal(bus, options.signal) : bus;
  // What the face of the call offers (CLI-12): the nested calls ask the same person, and only
  // the call of the host reports its progress, so the values of one call stay in order
  if (options.elicit) context.elicit = options.elicit;
  if (options.progress && !invocation?.parent && !options.parent) context.progress = options.progress;
  return context;
}

/** The resources of an invocation when the host gives none. */
const EMPTY_RESOURCES = Object.freeze({});

/** The client of a procedure's context: it runs the nested calls from the registry. */
function registryClient(caller: AnyProcedure, options: InvokeOptions): ProcedureClient {
  const start = <TOutput>(path: ProcedurePath, input: unknown, callOptions?: NestedCallOptions): Promise<ProcedureOutput<TOutput>> => {
    // The call policy of the host, with the immediate caller (BUGS-2026-07 H18, deep dive MCP-3).
    // It runs before the lookup, so a refused path tells nothing about the procedure.
    const refusal = nestedCallRefusal(caller, path, options);
    if (refusal) {
      return Promise.reject(new InvocationError(refusal.code, refusal.message, path));
    }
    // A nested call gets the capability of its caller, or a narrower one that it asks for
    const narrow = callOptions?.narrow;
    if (!narrow) return invokePath<TOutput>(path, input, options);
    let capability: Capability;
    try {
      capability = narrowCapability(options.capability, narrow, options.clearanceOrder);
    } catch (error) {
      return Promise.reject(error);
    }
    return invokePath<TOutput>(path, input, { ...options, capability });
  };
  return {
    async call<TInput, TOutput>(path: ProcedurePath, input: TInput, callOptions?: NestedCallOptions): Promise<TOutput> {
      return outputValue(await start<TOutput>(path, input, callOptions), path);
    },
    stream<TInput, TOutput>(path: ProcedurePath, input: TInput, callOptions?: NestedCallOptions): AsyncIterable<TOutput> {
      return streamOutput(() => start<TOutput>(path, input, callOptions));
    },
  };
}
