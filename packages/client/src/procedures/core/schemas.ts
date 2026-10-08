/**
 * Common Schemas
 *
 * Shared schema definitions for procedures that accept any input/output.
 * Centralizes the ZodLike-compatible pass-through schema and Zod adapters.
 */

import type { ZodLike, ZodErrorLike } from "../../client/validation/types.js";

// =============================================================================
// Types (re-export for convenience)
// =============================================================================

export type { ZodLike, ZodErrorLike };

/**
 * Extended ZodLike interface with `_output` phantom field.
 * Used by procedure definitions that need compile-time type inference.
 */
export interface ZodLikeSchema<T> {
  parse(data: unknown): T;
  safeParse(
    data: unknown
  ): { success: true; data: T } | { success: false; error: ZodErrorLike };
  _output: T;
}

// =============================================================================
// Any Schema - Pass-through validation
// =============================================================================

/**
 * A ZodLike schema that accepts any value and passes it through.
 * Used for procedures with dynamic or unknown input/output types.
 */
export const anySchema: ZodLike<any> = {
  parse: (value: unknown) => value,
  safeParse: (value: unknown) => ({ success: true, data: value }),
};

/**
 * Typed version of anySchema for specific type annotations.
 * Useful when you want to assert a specific type at compile time.
 */
export function typedAnySchema<T>(): ZodLike<T> {
  return {
    parse: (value: unknown) => value as T,
    safeParse: (value: unknown) => ({ success: true, data: value as T }),
  };
}

// =============================================================================
// Zod Adapter - Wraps a Zod schema for the procedure system
// =============================================================================

/**
 * Wraps a Zod schema (or any object with a `parse` method) for use with
 * the client procedure system. Adds `safeParse` with error mapping and
 * the `_output` phantom field for type inference.
 *
 * The wrapped schema's `_def` and `shape` stay visible on the adapter, so tools that read
 * a schema's fields (the mark CLI's help and its flag parser) still see them.
 */
export function zodAdapter<T>(schema: { parse: (data: unknown) => T }): ZodLikeSchema<T> {
  const inner = schema as { _def?: unknown; shape?: unknown };
  const adapter: ZodLikeSchema<T> = {
    parse: (data: unknown) => schema.parse(data),
    safeParse: (data: unknown) => {
      try {
        const parsed = schema.parse(data);
        return { success: true as const, data: parsed };
      } catch (error) {
        const err = error as { message?: string; errors?: unknown[] };
        return {
          success: false as const,
          error: {
            message: err.message ?? "Validation failed",
            errors: Array.isArray(err.errors)
              ? err.errors.map((e: unknown) => {
                  const errObj = e as { path?: unknown[]; message?: string };
                  return {
                    path: (errObj.path ?? []) as (string | number)[],
                    message: errObj.message ?? "Unknown error",
                  };
                })
              : [],
          },
        };
      }
    },
    _output: undefined as unknown as T,
  };
  // Copy only what exists: tools test `"_def" in schema` to recognize a Zod schema
  const visible: { _def?: unknown; shape?: unknown } = {};
  if (inner._def !== undefined) visible._def = inner._def;
  if (inner.shape !== undefined) visible.shape = inner.shape;
  return Object.assign(adapter, visible);
}

// =============================================================================
// Output Schema - Pass-through schema for output types
// =============================================================================

/**
 * Creates a pass-through schema for output types (no validation).
 * Equivalent to `typedAnySchema` but with the `_output` phantom field.
 */
export function outputSchema<T>(): ZodLikeSchema<T> {
  return {
    parse: (data: unknown) => data as T,
    safeParse: (data: unknown) => ({ success: true as const, data: data as T }),
    _output: undefined as unknown as T,
  };
}
