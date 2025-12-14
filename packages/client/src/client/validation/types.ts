/**
 * Zod Validation Types
 *
 * Type definitions for schema validation middleware.
 * Works with Zod as an optional peer dependency.
 */

import type { Method } from "../types";

// =============================================================================
// Schema Types (Zod-compatible but decoupled)
// =============================================================================

/**
 * Generic schema interface compatible with Zod.
 * Allows the validation system to work without direct Zod dependency.
 */
export interface ZodLike<T = unknown> {
  parse(data: unknown): T;
  safeParse(data: unknown): { success: true; data: T } | { success: false; error: ZodErrorLike };
}

/**
 * Generic Zod error interface.
 */
export interface ZodErrorLike {
  message: string;
  errors: Array<{ path: (string | number)[]; message: string }>;
}

/**
 * Schema definition for a method (input and/or output validation).
 */
export interface SchemaDefinition<
  TInput extends ZodLike = ZodLike,
  TOutput extends ZodLike = ZodLike,
> {
  /** Input/request payload schema */
  input?: TInput;
  /** Output/response payload schema */
  output?: TOutput;
}

/**
 * Infer the input type from a schema definition.
 */
export type InferInput<T> = T extends SchemaDefinition<infer TInput, any>
  ? TInput extends ZodLike<infer U>
    ? U
    : unknown
  : unknown;

/**
 * Infer the output type from a schema definition.
 */
export type InferOutput<T> = T extends SchemaDefinition<any, infer TOutput>
  ? TOutput extends ZodLike<infer U>
    ? U
    : unknown
  : unknown;

// =============================================================================
// Method Key
// =============================================================================

/**
 * Method key for schema registry lookup.
 * Format: "service.operation" or "service.operation.version"
 */
export type MethodKey = `${string}.${string}` | `${string}.${string}.${string}`;

/**
 * Convert a Method object to a registry key string.
 */
export function methodToKey(method: Method): MethodKey {
  return method.version
    ? `${method.service}.${method.operation}.${method.version}`
    : `${method.service}.${method.operation}`;
}

/**
 * Parse a method key back to a Method object.
 */
export function keyToMethod(key: MethodKey): Method {
  const parts = key.split(".");
  if (parts.length === 3 && parts[2]) {
    return { service: parts[0]!, operation: parts[1]!, version: parts[2] };
  }
  return { service: parts[0]!, operation: parts[1]! };
}

// =============================================================================
// Schema Registry
// =============================================================================

/**
 * Schema registry mapping method keys to schema definitions.
 */
export type SchemaRegistry = Map<MethodKey, SchemaDefinition>;

/**
 * Type-level schema registry for compile-time type inference.
 */
export interface TypedSchemaRegistry {
  [methodKey: string]: SchemaDefinition;
}

// =============================================================================
// Validation Error
// =============================================================================

/**
 * Validation phase indicator.
 */
export type ValidationPhase = "input" | "output";

/**
 * Error thrown when validation fails.
 */
export class ValidationError extends Error {
  override readonly name = "ValidationError";

  constructor(
    message: string,
    /** Which phase of validation failed */
    public readonly phase: ValidationPhase,
    /** The underlying Zod error */
    public readonly zodError: ZodErrorLike,
    /** The method being called */
    public readonly method: Method,
  ) {
    super(message);

    // Maintain proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ValidationError);
    }
  }

  /**
   * Get formatted validation error details.
   */
  get details(): string {
    const errors = this.zodError.errors
      .map((e) => `  - ${e.path.join(".")}: ${e.message}`)
      .join("\n");
    return `${this.phase} validation failed for ${this.method.service}.${this.method.operation}:\n${errors}`;
  }
}

// =============================================================================
// Middleware Context
// =============================================================================

/**
 * Context provided by Zod validation middleware.
 */
export interface ZodValidationContext {
  validation: {
    /** Whether input was validated */
    inputValidated: boolean;
    /** Whether output was validated */
    outputValidated: boolean;
    /** The method key used for schema lookup */
    methodKey: MethodKey;
  };
}
