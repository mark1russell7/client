/**
 * Procedure Reference System
 *
 * Enables procedures-as-data: procedures can be passed as inputs to other procedures,
 * composed declaratively via JSON, or imperatively via TypeScript.
 *
 * Key concepts:
 * - PROCEDURE_SYMBOL: Symbol tag to identify procedure references in JSON/objects
 * - ProcedureRef: A reference to a procedure with pre-bound input
 * - $when: Controls when a procedure reference is executed during hydration
 * - $name: Names a context so nested refs can defer execution to it
 * - hydrateInput: Walks input tree and executes nested procedure references
 * - executeRef: Helper for procedures to execute deferred refs
 * - proc(): Factory function to create procedure references
 *
 * ## Execution Control with $when
 *
 * The `$when` field controls when a procedure reference is executed:
 * - `"$immediate"` (or absent): Execute during hydration (default)
 * - `"$never"`: Never execute during hydration, pass as pure data
 * - `"$parent"`: Defer to parent procedure (pass as data)
 * - `"someName"`: Defer to named ancestor context (matched via $name)
 *
 * ## Named Contexts with $name
 *
 * Use `$name` to create a named execution context that nested refs can target:
 *
 * @example
 * ```typescript
 * // Declarative (JSON) with execution control
 * const pipelineJson = {
 *   $name: "traversal",
 *   $proc: ["dag", "traverse"],
 *   input: {
 *     visit: {
 *       $proc: ["git", "add"],
 *       input: { all: true },
 *       $when: "traversal",  // Defer to traversal context
 *     },
 *   },
 * };
 *
 * // The inner $proc is NOT executed during hydration.
 * // dag.traverse receives it as data and executes per-node.
 * await client.exec(pipelineJson);
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
 */
export declare const PROCEDURE_JSON_KEY: string;
/**
 * JSON key used to control when a procedure reference is executed.
 */
export declare const PROCEDURE_WHEN_KEY: string;
/**
 * JSON key used to name a context for deferred execution.
 */
export declare const PROCEDURE_NAME_KEY: string;
/**
 * Execute immediately during hydration (default behavior).
 */
export declare const WHEN_IMMEDIATE: string;
/**
 * Never execute during hydration - pass as pure data.
 */
export declare const WHEN_NEVER: string;
/**
 * Defer to parent procedure - pass as data for parent to execute.
 */
export declare const WHEN_PARENT: string;
/**
 * Execution timing for procedure references.
 * - `"$immediate"`: Execute during hydration (default)
 * - `"$never"`: Never execute, pass as pure data
 * - `"$parent"`: Defer to parent procedure
 * - `string`: Defer to named ancestor context
 */
export type ProcedureWhen = "$immediate" | "$never" | "$parent" | string;
/**
 * A reference to a procedure with pre-bound input (runtime form).
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
    /** Optional name for this execution context */
    readonly $name?: string;
    /** When to execute this reference */
    readonly $when?: ProcedureWhen;
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
    readonly input?: TInput;
    /** Optional name for this execution context (for nested refs to target) */
    readonly $name?: string;
    /**
     * When to execute this reference:
     * - "$immediate" (or absent): Execute during hydration
     * - "$never": Never execute, pass as pure data
     * - "$parent": Defer to parent procedure
     * - "someName": Defer to named ancestor context
     */
    readonly $when?: ProcedureWhen;
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
 * Get the $when value from a procedure reference.
 * Returns "$immediate" if not specified.
 */
export declare function getRefWhen(ref: AnyProcedureRef): ProcedureWhen;
/**
 * Get the $name value from a procedure reference, if any.
 */
export declare function getRefName(ref: AnyProcedureRef): string | undefined;
/**
 * Check if a procedure reference should be executed in the given context.
 *
 * @param ref - The procedure reference to check
 * @param contextStack - Stack of named contexts (innermost first)
 * @param isParentContext - Whether we're checking from a parent procedure
 * @returns true if the ref should be executed now
 */
export declare function shouldExecuteRef(ref: AnyProcedureRef, contextStack: string[], isParentContext?: boolean): boolean;
/**
 * Builder for creating procedure references with a fluent API.
 */
export declare class ProcedureRefBuilder<TInput = unknown, TOutput = unknown> {
    private _path;
    private _input;
    private _name?;
    private _when?;
    constructor(path: ProcedurePath);
    /**
     * Set the input for this procedure reference.
     */
    input<T>(input: T): ProcedureRefBuilder<T, TOutput>;
    /**
     * Name this execution context (for nested refs to target with $when).
     */
    name(name: string): this;
    /**
     * Set when this reference should be executed.
     * @param when - "$immediate", "$never", "$parent", or a named context
     */
    when(when: ProcedureWhen): this;
    /**
     * Shorthand for .when("$never") - pass as pure data.
     */
    defer(): this;
    /**
     * Shorthand for .when("$parent") - defer to parent procedure.
     */
    deferToParent(): this;
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
    /** Initial context stack for named contexts */
    contextStack?: string[];
}
/**
 * Hydrate an input tree by executing any nested procedure references.
 *
 * Walks the input object tree and replaces any ProcedureRef or ProcedureRefJson
 * objects with the result of executing that procedure, respecting $when timing.
 *
 * @param input - The input object potentially containing procedure references
 * @param executor - Function to execute procedure references
 * @param options - Hydration options
 * @returns The hydrated input with executed procedure refs replaced by their results
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
 * Execute a deferred procedure reference.
 *
 * This is a helper for procedures that receive deferred refs (via $when)
 * and need to execute them with additional context.
 *
 * @param ref - The procedure reference to execute
 * @param executor - Function to execute the procedure
 * @param additionalInput - Additional input to merge (e.g., cwd for dag.traverse)
 * @returns The result of executing the procedure
 *
 * @example
 * ```typescript
 * // In dag.traverse, execute a deferred ref with cwd
 * const result = await executeRef(
 *   input.visit,
 *   (path, input) => ctx.client.call(path, input),
 *   { cwd: node.repoPath }
 * );
 * ```
 */
export declare function executeRef<TOutput = unknown>(ref: AnyProcedureRef, executor: RefExecutor, additionalInput?: Record<string, unknown>): Promise<TOutput>;
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