/**
 * Procedure Reference System
 *
 * Enables procedures-as-data: procedures can be passed as inputs to other procedures,
 * composed declaratively via JSON, or imperatively via TypeScript.
 *
 * Key concepts:
 * - PROCEDURE_SYMBOL: Symbol tag to identify procedure references in JSON/objects
 * - ProcedureRef: A reference to a procedure with pre-bound input
 * - hydrateInput: Walks input tree and executes nested procedure references
 * - proc(): Factory function to create procedure references
 *
 * @example
 * ```typescript
 * // Imperative (TypeScript)
 * const pipeline = proc(["dag", "traverse"])
 *   .input({
 *     visit: proc(["client", "chain"]).input({
 *       steps: [
 *         proc(["git", "add"]).input({ all: true }),
 *         proc(["git", "commit"]).input({ message: "auto" }),
 *         proc(["git", "push"]).input({}),
 *       ],
 *     }),
 *   });
 *
 * // Declarative (JSON) - equivalent
 * const pipelineJson = {
 *   $proc: ["dag", "traverse"],
 *   input: {
 *     visit: {
 *       $proc: ["client", "chain"],
 *       input: {
 *         steps: [
 *           { $proc: ["git", "add"], input: { all: true } },
 *           { $proc: ["git", "commit"], input: { message: "auto" } },
 *           { $proc: ["git", "push"], input: {} },
 *         ],
 *       },
 *     },
 *   },
 * };
 *
 * // Both can be called via client.call()
 * await client.call(pipeline);
 * await client.call(pipelineJson);
 * ```
 */
import type { ProcedurePath } from "./types.js";
/**
 * Symbol used to tag objects as procedure references.
 * This allows procedure references to be identified during input hydration.
 */
export declare const PROCEDURE_SYMBOL: symbol;
/**
 * JSON key used to identify procedure references in serialized form.
 * When parsing JSON, objects with this key are treated as procedure refs.
 */
export declare const PROCEDURE_JSON_KEY: string;
/**
 * A reference to a procedure with pre-bound input.
 * Can be passed as input to other procedures and will be executed during hydration.
 *
 * @example
 * ```typescript
 * const ref: ProcedureRef = {
 *   [PROCEDURE_SYMBOL]: true,
 *   path: ["git", "add"],
 *   input: { all: true },
 * };
 * ```
 */
export interface ProcedureRef<TInput = unknown, TOutput = unknown> {
    /** Symbol tag identifying this as a procedure reference */
    readonly [PROCEDURE_SYMBOL]: true;
    /** Path to the procedure */
    readonly path: ProcedurePath;
    /** Pre-bound input for the procedure */
    readonly input: TInput;
    /**
     * Phantom type for output inference.
     * Not present at runtime, used for TypeScript type inference.
     */
    readonly __output?: TOutput;
}
/**
 * JSON-serializable form of a procedure reference.
 * Uses `$proc` key instead of Symbol for JSON compatibility.
 */
export interface ProcedureRefJson<TInput = unknown> {
    /** JSON key identifying this as a procedure reference */
    readonly $proc: ProcedurePath;
    /** Pre-bound input for the procedure */
    readonly input: TInput;
}
/**
 * Either a runtime ProcedureRef or JSON-serialized form.
 */
export type AnyProcedureRef<TInput = unknown, TOutput = unknown> = ProcedureRef<TInput, TOutput> | ProcedureRefJson<TInput>;
/**
 * Check if a value is a procedure reference (runtime form with Symbol).
 */
export declare function isProcedureRef(value: unknown): value is ProcedureRef;
/**
 * Check if a value is a JSON procedure reference (serialized form with $proc key).
 */
export declare function isProcedureRefJson(value: unknown): value is ProcedureRefJson;
/**
 * Check if a value is any form of procedure reference.
 */
export declare function isAnyProcedureRef(value: unknown): value is AnyProcedureRef;
/**
 * Builder for creating procedure references with a fluent API.
 */
