/**
 * Client Playground
 *
 * Type-safe aggregation building for procedure compositions.
 * Write aggregations in TypeScript with full autocomplete, then run them.
 *
 * @example
 * ```typescript
 * // my-agg.play.ts
 * import { proc, ref, run } from "@mark1russell7/client-playground";
 *
 * run(
 *   proc(["dag", "traverse"]).input({
 *     visit: [
 *       proc(["pnpm", "install"]).ref,
 *       proc(["git", "hasChanges"]).name("changes").ref,
 *       proc(["client", "conditional"]).input({
 *         condition: ref("changes.value"),
 *         then: proc(["git", "add"]).input({ all: true }).ref,
 *       }).ref,
 *     ],
 *   }).ref
 * );
 * ```
 *
 * Run with: `npx tsx my-agg.play.ts`
 */
import type { ProcedurePath, ProcedureRefJson } from "@mark1russell7/client";
/**
 * An output reference for referencing named stage outputs.
 */
export interface OutputRef {
    readonly $ref: string;
}
/**
 * Create an output reference.
 *
 * @param path - Reference path (e.g., "stageName.value" or "$last.value")
 * @returns Output reference object
 *
 * @example
 * ```typescript
 * ref("changes.value")     // Reference the .value field of "changes" output
 * ref("$last")             // Reference the previous step's output
 * ref("$last.success")     // Reference the .success field of previous output
 * ```
 */
export declare function ref(path: string): OutputRef;
/**
 * Builder for creating procedure references with a fluent API.
 */
export interface ProcBuilder<TInput = unknown> {
    /**
     * Set the input for this procedure.
     */
    input<T>(input: T): ProcBuilder<T>;
    /**
     * Name this stage for later reference with $ref.
     */
    name(name: string): ProcBuilder<TInput>;
    /**
     * Set when this reference should be executed.
     * @param when - "$immediate", "$never", "$parent", or a named context
     */
    when(when: string): ProcBuilder<TInput>;
    /**
     * Get the procedure reference object.
     */
    readonly ref: ProcedureRefJson<TInput>;
}
/**
 * Create a procedure reference builder.
 *
 * @param path - Path to the procedure (e.g., ["git", "add"])
 * @returns Builder for the procedure reference
 *
 * @example
 * ```typescript
 * // Simple reference
 * proc(["git", "add"]).input({ all: true }).ref
 *
 * // Named reference for $ref
 * proc(["git", "hasChanges"]).name("changes").ref
 *
 * // With execution timing
 * proc(["git", "add"]).input({ all: true }).when("$parent").ref
 * ```
 */
export declare function proc(path: ProcedurePath): ProcBuilder<unknown>;
/**
 * Options for running a procedure.
 */
export interface RunOptions {
    /** Whether to print the result (default: true) */
    print?: boolean;
    /** Output format (default: "json") */
    format?: "json" | "text";
}
/**
 * Run a procedure reference.
 *
 * This function executes the procedure and prints the result.
 * Use this in your playground files to execute aggregations.
 *
 * @param procedureRef - The procedure reference to execute
 * @param options - Execution options
 * @returns The result of the procedure
 *
 * @example
 * ```typescript
 * // Run and print result
 * await run(proc(["git", "status"]).ref);
 *
 * // Run without printing
 * const result = await run(proc(["git", "status"]).ref, { print: false });
 * ```
 */
export declare function run<T = unknown>(procedureRef: ProcedureRefJson, options?: RunOptions): Promise<T>;
export type { ProcedurePath, ProcedureRefJson } from "@mark1russell7/client";
//# sourceMappingURL=index.d.ts.map