/**
 * Common Schemas
 *
 * Shared schema definitions for procedures that accept any input/output.
 * Centralizes the ZodLike-compatible pass-through schema and Zod adapters.
 */
import type { ZodLike, ZodErrorLike } from "../../client/validation/types.js";
export type { ZodLike, ZodErrorLike };
/**
 * Extended ZodLike interface with `_output` phantom field.
 * Used by procedure definitions that need compile-time type inference.
 */
export interface ZodLikeSchema<T> {
    parse(data: unknown): T;
    safeParse(data: unknown): {
        success: true;
        data: T;
    } | {
        success: false;
        error: ZodErrorLike;
    };
    _output: T;
}
/**
 * A ZodLike schema that accepts any value and passes it through.
 * Used for procedures with dynamic or unknown input/output types.
 */
export declare const anySchema: ZodLike<any>;
/**
 * Typed version of anySchema for specific type annotations.
 * Useful when you want to assert a specific type at compile time.
 */
export declare function typedAnySchema<T>(): ZodLike<T>;
/**
 * Wraps a Zod schema (or any object with a `parse` method) for use with
 * the client procedure system. Adds `safeParse` with error mapping and
 * the `_output` phantom field for type inference.
 */
export declare function zodAdapter<T>(schema: {
    parse: (data: unknown) => T;
}): ZodLikeSchema<T>;
/**
 * Creates a pass-through schema for output types (no validation).
 * Equivalent to `typedAnySchema` but with the `_output` phantom field.
 */
export declare function outputSchema<T>(): ZodLikeSchema<T>;
//# sourceMappingURL=schemas.d.ts.map