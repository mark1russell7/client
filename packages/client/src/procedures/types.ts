/**
 * Procedure Type System
 *
 * Core types for procedure definitions, handlers, and registration.
 * Procedures are the foundation for typed RPC calls with schema validation.
 */

import type { Elicit } from "./elicit.js";
import type { ReportProgress } from "./progress.js";
import type { ToolHintOverride } from "./hints.js";
import type { ZodErrorLike } from "../client/validation/types.js";
import type { ProcedureSchema } from "./schema.js";
import type { CollectionStorage } from "./collection/storage.js";
import type { EventBus } from "../events/types.js";
import type { HydrationEvent } from "./ref.js";
import type { Principal } from "../server/types.js";
import type { Invocation } from "./invoke.js";
import { segmentsToTopic, topicToSegments } from "./segments.js";

// =============================================================================
// Procedure Path
// =============================================================================

/**
 * Procedure path as array of segments.
 * Forms a tree structure for nested routing.
 *
 * @example
 * ```typescript
 * ['collections', 'users', 'get']  // collections.users.get
 * ['weather', 'forecast']           // weather.forecast
 * ```
 */
export type ProcedurePath = string[];

/**
 * This function gives the key of a path: the segments with dots between them. Each segment encodes
 * `%` as `%25` and `.` as `%2E` (`encodeSegment()`, roadmap CLI-75). Thus the key of
 * `["a.b", "c"]` is `a%2Eb.c`, and not the key of `["a", "b", "c"]`. A plain path keeps its key.
 */
export function pathToKey(path: readonly string[]): string {
  return segmentsToTopic(path);
}

/**
 * This function gives the path of a key: it splits the key on each dot and decodes each segment
 * (`decodeSegment()`, roadmap CLI-75). For each path, `keyToPath(pathToKey(path))` gives the path.
 */
export function keyToPath(key: string): ProcedurePath {
  return topicToSegments(key);
}

// =============================================================================
// Procedure Metadata
// =============================================================================

/**
 * Metadata for procedure documentation and categorization.
 */
export interface ProcedureMetadata {
  /** Human-readable description */
  description?: string;

  /** Tags for categorization and filtering */
  tags?: string[];

  /** Whether this procedure is deprecated */
  deprecated?: boolean;

  /** Deprecation message with migration guidance */
  deprecationMessage?: string;

  /**
   * The procedures that this procedure calls through `ctx.client`: keys (`"shell.run"`) or
   * namespaces (`"fs.*"`). A host with a call policy lets the procedure call only these and the
   * exposed procedures (see `policy.ts`, deep dive MCP-3). `"*"` alone is not allowed: a
   * procedure whose callees come from its input has the `runs-refs` tag.
   */
  calls?: readonly string[];

  /**
   * The side effects of the procedure (CAPABILITIES-2026-10). A host with a restriction of
   * effects refuses a procedure without this declaration.
   */
  effects?: Effects;

  /**
   * The stream of the procedure (roadmap R15). `unbounded: true`: the stream can run without an
   * end (a `follow` of logs, the output of a server process). A face that collects a stream
   * refuses such a call or stops it at a limit: HTTP without NDJSON refuses it, and MCP stops it
   * at its stream limits.
   */
  stream?: { readonly unbounded?: boolean } | undefined;

  /**
   * The output fields that hold text from outside the host: a web page, a mail (CLI-10). The value
   * of each field is a text, an `UntrustedText` with its source, or a list of them. A face that
   * gives text to a model (MCP) shows these texts in envelopes: data, never instructions.
   */
  untrusted?: readonly string[] | undefined;

  /** The short name of the procedure for people, for example the title of an MCP tool. */
  title?: string | undefined;

  /**
   * The override of the tool hints of the effects (CLI-10). It can only make the tool look more
   * dangerous: `readOnlyHint: false`, `destructiveHint: true`, `idempotentHint: false`,
   * `openWorldHint: true`. The registry refuses each other value.
   */
  toolHints?: ToolHintOverride | undefined;

