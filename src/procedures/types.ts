/**
 * Procedure Type System
 *
 * Core types for procedure definitions, handlers, and registration.
 * Procedures are the foundation for typed RPC calls with schema validation.
 */

import type { ZodLike, ZodErrorLike } from "../client/validation/types.js";
import type { CollectionStorage } from "../collections/storage/interface.js";
import type { EventBus } from "../events/types.js";

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
 * Convert path array to dot-separated key.
 */
export function pathToKey(path: ProcedurePath): string {
  return path.join(".");
}

/**
 * Parse dot-separated key to path array.
 */
export function keyToPath(key: string): ProcedurePath {
  return key.split(".");
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

  /** Custom metadata fields */
  [key: string]: unknown;
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
}

/**
 * Interface for procedure-to-procedure calls.
 * Implemented by both Client and ProcedureServer's internal caller.
 */
export interface ProcedureClient {
  /**
   * Call a procedure by path.
   */
  call<TInput = unknown, TOutput = unknown>(
    path: ProcedurePath,
    input: TInput
  ): Promise<TOutput>;
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

  /** Input validation schema (Zod-compatible) */
  input: ZodLike<TInput>;

  /** Output validation schema (Zod-compatible) */
  output: ZodLike<TOutput>;

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

  /** Server-side handler implementation */
  handler?: ProcedureHandler<TInput, TOutput> | undefined;
}

/**
 * Procedure without type parameters for generic storage.
 * Uses `any` for handler to allow covariant/contravariant type compatibility.
 */
export type AnyProcedure = Procedure<any, any, ProcedureMetadata>;

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
