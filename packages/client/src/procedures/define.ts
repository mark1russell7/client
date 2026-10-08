/**
 * Procedure Definition Helper
 *
 * Factory functions for creating well-typed procedure definitions.
 *
 * ## defineProcedure vs createProcedure
 *
 * This module provides two ways to create procedures:
 *
 * ### 1. defineProcedure (Declarative - Recommended for most cases)
 *
 * Use `defineProcedure` when:
 * - You have all the procedure properties available upfront
 * - You want a concise, single-expression definition
 * - You're defining static procedures at module load time
 * - You prefer declarative configuration
 *
 * ```typescript
 * const myProcedure = defineProcedure({
 *   path: ['users', 'get'],
 *   input: z.object({ id: z.string() }),
 *   output: z.object({ id: z.string(), name: z.string() }),
 *   metadata: { description: 'Get a user' },
 *   handler: async ({ id }) => fetchUser(id),
 * });
 * ```
 *
 * ### 2. createProcedure (Builder - For complex/dynamic scenarios)
 *
 * Use `createProcedure` (builder pattern) when:
 * - Building procedures conditionally or dynamically
 * - Composing procedures from multiple sources
 * - Schemas are determined at runtime
 * - You want to reuse partial configurations
 * - Working with code generation or metaprogramming
 *
 * ```typescript
 * const builder = createProcedure()
 *   .path(['users', 'get'])
 *   .input(inputSchema);
 *
 * if (featureFlags.includeExtendedOutput) {
 *   builder.output(extendedOutputSchema);
 * } else {
 *   builder.output(basicOutputSchema);
 * }
 *
 * const myProcedure = builder.handler(myHandler).build();
 * ```
 *
 * ### 3. defineStub (Client-side type stubs)
 *
 * Use `defineStub` when:
 * - You need type definitions without implementation
 * - Building client-side code that calls remote procedures
 * - Generating TypeScript types from procedure definitions
 *
 * ### Summary
 *
 * | Function          | Use Case                       | Returns         |
 * |-------------------|--------------------------------|-----------------|
 * | `defineProcedure` | Static, declarative definition | Procedure       |
 * | `createProcedure` | Dynamic, builder pattern       | ProcedureBuilder|
 * | `defineStub`      | Client-side type stubs         | Procedure (no handler) |
 */

import type { ZodLike } from "../client/validation/types.js";
import type {
  Procedure,
  ProcedurePath,
  ProcedureMetadata,
  ProcedureHandler,
} from "./types.js";

// =============================================================================
// Definition Input Types
// =============================================================================

/**
 * Input for defining a procedure.
 * Type parameters are inferred from schemas.
 */
export interface ProcedureDefinition<
  TInput,
  TOutput,
  TMeta extends ProcedureMetadata = ProcedureMetadata
> {
  /** Path in the route tree (e.g., ['collections', 'users', 'get']) */
  path: ProcedurePath;

  /** Input validation schema (Zod-compatible) */
  input: ZodLike<TInput>;

  /** Output validation schema (Zod-compatible) */
  output: ZodLike<TOutput>;

  /** Procedure metadata */
  metadata?: TMeta;

  /** Optional handler implementation */
  handler?: ProcedureHandler<TInput, TOutput>;
}

/**
 * Minimal definition without handler.
 * Useful for client-side procedure stubs.
 */
export interface ProcedureStub<TInput, TOutput> {
  path: ProcedurePath;
  input: ZodLike<TInput>;
  output: ZodLike<TOutput>;
  metadata?: ProcedureMetadata;
}

// =============================================================================
// Define Procedure
// =============================================================================

/**
 * Define a procedure with type inference from schemas.
 *
 * Creates a well-typed procedure definition that can be registered
 * with the procedure registry.
 *
 * @param definition - Procedure definition with path, schemas, and optional handler
 * @returns Fully typed procedure object
 *
 * @example
 * ```typescript
 * const getUserProcedure = defineProcedure({
 *   path: ['users', 'get'],
 *   input: z.object({ id: z.string() }),
 *   output: z.object({ id: z.string(), name: z.string(), email: z.string() }),
 *   metadata: {
 *     description: 'Get user by ID',
 *     tags: ['users', 'read'],
 *   },
 *   handler: async ({ id }, ctx) => {
 *     const storage = ctx.repository?.getStorage<User>('users');
 *     const user = await storage?.get(id);
 *     if (!user) throw new Error('User not found');
 *     return user;
 *   },
 * });
 * ```
 */
export function defineProcedure<
  TInput,
  TOutput,
  TMeta extends ProcedureMetadata = ProcedureMetadata
>(
  definition: ProcedureDefinition<TInput, TOutput, TMeta>
): Procedure<TInput, TOutput, TMeta> {
  const procedure: Procedure<TInput, TOutput, TMeta> = {
    path: definition.path,
    input: definition.input,
    output: definition.output,
    metadata: (definition.metadata ?? {}) as TMeta,
  };

  // Only set handler if provided (exactOptionalPropertyTypes)
  if (definition.handler) {
    procedure.handler = definition.handler;
  }

  return procedure;
}

/**
 * Define a procedure stub without handler.
 * Useful for client-side type definitions.
 *
 * @param stub - Procedure stub with path and schemas
 * @returns Procedure object without handler
 *
 * @example
 * ```typescript
 * // Client-side stub for type inference
 * const getUserStub = defineStub({
 *   path: ['users', 'get'],
 *   input: z.object({ id: z.string() }),
 *   output: z.object({ id: z.string(), name: z.string() }),
 * });
 * ```
 */