  /**
   * The rules of the procedure under a root of the files (roadmap R33): the inputs that name a
   * path, or the reason that a root cannot confine it. A host with a root (`--fs-root`,
   * `MCP_FS_ROOT`) reads them. Without the rules, the host decides from `effects`.
   */
  fsRoot?: FsRootRules | undefined;

  /** Custom metadata fields */
  [key: string]: unknown;
}

/**
 * The rules of a procedure under a root of the files (roadmap R33). A host with a root keeps each
 * path of these inputs in the root, or it refuses the procedure. `confineToRoot()` of
 * `@procedures/fs` applies the rules. Without a root, the rules change nothing.
 */
export interface FsRootRules {
  /**
   * The input that names the working folder. When the call gives no value, the procedure gets the
   * root. A relative value starts at the root.
   */
  readonly cwd?: string;
  /**
   * The inputs that name a file or a folder: a text, or a list of texts. A relative path starts at
   * the root. The procedure gets the absolute path.
   */
  readonly paths?: readonly string[];
  /**
   * The inputs that name a file or a folder relative to the working folder, for example the files
   * of an archive. A relative name starts at the working folder, or at the root without `cwd`.
   * The host examines each path, and it does not change the value.
   */
  readonly names?: readonly string[];
  /**
   * The inputs of `paths` whose default is outside the working folder. Under a root, a call
   * without a value of such an input is refused.
   */
  readonly required?: readonly string[];
  /** The values of the inputs that are not paths, for example `:memory:` of SQLite. */
  readonly values?: readonly string[];
  /** The reason that a root cannot confine the procedure. Under a root, the host refuses it. */
  readonly refuse?: string;
  /**
   * True for a procedure that starts the program of its input (`shell.run`). Under a root, the
   * host refuses a call of a client. It accepts the nested call of a confined procedure that
   * names this procedure in `metadata.calls`.
   */
  readonly program?: boolean;
}

// =============================================================================
// Capabilities (CAPABILITIES-2026-10)
// =============================================================================

/**
 * The side effects of a procedure. The resource names are strings that the application chooses.
 * The standard names are `fs` (the files of the host), `network` (systems outside the host),
 * `process` (it starts any program) and `registry` (the procedure registry).
 */
export interface Effects {
  /** The resources that the procedure reads. Absent: not known. */
  readonly reads?: readonly string[];
  /** The resources that the procedure changes. An empty list: it changes nothing. Absent: not known. */
  readonly writes?: readonly string[];
  /** True: a second call with the same input changes nothing more. The default is false. */
  readonly idempotent?: boolean;
  /**
   * True: the procedure can delete or overwrite data that it did not make. The default is true for
   * a procedure that writes, as in MCP. A procedure that writes only new data declares false.
   */
  readonly destructive?: boolean;
}

/** The effects that a capability permits. An absent field permits everything of its kind. */
export interface PermittedEffects {
  /** The resources that a call can read: names, or `"any"`. */
  readonly reads?: readonly string[] | "any";
  /** The resources that a call can change: names, or `"any"`. An empty list: no change. */
  readonly writes?: readonly string[] | "any";
  /** False: a call cannot start a destructive procedure. */
  readonly destructive?: boolean;
}

/**
 * The types that an application gives to the framework, by declaration merging:
 *
 * ```ts
 * declare module "@procedures/client" {
 *   interface Register {
 *     clearance: "public" | "shared" | "private";
 *     resources: { world: World };
 *   }
 * }
 * ```
 */
export interface Register {}

/** The type of a clearance value: `Register["clearance"]`, or `unknown`. */
export type ClearanceOf = Register extends { clearance: infer C } ? C : unknown;

/** The type of `ctx.resources`: `Register["resources"]`, or a record of unknown values. */
export type ResourcesOf = Register extends { resources: infer R } ? R : Readonly<Record<string, unknown>>;

/**
 * The permissions of one invocation. A nested call gets the same capability or a narrower one,
 * and only the host makes a capability (from its authentication). The object is frozen.
 */
export interface Capability<C = ClearanceOf> {
  /** The data that the call can see. Absent: no limit. The application gives the order. */
  readonly clearance?: C;
  /** The effects that the call and its nested calls can have. Absent: all effects. */
  readonly effects?: PermittedEffects;
  /** The time (milliseconds since the epoch) at which the call and its nested calls stop. */
  readonly deadline?: number;
}

