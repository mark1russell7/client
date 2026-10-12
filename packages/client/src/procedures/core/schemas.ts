/**
 * Common Schemas
 *
 * Shared schema definitions for procedures that accept any input/output, and the adapter of
 * zod schemas. Every schema here is a Standard Schema v1 (`~standard`), so the core validates
 * them all through `validateSchema()`.
 */

import type { ZodLike, ZodErrorLike } from "../../client/validation/types.js";
import { isStandardSchema, type JsonSchema, type StandardSchemaV1 } from "../schema.js";

// =============================================================================
// Types (re-export for convenience)
// =============================================================================

export type { ZodLike, ZodErrorLike };

/**
 * A `ZodLike` schema with the `_output` phantom field, for type inference. A zod 4 schema is one.
 */
export interface ZodLikeSchema<T> extends ZodLike<T> {
  _output: T;
}

/** The Standard Schema properties of a schema that accepts every value unchanged. */
function passThrough<T>(): StandardSchemaV1.Props<unknown, T> {
  return {
    version: 1,
    vendor: "@procedures/client",
    validate: (value: unknown) => ({ value: value as T }),
  };
}

// =============================================================================
// Any Schema - Pass-through validation
// =============================================================================

/**
 * A schema that accepts any value and passes it through. Its JSON Schema is `{}` (any value).
 * Used for procedures with dynamic or unknown input/output types.
 */
export const anySchema: ZodLike<any> & StandardSchemaV1<unknown, any> & { readonly "~jsonSchema": JsonSchema } = {
  parse: (value: unknown) => value,
  safeParse: (value: unknown) => ({ success: true, data: value }),
  "~standard": passThrough<any>(),
  "~jsonSchema": {},
};

/**
 * Typed version of anySchema for specific type annotations.
 * Useful when you want to assert a specific type at compile time.
 */
export function typedAnySchema<T>(): ZodLike<T> & StandardSchemaV1<unknown, T> {
  return {
    parse: (value: unknown) => value as T,
    safeParse: (value: unknown) => ({ success: true, data: value as T }),
    "~standard": passThrough<T>(),
  };
}

// =============================================================================
// Zod Adapter - Wraps a Zod schema for the procedure system
// =============================================================================

/**
 * Gives a zod schema the type of a procedure schema (`ZodLikeSchema<T>`). A zod 4 schema is a
 * Standard Schema already, so the function returns it unchanged: the validation and the JSON
 * Schema come from zod itself.
 *
 * An object with only a `parse` method gets `safeParse` and `~standard` around that method.
 */
export function zodAdapter<T>(schema: { parse: (data: unknown) => T }): ZodLikeSchema<T> {
  if (isStandardSchema(schema) && typeof (schema as { safeParse?: unknown }).safeParse === "function") {
    return schema as unknown as ZodLikeSchema<T>;
  }
  const safeParse = (data: unknown): { success: true; data: T } | { success: false; error: ZodErrorLike } => {
    try {
      return { success: true, data: schema.parse(data) };
    } catch (error) {
      const err = error as { message?: string; issues?: ZodErrorLike["issues"]; errors?: ZodErrorLike["errors"] };
      const message = err.message ?? "Validation failed";
      // A plain Error has no issues: its message is the one issue
      const issues = err.issues ?? err.errors;
      return { success: false, error: { message, issues: issues && issues.length > 0 ? issues : [{ message }] } };
    }
  };
  return {
    parse: (data: unknown) => schema.parse(data),
    safeParse,
    _output: undefined as unknown as T,
    "~standard": {
      version: 1,
      vendor: "@procedures/client",
      validate: (value: unknown) => {
        const result = safeParse(value);
        return result.success
          ? { value: result.data }
          : { issues: (result.error.issues ?? []).map((issue) => ({ message: issue.message, path: issue.path })) };
      },
    },
  } as ZodLikeSchema<T>;
}

// =============================================================================
// Output Schema - Pass-through schema for output types
// =============================================================================

/**
 * A pass-through schema: it validates nothing and has no JSON Schema. The type parameter only
 * gives the TypeScript type.
 *
 * Use it for internal procedures where a real schema adds nothing. A procedure that an MCP
 * server exposes, or that a user calls from the CLI, takes a real schema (zod), so its input
 * is validated and its tools and help describe the fields (roadmap 2.1).
 */
export function outputSchema<T>(): ZodLikeSchema<T> & StandardSchemaV1<unknown, T> {
  return {
    parse: (data: unknown) => data as T,
    safeParse: (data: unknown) => ({ success: true as const, data: data as T }),
    _output: undefined as unknown as T,
    "~standard": passThrough<T>(),
  };
}
