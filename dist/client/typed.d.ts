/**
 * Typed Procedure Caller
 *
 * Creates a typed wrapper around a procedure caller function.
 * Provides compile-time autocomplete for procedure paths, inputs, and outputs.
 *
 * @example
 * ```typescript
 * import { createTypedCaller } from "@mark1russell7/client";
 * import type { MongoProcedures, ProcedureInput, ProcedureOutput } from "@mark1russell7/client-mongo";
 *
 * // Create typed caller
 * const call = createTypedCaller<MongoProcedures>(client.call.bind(client));
 *
 * // Full autocomplete on path and input!
 * const result = await call(
 *   ["mongo", "documents", "find"],
 *   { query: { status: "active" } },
 *   { metadata: { collection: "users" } }
 * );
 * // result is typed as FindOutput
 * ```
 */
import type { CallOptions } from "./context.js";
/**
 * Procedure definition with input and output types
 */
export interface ProcedureDef {
    input: unknown;
    output: unknown;
}
/**
 * Nested procedure namespace
 */
export type ProcedureNamespace = {
    [key: string]: ProcedureDef | ProcedureNamespace;
};
/**
 * Extract all valid paths from a procedures interface
 */
export type ProcedurePaths<T, Prefix extends string[] = []> = T extends ProcedureDef ? Prefix : T extends ProcedureNamespace ? {
    [K in keyof T]: T[K] extends ProcedureDef ? [...Prefix, K & string] : T[K] extends ProcedureNamespace ? ProcedurePaths<T[K], [...Prefix, K & string]> : never;
}[keyof T] : never;
/**
 * Get procedure definition at a path
 */
export type GetProcedure<T, P extends string[]> = P extends [infer K extends keyof T] ? T[K] : P extends [infer K extends keyof T, ...infer Rest extends string[]] ? GetProcedure<T[K], Rest> : never;
/**
 * Extract input type for a path
 */
export type PathInput<T, P extends string[]> = GetProcedure<T, P> extends ProcedureDef ? GetProcedure<T, P>["input"] : never;
/**
 * Extract output type for a path
 */
export type PathOutput<T, P extends string[]> = GetProcedure<T, P> extends ProcedureDef ? GetProcedure<T, P>["output"] : never;
/**
 * Base caller function type
 */
export type BaseCaller = <TOutput>(path: string[], input: unknown, options?: CallOptions) => Promise<TOutput>;
/**
 * Typed caller function
 */
export interface TypedCaller<T extends ProcedureNamespace> {
    <P extends ProcedurePaths<T> & string[]>(path: P, input: PathInput<T, P>, options?: CallOptions): Promise<PathOutput<T, P>>;
}
/**
 * Create a typed procedure caller
 *
 * Wraps a base caller function to provide compile-time type safety
 * for procedure paths, inputs, and outputs.
 *
 * @param caller - Base caller function (e.g., client.call.bind(client))
 * @returns Typed caller with autocomplete
 *
 * @example
 * ```typescript
 * import type { MongoProcedures } from "@mark1russell7/client-mongo";
 *
 * const typedCall = createTypedCaller<MongoProcedures>(client.call.bind(client));
 *
 * // TypeScript knows:
 * // - path must be a valid procedure path
 * // - input must match the procedure's input type
 * // - result is the procedure's output type
 * const result = await typedCall(
 *   ["mongo", "documents", "find"],
 *   { query: {}, page: 1 }
 * );
 * ```
 */
export declare function createTypedCaller<T extends ProcedureNamespace>(caller: BaseCaller): TypedCaller<T>;
/**
 * Type helper to merge multiple procedure interfaces
 *
 * @example
 * ```typescript
 * type AllProcedures = MergeProcedures<MongoProcedures & UIProcedures>;
 * const call = createTypedCaller<AllProcedures>(client.call);
 * ```
 */
export type MergeProcedures<T extends ProcedureNamespace> = T;
//# sourceMappingURL=typed.d.ts.map