/**
 * A request for a narrower capability (a nested call, an interceptor). The framework calculates
 * the result, so a request for more has no effect.
 */
export interface CapabilityRequest<C = ClearanceOf> {
  clearance?: C;
  effects?: PermittedEffects;
  /**
   * The time from now, in milliseconds. The result is the earlier of the two deadlines. A value
   * that is not a finite number of zero or more asks for nothing.
   */
  timeoutMs?: number;
}

/** The order of clearance values: a partial order with a meet (the highest common lower value). */
export interface ClearanceOrder<C = ClearanceOf> {
  /** True when `a` is the same as or lower than `b`. */
  leq(a: C, b: C): boolean;
  /** The highest value that is the same as or lower than both. */
  meet(a: C, b: C): C;
}

// =============================================================================
// Procedure Context
// =============================================================================

/**
 * Repository provider for storage access.
 * Injected into procedure handlers for data access.
 */
export interface RepositoryProvider {
  /**
   * Get storage for a collection.
   *
   * @param collection - Collection name
   * @returns Storage instance for the collection
   */
  getStorage<T>(collection: string): CollectionStorage<T>;

  /**
   * The storage of one partition of a collection (roadmap CLI-17), for example the items of one
   * tenant. A repository without this method has no partitions: the collection procedures then
   * refuse a call with a partition, and never give it the storage of all partitions.
   */
  getPartitionStorage?<T>(collection: string, partition: string): CollectionStorage<T>;

  /** True when the collection has partitions (roadmap CLI-17). Then a call resolves its partition with `resolvePartition`. */
  hasPartitions?(collection: string): boolean;

  /**
   * The partition of a call to a partitioned collection (roadmap CLI-17): from the context (the
   * tenant of `ctx.principal`) and the partition that the call asks for. `null` refuses the call.
   */
  resolvePartition?(collection: string, ctx: ProcedureContext, requested: string | undefined): string | undefined | null | Promise<string | undefined | null>;

  /**
   * Check if a collection exists.
   *
   * @param collection - Collection name
   */
  hasCollection(collection: string): boolean;
}

/**
 * Context passed to procedure handlers.
 * Contains request metadata and service access.
 */
export interface ProcedureContext {
  /** Request metadata (auth, tracing, etc.) */
  metadata: Record<string, unknown>;

  /** Abort signal for cancellation */
  signal?: AbortSignal;

  /** Repository provider for storage access */
  repository?: RepositoryProvider;

  /** The full path that was called */
  path: ProcedurePath;

  /**
   * Event bus for pub/sub messaging.
   * Use for streaming coordination and inter-procedure communication.
   *
   * @example
   * ```typescript
   * // Subscribe to updates in a streaming handler
   * handler: async function* (input, ctx) {
   *   yield await getInitial(input.id);
   *
   *   for await (const update of ctx.bus.stream(`entity:${input.id}`)) {
   *     yield update;
   *   }
   * }
   *
   * // Emit events from another procedure
   * handler: async (input, ctx) => {
   *   const result = await saveEntity(input);
   *   ctx.bus.emit(`entity:${input.id}`, result);
   *   return result;
   * }
   * ```
   */
  bus?: EventBus;

  /**
   * Client for calling other procedures.
   * Enables inter-procedure communication via the RPC mechanism.
   *
   * @example
   * ```typescript
   * handler: async (input, ctx) => {
   *   // Call fs.mkdir procedure
   *   await ctx.client.call(["fs", "mkdir"], { path: input.dir });
   *
   *   // Call git.init procedure  
   *   await ctx.client.call(["git", "init"], { cwd: input.dir });
   *
   *   return { created: true };
   * }
   * ```
   */
  client: ProcedureClient;

  /**
   * The registry of the caller: `ctx.client` finds the nested procedures here. A procedure that
   * reads or changes the registry (`procedure.define`, `client.lookup`) uses this one. When it is
   * not set, such a procedure uses `PROCEDURE_REGISTRY`.
   */
  registry?: ProcedureRegistryLike;

