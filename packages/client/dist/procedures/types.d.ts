/**
 * Procedure Type System
 *
 * Core types for procedure definitions, handlers, and registration.
 * Procedures are the foundation for typed RPC calls with schema validation.
 */
import type { ZodLike, ZodErrorLike } from "../client/validation/types";
import type { CollectionStorage } from "../collections/storage/interface";
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
export declare function pathToKey(path: ProcedurePath): string;
/**
 * Parse dot-separated key to path array.
 */
export declare function keyToPath(key: string): ProcedurePath;
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
}
/**
 * Procedure handler function.
 * Receives validated input and context, returns output.
 *
 * @example
 * ```typescript
 * const handler: ProcedureHandler<{ id: string }, User> = async (input, ctx) => {
 *   const storage = ctx.repository?.getStorage<User>('users');
 *   const user = await storage?.get(input.id);
 *   if (!user) throw new Error('User not found');
 *   return user;
 * };
 * ```
 */
export type ProcedureHandler<TInput = unknown, TOutput = unknown> = (input: TInput, context: ProcedureContext) => Promise<TOutput> | TOutput;
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
export interface Procedure<TInput = unknown, TOutput = unknown, TMeta extends ProcedureMetadata = ProcedureMetadata> {
    /** Path in the route tree */
    path: ProcedurePath;
    /** Input validation schema (Zod-compatible) */
    input: ZodLike<TInput>;
    /** Output validation schema (Zod-compatible) */
    output: ZodLike<TOutput>;
    /** Procedure metadata for documentation */
    metadata: TMeta;
    /** Server-side handler implementation */
    handler?: ProcedureHandler<TInput, TOutput>;
}
/**
 * Procedure without type parameters for generic storage.
 * Uses `any` for handler to allow covariant/contravariant type compatibility.
 */
export type AnyProcedure = Procedure<any, any, ProcedureMetadata>;
/**
 * Result of a procedure call.
 */
export type ProcedureResult<TOutput> = {
    success: true;
    data: TOutput;
} | {
    success: false;
    error: ProcedureError;
};
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
/**
 * Infer input type from a procedure.
 */
export type InferProcedureInput<T> = T extends Procedure<infer TInput, any, any> ? TInput : unknown;
/**
 * Infer output type from a procedure.
 */
export type InferProcedureOutput<T> = T extends Procedure<any, infer TOutput, any> ? TOutput : unknown;
/**
 * Infer metadata type from a procedure.
 */
export type InferProcedureMetadata<T> = T extends Procedure<any, any, infer TMeta> ? TMeta : ProcedureMetadata;
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
//# sourceMappingURL=types.d.ts.map