export declare class ProcedureRefBuilder<TInput = unknown, TOutput = unknown> {
    private _path;
    private _input;
    constructor(path: ProcedurePath);
    /**
     * Set the input for this procedure reference.
     */
    input<T>(input: T): ProcedureRefBuilder<T, TOutput>;
    /**
     * Build the procedure reference object.
     */
    build(): ProcedureRef<TInput, TOutput>;
    /**
     * Convert to JSON-serializable form.
     */
    toJson(): ProcedureRefJson<TInput>;
    /**
     * Alias for build() - makes the builder callable in expression contexts.
     */
    get ref(): ProcedureRef<TInput, TOutput>;
}
/**
 * Create a procedure reference.
 *
 * @param path - Path to the procedure
 * @returns Builder for the procedure reference
 *
 * @example
 * ```typescript
 * // Simple reference
 * const addRef = proc(["git", "add"]).input({ all: true }).build();
 *
 * // Nested references (procedures as inputs)
 * const pipeline = proc(["client", "chain"]).input({
 *   steps: [
 *     proc(["git", "add"]).input({ all: true }).ref,
 *     proc(["git", "commit"]).input({ message: "auto" }).ref,
 *   ],
 * }).build();
 * ```
 */
export declare function proc<TOutput = unknown>(path: ProcedurePath): ProcedureRefBuilder<unknown, TOutput>;
/**
 * Convert a procedure reference from JSON form to runtime form.
 */
export declare function fromJson<TInput, TOutput>(json: ProcedureRefJson<TInput>): ProcedureRef<TInput, TOutput>;
/**
 * Convert a procedure reference from runtime form to JSON form.
 */
export declare function toJson<TInput>(ref: ProcedureRef<TInput>): ProcedureRefJson<TInput>;
/**
 * Normalize any procedure reference to runtime form.
 */
export declare function normalizeRef<TInput, TOutput>(ref: AnyProcedureRef<TInput, TOutput>): ProcedureRef<TInput, TOutput>;
/**
 * Executor function type for hydration.
 * Called for each procedure reference found during hydration.
 */
export type RefExecutor = <TInput, TOutput>(path: ProcedurePath, input: TInput) => Promise<TOutput>;
/**
 * Options for input hydration.
 */
export interface HydrateOptions {
    /** Maximum depth for recursive hydration (default: 10) */
    maxDepth?: number;
    /** Whether to execute refs in parallel when possible (default: false) */
    parallel?: boolean;
}
/**
 * Hydrate an input tree by executing any nested procedure references.
 *
 * Walks the input object tree and replaces any ProcedureRef or ProcedureRefJson
 * objects with the result of executing that procedure.
 *
 * @param input - The input object potentially containing procedure references
 * @param executor - Function to execute procedure references
 * @param options - Hydration options
 * @returns The hydrated input with all procedure refs replaced by their results
 *
 * @example
 * ```typescript
 * const input = {
 *   visit: proc(["git", "add"]).input({ all: true }).build(),
 *   config: { nested: true },
 * };
 *
 * const hydrated = await hydrateInput(input, async (path, input) => {
 *   return await client.call({ path, input });
 * });
 *
 * // hydrated.visit is now the result of executing git.add
 * ```
 */
export declare function hydrateInput<T>(input: T, executor: RefExecutor, options?: HydrateOptions): Promise<T>;
/**
 * Extract a JSON template from a procedure reference.
 * Useful for serializing imperative procedure compositions.
 *
 * @param ref - Procedure reference to extract template from
 * @returns JSON-serializable template
 */
export declare function extractTemplate<TInput>(ref: ProcedureRef<TInput>): ProcedureRefJson<unknown>;
/**
 * Parse JSON string and convert $proc objects to runtime ProcedureRef objects.
 *
 * @param json - JSON string potentially containing procedure references
 * @returns Parsed object with ProcedureRef objects
 */
export declare function parseProcedureJson<T>(json: string): T;
/**
 * Stringify an object with procedure refs to JSON.
 * Converts ProcedureRef objects to $proc JSON form.
 *
 * @param value - Object potentially containing ProcedureRef objects
 * @param space - Indentation (passed to JSON.stringify)
 * @returns JSON string
 */
export declare function stringifyProcedureJson(value: unknown, space?: number): string;
//# sourceMappingURL=ref.d.ts.map