  /**
   * The expose rule of the host: the procedures that its callers reach. The introspection
   * procedures (`procedure.list`, `procedure.get`, `procedure.manifest` and the others) show only
   * these (roadmap R17: before, a handler could not know the rule, so an MCP tool listed the
   * procedures that the host does not expose). Absent: every procedure.
   */
  expose?: ((path: ProcedurePath) => boolean) | undefined;

  /**
   * The hydration observer of the program that runs this procedure (`client.exec(ref, input,
   * { onRef })`). A procedure that hydrates refs itself (control flow, a runner) gives it to
   * `hydrateInput`, so a trace sees the events of its own program only.
   */
  onRef?: ((event: HydrationEvent) => void) | undefined;

  /**
   * The function that asks the person at the caller for input or a confirmation (CLI-12): MCP
   * elicitation, or another face that can ask. Absent when no one can answer. The helpers
   * `elicitInput` and `elicitConfirmation` then give the action `unavailable`. The nested calls
   * get the same function.
   */
  elicit?: Elicit | undefined;

  /**
   * The function that tells the caller the progress of this call (an MCP progress notification).
   * Absent when the caller asked for no progress. Only the call of the host gets it.
   */
  progress?: ReportProgress | undefined;

  /**
   * The capability of this invocation (CAPABILITIES-2026-10): its clearance, permitted effects
   * and deadline. The nested calls of `ctx.client` get it, or a narrower one. Frozen.
   */
  capability: Capability;

  /**
   * The resources that the host gives to this invocation, for its capability: a view of a
   * database for a lower clearance, for example. Empty when the host gives none.
   */
  resources: ResourcesOf;

  /**
   * The procedure whose handler made this call through its `ctx.client`. A call of a host or a
   * client has no caller. The framework sets it from the invocation, so an input cannot change
   * it. The root of the files reads it (roadmap R33).
   */
  caller?: AnyProcedure | undefined;

  /**
   * The absolute path of the root of the files, for a procedure that a host confines to it
   * (roadmap R33). `confineToRoot()` of `@procedures/fs` sets it for each procedure with rules. A
   * procedure that starts a program uses it to keep the program in the root. Absent without a root.
   */
  fsRoot?: string | undefined;

  /**
   * The principal of the call: who sends it. The server sets it from its authentication (the
   * token, the request hook `principalOf`, `authenticate`). The nested calls get the same
   * principal. An input or the metadata cannot change it. A call from this process has none.
   */
  principal?: Principal | undefined;

  /**
   * The output filter of the host for this call: its `admitItem`, with this invocation (roadmap
   * CLI-15). A handler that sends the data of other writers later, for example a subscription,
   * examines each row with it. Absent for a nested call, or when the host has no filter.
   */
  admit?: ((item: unknown) => Promise<boolean>) | undefined;

  /**
   * The invocation of this call: the procedure, the path, the principal and the capability
   * (roadmap CLI-41). A rule with the shape of `AdmitItem` gets it, for example the rules of the
   * rows of a collection. Absent for a context without an invocation.
   */
  invocation?: Invocation | undefined;
}

/**
 * The part of `ProcedureRegistry` that a procedure can use through `ctx.registry`.
 */
export interface ProcedureRegistryLike {
  get(path: ProcedurePath): AnyProcedure | undefined;
  has(path: ProcedurePath): boolean;
  getAll(): AnyProcedure[];
  register(procedure: AnyProcedure, options?: RegistrationOptions): void;
  unregister(path: ProcedurePath): boolean;
}

/**
 * Interface for procedure-to-procedure calls.
 * Implemented by both Client and ProcedureServer's internal caller.
 */
export interface ProcedureClient {
  /**
   * Call a procedure by path. For a streaming procedure, the result is the last item.
   */
  call<TInput = unknown, TOutput = unknown>(
    path: ProcedurePath,
    input: TInput,
    options?: NestedCallOptions
  ): Promise<TOutput>;