export function defineStub<TInput, TOutput>(
  stub: ProcedureStub<TInput, TOutput>
): Procedure<TInput, TOutput, ProcedureMetadata> {
  return {
    path: stub.path,
    input: stub.input,
    output: stub.output,
    metadata: stub.metadata ?? {},
  };
}

// =============================================================================
// Procedure Builder (Fluent API)
// =============================================================================

/**
 * Fluent builder for procedure definitions.
 * Provides a chainable API for building procedures.
 */
export class ProcedureBuilder<
  TInput = unknown,
  TOutput = unknown,
  TMeta extends ProcedureMetadata = ProcedureMetadata
> {
  private _path: ProcedurePath = [];
  private _input?: ZodLike<TInput>;
  private _output?: ZodLike<TOutput>;
  private _metadata: TMeta = {} as TMeta;
  private _handler?: ProcedureHandler<TInput, TOutput>;

  /**
   * Set the procedure path.
   */
  path(path: ProcedurePath): this {
    this._path = path;
    return this;
  }

  /**
   * Set the input schema.
   */
  input<T>(schema: ZodLike<T>): ProcedureBuilder<T, TOutput, TMeta> {
    const builder = this as unknown as ProcedureBuilder<T, TOutput, TMeta>;
    builder._input = schema as unknown as ZodLike<T>;
    return builder;
  }

  /**
   * Set the output schema.
   */
  output<T>(schema: ZodLike<T>): ProcedureBuilder<TInput, T, TMeta> {
    const builder = this as unknown as ProcedureBuilder<TInput, T, TMeta>;
    builder._output = schema as unknown as ZodLike<T>;
    return builder;
  }

  /**
   * Set procedure metadata.
   */
  meta<T extends ProcedureMetadata>(metadata: T): ProcedureBuilder<TInput, TOutput, T> {
    const builder = this as unknown as ProcedureBuilder<TInput, TOutput, T>;
    builder._metadata = metadata;
    return builder;
  }

  /**
   * Set the handler implementation.
   */
  handler(fn: ProcedureHandler<TInput, TOutput>): this {
    this._handler = fn;
    return this;
  }

  /**
   * Build the procedure definition.
   *
   * @throws Error if path, input, or output are not set
   */
  build(): Procedure<TInput, TOutput, TMeta> {
    if (this._path.length === 0) {
      throw new Error("Procedure path is required");
    }
    if (!this._input) {
      throw new Error("Input schema is required");
    }
    if (!this._output) {
      throw new Error("Output schema is required");
    }

    const procedure: Procedure<TInput, TOutput, TMeta> = {
      path: this._path,
      input: this._input,
      output: this._output,
      metadata: this._metadata,
    };

    // Only set handler if provided (exactOptionalPropertyTypes)
    if (this._handler) {
      procedure.handler = this._handler;
    }

    return procedure;
  }
}

/**
 * Create a new procedure builder.
 *
 * @example
 * ```typescript
 * const procedure = createProcedure()
 *   .path(['users', 'get'])
 *   .input(z.object({ id: z.string() }))
 *   .output(z.object({ id: z.string(), name: z.string() }))
 *   .meta({ description: 'Get user by ID' })
 *   .handler(async ({ id }, ctx) => {
 *     // Implementation
 *   })
 *   .build();
 * ```
 */
export function createProcedure(): ProcedureBuilder {
  return new ProcedureBuilder();
}

// =============================================================================
// Namespace Helper
// =============================================================================

/**
 * Create procedures under a common namespace.
 * Automatically prefixes all procedure paths.
 *
 * @param namespace - Namespace path prefix
 * @param procedures - Procedures to namespace
 * @returns Procedures with prefixed paths
 *
 * @example
 * ```typescript
 * const collectionProcedures = namespace(['collections', 'users'], [
 *   defineProcedure({
 *     path: ['get'],  // Becomes ['collections', 'users', 'get']
 *     input: z.object({ id: z.string() }),
 *     output: userSchema,
 *   }),
 *   defineProcedure({
 *     path: ['set'],  // Becomes ['collections', 'users', 'set']
 *     input: z.object({ id: z.string(), value: userSchema }),
 *     output: z.void(),
 *   }),
 * ]);
 * ```
 */
export function namespace<T extends Procedure<unknown, unknown, ProcedureMetadata>[]>(
  namespacePath: ProcedurePath,
  procedures: T
): T {
  return procedures.map((proc) => ({
    ...proc,
    path: [...namespacePath, ...proc.path],
  })) as T;
}

// =============================================================================
// Validation Helpers
// =============================================================================

/**
 * Validate a procedure definition.
 * Throws if the definition is invalid.
 *
 * @param procedure - Procedure to validate
 * @throws Error if validation fails
 */
export function validateProcedure(procedure: Procedure<unknown, unknown, ProcedureMetadata>): void {
  if (!procedure.path || procedure.path.length === 0) {
    throw new Error("Procedure path cannot be empty");
  }

  for (const segment of procedure.path) {
    if (typeof segment !== "string" || segment.length === 0) {
      throw new Error(`Invalid path segment: ${segment}`);
    }
    if (segment.includes(".")) {
      throw new Error(`Path segment cannot contain dots: ${segment}`);
    }
  }

  if (!procedure.input || typeof procedure.input.parse !== "function") {
    throw new Error("Input schema must have a parse method");
  }

  if (!procedure.output || typeof procedure.output.parse !== "function") {
    throw new Error("Output schema must have a parse method");
  }
}
