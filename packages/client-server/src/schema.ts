/**
 * Schema Helpers
 *
 * Wraps Zod schemas for the client procedure system.
 */

import type { z } from "zod";

interface ZodErrorLike {
  message: string;
  errors: Array<{ path: (string | number)[]; message: string }>;
}

interface ZodLikeSchema<T> {
  parse(data: unknown): T;
  safeParse(
    data: unknown
  ): { success: true; data: T } | { success: false; error: ZodErrorLike };
  _output: T;
}

/**
 * Wrap a Zod schema for use with client procedures
 */
export function wrapSchema<T>(zodSchema: z.ZodType<T>): ZodLikeSchema<T> {
  return {
    parse: (data: unknown) => zodSchema.parse(data),
    safeParse: (data: unknown) => {
      const result = zodSchema.safeParse(data);
      if (result.success) {
        return { success: true as const, data: result.data };
      }
      return {
        success: false as const,
        error: {
          message: result.error.message,
          errors: result.error.errors.map((e) => ({
            path: e.path,
            message: e.message,
          })),
        },
      };
    },
    _output: undefined as unknown as T,
  };
}

/**
 * Create a pass-through schema for type T (no validation)
 */
export function schema<T>(): ZodLikeSchema<T> {
  return {
    parse: (data: unknown) => data as T,
    safeParse: (data: unknown) => ({ success: true as const, data: data as T }),
    _output: undefined as unknown as T,
  };
}