  /**
   * Call a procedure by path and read each output: each item of a streaming procedure, or the
   * one value of another procedure. The procedure starts when the caller reads the first item.
   * An older client has no `stream`.
   */
  stream?<TInput = unknown, TOutput = unknown>(
    path: ProcedurePath,
    input: TInput,
    options?: NestedCallOptions
  ): AsyncIterable<TOutput>;
}

/** The options of one nested call. */
export interface NestedCallOptions {
  /** A narrower capability for the nested call. A request for more has no effect. */
  narrow?: CapabilityRequest | undefined;
}

// =============================================================================
// Procedure Handler
// =============================================================================

/**
 * Standard procedure handler function (single return).
 * Receives validated input and context, returns output.
 *
 * @example
 * ```typescript
 * const handler: StandardHandler<{ id: string }, User> = async (input, ctx) => {
 *   const storage = ctx.repository?.getStorage<User>('users');
 *   const user = await storage?.get(input.id);
 *   if (!user) throw new Error('User not found');
 *   return user;
 * };
 * ```
 */
export type StandardHandler<TInput = unknown, TOutput = unknown> = (
  input: TInput,
  context: ProcedureContext
) => Promise<TOutput> | TOutput;

/**
 * Generator procedure handler (streaming/multi-yield).
 * Yields output values one or more times.
 *
 * @example
 * ```typescript
 * // Single yield (same as standard, but generator syntax)
 * const handler: GeneratorHandler<{ id: string }, User> = async function* (input, ctx) {
 *   const user = await fetchUser(input.id);
 *   yield user;  // yields once
 * };
 *
 * // Multi-yield streaming
 * const handler: GeneratorHandler<{ roomId: string }, Message> = async function* (input, ctx) {
 *   // Initial data
 *   yield await getInitialMessages(input.roomId);
 *
 *   // Stream updates
 *   for await (const msg of ctx.bus.stream(`room:${input.roomId}`)) {
 *     yield msg;  // yields many times
 *   }
 * };
 * ```
 */
export type GeneratorHandler<TInput = unknown, TOutput = unknown> = (
  input: TInput,
  context: ProcedureContext
) => AsyncGenerator<TOutput, void, unknown>;

/**
 * Procedure handler function - supports both standard and generator forms.
 *
 * - **Standard handlers**: Return a single value (sync or async)
 * - **Generator handlers**: Yield one or more values
 *
 * The caller's consumption mode (sponge/stream/handlers) determines
 * how the output is delivered, regardless of handler type.
 *
 * @example
 * ```typescript
 * // Standard handler (single return)
 * const handler: ProcedureHandler<{ id: string }, User> = async (input, ctx) => {
 *   return await fetchUser(input.id);
 * };
 *
 * // Generator handler (streaming)
 * const handler: ProcedureHandler<{ query: string }, SearchResult> = async function* (input, ctx) {
 *   for await (const result of search(input.query)) {
 *     yield result;
 *   }
 * };
 * ```
 */
export type ProcedureHandler<TInput = unknown, TOutput = unknown> =
  | StandardHandler<TInput, TOutput>
  | GeneratorHandler<TInput, TOutput>;

// =============================================================================
// Procedure Definition
// =============================================================================

/**
 * Full procedure definition with schemas and optional handler.
 *
 * @example
 * ```typescript
 * const getUserProcedure: Procedure<GetUserInput, User> = {
 *   path: ['users', 'get'],
 *   input: z.object({ id: z.string() }),
 *   output: z.object({ id: z.string(), name: z.string() }),
 *   metadata: { description: 'Get user by ID', tags: ['users', 'read'] },
 *   handler: async ({ id }, ctx) => { ... },
 * };
 * ```
 */
export interface Procedure<
  TInput = unknown,
  TOutput = unknown,
  TMeta extends ProcedureMetadata = ProcedureMetadata
> {
  /** Path in the route tree */
  path: ProcedurePath;

  /** Input validation schema: a Standard Schema (zod 4, valibot, arktype) or a `ZodLike` */
  input: ProcedureSchema<TInput>;

  /** Output validation schema: a Standard Schema or a `ZodLike` */
  output: ProcedureSchema<TOutput>;

  /** Procedure metadata for documentation */
  metadata: TMeta;

  /**
   * Whether this procedure supports streaming (multi-yield).
   * When true, the handler is expected to be a generator that may yield multiple times.
   * When false or undefined, the procedure yields exactly once.
   *
   * This is a capability declaration - callers can still consume
   * streaming procedures in sponge mode (getting only the final value).
   */
  streaming?: boolean | undefined;

  /**
   * Output mode declaration - how the procedure produces its output.
   *
   * - `single`: Returns a single value (default) - most procedures
   * - `stream`: Returns multiple values over time (generator that yields many times)
   * - `batch`: Returns an array of values all at once
   *
   * The consumer can choose their consumption mode (sponge/stream/handlers)
   * independently. The system translates automatically:
   *
   * | Producer Mode | Consumer Mode | Result Type              |
   * |---------------|---------------|--------------------------|
   * | single        | sponge        | Promise<T>               |
   * | single        | stream        | AsyncIterable<T> (1 item)|
   * | stream        | sponge        | Promise<T> (last value)  |
   * | stream        | stream        | AsyncIterable<T>         |
   * | batch         | sponge        | Promise<T[]>             |
   * | batch         | stream        | AsyncIterable<T>         |
   */
  outputMode?: 'single' | 'stream' | 'batch' | undefined;

  /** Server-side handler implementation (optional for stubs and aggregations) */
  handler?: ProcedureHandler<TInput, TOutput> | undefined;
}

/**
 * Procedure without type parameters for generic storage.
 * Uses `any` for handler to allow covariant/contravariant type compatibility.
 */
export type AnyProcedure = Procedure<any, any, ProcedureMetadata>;

// =============================================================================
// Output Mode Types
// =============================================================================

/**
 * How a procedure produces its output.
 */
export type OutputMode = 'single' | 'stream' | 'batch';

/**
 * Default output mode when not specified.
 */
export const DEFAULT_OUTPUT_MODE: OutputMode = 'single';

// =============================================================================
// Procedure Result Types
// =============================================================================

/**
 * Result of a procedure call.
 */
export type ProcedureResult<TOutput> =
  | { success: true; data: TOutput }
  | { success: false; error: ProcedureError };

/**
 * Error from procedure execution.
 */
export interface ProcedureError {
  /** Error code */
  code: string;

  /** Error message */
  message: string;

  /** Whether the error is retryable */
  retryable: boolean;

  /** Validation errors if applicable */
  validationErrors?: ZodErrorLike;

  /** The procedure path that failed */
  path: ProcedurePath;
}

// =============================================================================
// Infer Types from Procedure
// =============================================================================

/**
 * Infer input type from a procedure.
 */
export type InferProcedureInput<T> = T extends Procedure<infer TInput, any, any>
  ? TInput
  : unknown;

/**
 * Infer output type from a procedure.
 */
export type InferProcedureOutput<T> = T extends Procedure<any, infer TOutput, any>
  ? TOutput
  : unknown;

/**
 * Infer metadata type from a procedure.
 */
export type InferProcedureMetadata<T> = T extends Procedure<any, any, infer TMeta>
  ? TMeta
  : ProcedureMetadata;

// =============================================================================
// Registry Events
// =============================================================================

/**
 * Event types emitted by ProcedureRegistry.
 */
export type RegistryEventType = "register" | "unregister";

/**
 * Listener for registry events.
 */
export interface RegistryListener {
  event: RegistryEventType;
  listener: (procedure: AnyProcedure) => void;
}

// =============================================================================
// Module Registration
// =============================================================================

/**
 * Module that exports procedures for registration.
 */
export interface ProcedureModule {
  /** Array of procedures exported by this module */
  procedures: AnyProcedure[];

  /** Optional module name for debugging */
  name?: string;

  /**
   * The modules whose procedures this module calls (for example `client-lib` calls `fs.*` and
   * `git.*`). `createRegistry()` registers them too.
   */
  requires?: readonly ProcedureModule[] | undefined;
}

/**
 * Registration options for bulk procedure registration.
 */
export interface RegistrationOptions {
  /** Override existing procedures with same path */
  override?: boolean;

  /** Prefix to prepend to all paths */
  pathPrefix?: ProcedurePath;
}
