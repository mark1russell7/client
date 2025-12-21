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

// =============================================================================
// Procedure Reference Constants
// =============================================================================

/**
 * Symbol used to tag objects as procedure references.
 * This allows procedure references to be identified during input hydration.
 */
export const PROCEDURE_SYMBOL: symbol = Symbol.for("@mark/procedure");

/**
 * JSON key used to identify procedure references in serialized form.
 */
export const PROCEDURE_JSON_KEY: string = "$proc";

/**
 * JSON key used to control when a procedure reference is executed.
 */
export const PROCEDURE_WHEN_KEY: string = "$when";

/**
 * JSON key used to name a context for deferred execution.
 */
export const PROCEDURE_NAME_KEY: string = "$name";

/**
 * JSON key used to reference outputs from named stages.
 */
export const OUTPUT_REF_KEY: string = "$ref";

// =============================================================================
// Execution Timing Constants
// =============================================================================

/**
 * Execute immediately during hydration (default behavior).
 */
export const WHEN_IMMEDIATE: string = "$immediate";

/**
 * Never execute during hydration - pass as pure data.
 */
export const WHEN_NEVER: string = "$never";

/**
 * Defer to parent procedure - pass as data for parent to execute.
 */
export const WHEN_PARENT: string = "$parent";

// =============================================================================
// Step Result Info (for $continueIf handlers)
// =============================================================================

/**
 * Information passed to $continueIf handlers about the result of a procedure execution.
 */
export interface StepResultInfo {
  /** Whether the procedure executed successfully */
  success: boolean;

  /** The procedure's output (if success) */
  result?: unknown;

  /** Error message (if failed) */
  error?: string;

  /** Whether the operation was a no-op (from result.skipped if present) */
  skipped?: boolean;

  /** The procedure path that was executed */
  proc: ProcedurePath;
}

/**
 * Decision returned by $continueIf handlers.
 */
export interface ContinueDecision {
  /** Whether to continue execution (true) or propagate the error (false) */
  continue: boolean;
}

// =============================================================================
// Output Reference Types (for $ref)
// =============================================================================

/**
 * A reference to an output from a named stage.
 *
 * Reference syntax:
 * - `"stageName"` - reference full output of named stage
 * - `"stageName.field"` - reference field in output
 * - `"stageName.nested.path"` - deep path traversal
 * - `"$last"` - reference previous stage output
 * - `"$last.value"` - reference field in previous output
 */
export interface OutputRef {
  /** Path to a named output, optionally with property path */
  readonly $ref: string;
}

/**
 * Scope for tracking outputs during chain execution.
 * Scopes form a tree structure for nested chains.
 */
export interface RefScope {
  /** Named outputs in this scope */
  outputs: Map<string, unknown>;

  /** Previous step output ($last) */
  last?: unknown | undefined;

  /** Parent scope for nested chains */
  parent?: RefScope | undefined;

  /** This scope's name (if in a named chain) */
  name?: string | undefined;
}

/**
 * Create a new RefScope with optional parent.
 */
export function createRefScope(parent?: RefScope, name?: string): RefScope {
  return {
    outputs: new Map(),
    parent,
    name,
  };
}

/**
 * Get a value by path from an object.
 * Supports dot-separated paths like "foo.bar.baz".
 */
export function getPath(obj: unknown, path: string[]): unknown {
  let value = obj;
  for (const key of path) {
    if (value && typeof value === "object") {
      value = (value as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }
  return value;
}

/**
 * Resolve an output reference within a scope.
 *
 * @param refPath - The reference path (e.g., "stageName.value" or "$last.value")
 * @param scope - The current scope to resolve within
 * @returns The resolved value, or undefined if not found
 */
export function resolveOutputRef(refPath: string, scope: RefScope): unknown {
  const parts = refPath.split(".");
  const [first, ...rest] = parts;

  // Handle $last reference
  if (first === "$last") {
    return getPath(scope.last, rest);
  }

  // Look up in current scope, then parent scopes
  let currentScope: RefScope | undefined = scope;
  while (currentScope) {
    if (currentScope.outputs.has(first!)) {
      return getPath(currentScope.outputs.get(first!), rest);
    }
    currentScope = currentScope.parent;
  }

  return undefined;
}

// =============================================================================
// Procedure Reference Types
// =============================================================================

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
export type AnyProcedureRef<TInput = unknown, TOutput = unknown> =
  | ProcedureRef<TInput, TOutput>
  | ProcedureRefJson<TInput>;

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Check if a value is a procedure reference (runtime form with Symbol).
 */
export function isProcedureRef(value: unknown): value is ProcedureRef {
  return (
    typeof value === "object" &&
    value !== null &&
    PROCEDURE_SYMBOL in value &&
    (value as Record<symbol, unknown>)[PROCEDURE_SYMBOL] === true
  );
}

/**
 * Check if a value is a JSON procedure reference (serialized form with $proc key).
 */
export function isProcedureRefJson(value: unknown): value is ProcedureRefJson {
  return (
    typeof value === "object" &&
    value !== null &&
    PROCEDURE_JSON_KEY in value &&
    Array.isArray((value as Record<string, unknown>)[PROCEDURE_JSON_KEY])
  );
}

/**
 * Check if a value is any form of procedure reference.
 */
export function isAnyProcedureRef(value: unknown): value is AnyProcedureRef {
  return isProcedureRef(value) || isProcedureRefJson(value);
}

/**
 * Check if a value is an output reference ($ref).
 */
export function isOutputRef(value: unknown): value is OutputRef {
  return (
    typeof value === "object" &&
    value !== null &&
    OUTPUT_REF_KEY in value &&
    typeof (value as Record<string, unknown>)[OUTPUT_REF_KEY] === "string"
  );
}

/**
 * Get the $when value from a procedure reference.
 * Returns "$immediate" if not specified.
 */
export function getRefWhen(ref: AnyProcedureRef): ProcedureWhen {
  if (isProcedureRef(ref)) {
    return ref.$when ?? WHEN_IMMEDIATE;
  }
  return ref.$when ?? WHEN_IMMEDIATE;
}

/**
 * Get the $name value from a procedure reference, if any.
 */
export function getRefName(ref: AnyProcedureRef): string | undefined {
  if (isProcedureRef(ref)) {
    return ref.$name;
  }
  return ref.$name;
}

/**
 * Check if a procedure reference should be executed in the given context.
 *
 * @param ref - The procedure reference to check
 * @param contextStack - Stack of named contexts (innermost first)
 * @param isParentContext - Whether we're checking from a parent procedure
 * @returns true if the ref should be executed now
 */
export function shouldExecuteRef(
  ref: AnyProcedureRef,
  contextStack: string[],
  isParentContext: boolean = false
): boolean {
  const when = getRefWhen(ref);

  // $immediate: always execute during hydration
  if (when === WHEN_IMMEDIATE) {
    return true;
  }

  // $never: never execute during hydration
  if (when === WHEN_NEVER) {
    return false;
  }

  // $parent: execute only when called from parent procedure
  if (when === WHEN_PARENT) {
    return isParentContext;
  }

  // Named context: execute only when inside that named context
  // The ref should execute when we're currently inside the named context
  return contextStack.includes(when);
}

// =============================================================================
// Procedure Reference Builder
// =============================================================================

/**
 * Builder for creating procedure references with a fluent API.
 */
export class ProcedureRefBuilder<TInput = unknown, TOutput = unknown> {
  private _path: ProcedurePath;
  private _input: TInput = {} as TInput;
  private _name?: string;
  private _when?: ProcedureWhen;

  constructor(path: ProcedurePath) {
    this._path = path;
  }

  /**
   * Set the input for this procedure reference.
   */
  input<T>(input: T): ProcedureRefBuilder<T, TOutput> {
    const builder = this as unknown as ProcedureRefBuilder<T, TOutput>;
    builder._input = input;
    return builder;
  }

  /**
   * Name this execution context (for nested refs to target with $when).
   */
  name(name: string): this {
    this._name = name;
    return this;
  }

  /**
   * Set when this reference should be executed.
   * @param when - "$immediate", "$never", "$parent", or a named context
   */
  when(when: ProcedureWhen): this {
    this._when = when;
    return this;
  }

  /**
   * Shorthand for .when("$never") - pass as pure data.
   */
  defer(): this {
    this._when = WHEN_NEVER;
    return this;
  }

  /**
   * Shorthand for .when("$parent") - defer to parent procedure.
   */
  deferToParent(): this {
    this._when = WHEN_PARENT;
    return this;
  }

  /**
   * Build the procedure reference object.
   */
  build(): ProcedureRef<TInput, TOutput> {
    const ref: ProcedureRef<TInput, TOutput> = {
      [PROCEDURE_SYMBOL]: true,
      path: this._path,
      input: this._input,
    } as ProcedureRef<TInput, TOutput>;

    if (this._name) {
      (ref as any).$name = this._name;
    }
    if (this._when) {
      (ref as any).$when = this._when;
    }

    return ref;
  }

  /**
   * Convert to JSON-serializable form.
   */
  toJson(): ProcedureRefJson<TInput> {
    const json: ProcedureRefJson<TInput> = {
      $proc: this._path,
      input: this._input,
    };

    if (this._name) {
      (json as any).$name = this._name;
    }
    if (this._when) {
      (json as any).$when = this._when;
    }

    return json;
  }

  /**
   * Alias for build() - makes the builder callable in expression contexts.
   */
  get ref(): ProcedureRef<TInput, TOutput> {
    return this.build();
  }
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
export function proc<TOutput = unknown>(
  path: ProcedurePath
): ProcedureRefBuilder<unknown, TOutput> {
  return new ProcedureRefBuilder<unknown, TOutput>(path);
}

// =============================================================================
// JSON Conversion
// =============================================================================

/**
 * Convert a procedure reference from JSON form to runtime form.
 */
export function fromJson<TInput, TOutput>(
  json: ProcedureRefJson<TInput>
): ProcedureRef<TInput, TOutput> {
  return {
    [PROCEDURE_SYMBOL]: true,
    path: json.$proc,
    input: json.input,
  } as ProcedureRef<TInput, TOutput>;
}

/**
 * Convert a procedure reference from runtime form to JSON form.
 */
export function toJson<TInput>(ref: ProcedureRef<TInput>): ProcedureRefJson<TInput> {
  return {
    $proc: ref.path,
    input: ref.input,
  };
}

/**
 * Normalize any procedure reference to runtime form.
 */
export function normalizeRef<TInput, TOutput>(
  ref: AnyProcedureRef<TInput, TOutput>
): ProcedureRef<TInput, TOutput> {
  if (isProcedureRef(ref)) {
    return ref;
  }
  return fromJson(ref);
}

// =============================================================================
// Input Hydration
// =============================================================================

/**
 * Executor function type for hydration.
 * Called for each procedure reference found during hydration.
 */
export type RefExecutor = <TInput, TOutput>(
  path: ProcedurePath,
  input: TInput
) => Promise<TOutput>;

/**
 * Options for input hydration.
 */
export interface HydrateOptions {
  /** Maximum depth for recursive hydration (default: 10) */
  maxDepth?: number | undefined;

  /** Whether to execute refs in parallel when possible (default: false) */
  parallel?: boolean | undefined;

  /** Initial context stack for named contexts */
  contextStack?: string[] | undefined;

  /** Scope for resolving output references ($ref) */
  scope?: RefScope | undefined;
}

/**
 * Internal context for hydration.
 */
interface HydrateContext {
  executor: RefExecutor;
  maxDepth: number;
  contextStack: string[];
  scope?: RefScope | undefined;
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
export async function hydrateInput<T>(
  input: T,
  executor: RefExecutor,
  options: HydrateOptions = {}
): Promise<T> {
  const { maxDepth = 10, contextStack = [], scope } = options;
  const ctx: HydrateContext = { executor, maxDepth, contextStack, scope };
  return hydrateValue(input, ctx, 0);
}

/**
 * Internal recursive hydration function.
 */
async function hydrateValue<T>(
  value: T,
  ctx: HydrateContext,
  depth: number
): Promise<T> {
  // Depth check
  if (depth > ctx.maxDepth) {
    throw new Error(`Hydration depth exceeded maximum of ${ctx.maxDepth}`);
  }

  // Handle null/undefined/primitives
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value !== "object") {
    return value;
  }

  // Check if this is an output reference ($ref)
  if (isOutputRef(value)) {
    if (ctx.scope) {
      return resolveOutputRef(value.$ref, ctx.scope) as T;
    }
    // No scope available - return the $ref as-is (will be resolved later by chain)
    return value;
  }

  // Check if this is a procedure reference ($proc)
  if (isAnyProcedureRef(value)) {
    const name = getRefName(value);

    // Check if we should execute this ref based on $when
    if (!shouldExecuteRef(value, ctx.contextStack, false)) {
      // Don't execute - pass through as data
      // But still hydrate the input for any nested $immediate refs
      const ref = normalizeRef(value);
      const hydratedInput = await hydrateValue(ref.input, ctx, depth + 1);

      // Return the ref with hydrated input
      if (isProcedureRefJson(value)) {
        return {
          ...value,
          input: hydratedInput,
        } as T;
      } else {
        return {
          ...value,
          input: hydratedInput,
        } as T;
      }
    }

    // Execute this ref
    const ref = normalizeRef(value);

    // Push this context name if present
    const newStack = name ? [name, ...ctx.contextStack] : ctx.contextStack;
    const newCtx = { ...ctx, contextStack: newStack };

    // First, hydrate the input of the procedure reference itself
    const hydratedInput = await hydrateValue(ref.input, newCtx, depth + 1);

    // Then execute the procedure with hydrated input
    const result = await ctx.executor(ref.path, hydratedInput);

    return result as T;
  }

  // Handle arrays
  if (Array.isArray(value)) {
    // Check if this is an array of procedure refs (implicit chain)
    // Only treat as implicit chain if ALL elements are procedure refs
    if (value.length > 0 && value.every((item) => isAnyProcedureRef(item))) {
      // Transform to explicit chain
      const implicitChain: ProcedureRefJson = {
        $proc: ["client", "chain"],
        input: { steps: value },
      };
      // Hydrate the implicit chain (which will execute it)
      return hydrateValue(implicitChain as unknown as T, ctx, depth);
    }

    const hydrated = await Promise.all(
      value.map((item) => hydrateValue(item, ctx, depth + 1))
    );
    return hydrated as T;
  }

  // Handle plain objects
  const obj = value as Record<string, unknown>;
  const entries = Object.entries(obj);
  const hydratedEntries = await Promise.all(
    entries.map(async ([key, val]) => {
      const hydratedVal = await hydrateValue(val, ctx, depth + 1);
      return [key, hydratedVal] as const;
    })
  );

  return Object.fromEntries(hydratedEntries) as T;
}

// =============================================================================
// Deferred Ref Execution
// =============================================================================

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
export async function executeRef<TOutput = unknown>(
  ref: AnyProcedureRef,
  executor: RefExecutor,
  additionalInput?: Record<string, unknown>
): Promise<TOutput> {
  const normalized = normalizeRef(ref);
  const baseInput = typeof normalized.input === "object" ? normalized.input : {};

  // Merge additional input
  const mergedInput = {
    ...(baseInput as Record<string, unknown>),
    ...additionalInput,
  };

  // Hydrate the merged input (execute any nested $immediate refs)
  const hydratedInput = await hydrateInput(mergedInput, executor, {
    contextStack: [], // Fresh context for deferred execution
  });

  return executor(normalized.path, hydratedInput);
}

// =============================================================================
// Template Extraction
// =============================================================================

/**
 * Extract a JSON template from a procedure reference.
 * Useful for serializing imperative procedure compositions.
 *
 * @param ref - Procedure reference to extract template from
 * @returns JSON-serializable template
 */
export function extractTemplate<TInput>(
  ref: ProcedureRef<TInput>
): ProcedureRefJson<unknown> {
  return extractTemplateValue(ref) as ProcedureRefJson<unknown>;
}

/**
 * Internal recursive template extraction.
 */
function extractTemplateValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value !== "object") {
    return value;
  }

  // Convert procedure refs to JSON form
  if (isProcedureRef(value)) {
    return {
      $proc: value.path,
      input: extractTemplateValue(value.input),
    };
  }

  // Already JSON form
  if (isProcedureRefJson(value)) {
    return {
      $proc: value.$proc,
      input: extractTemplateValue(value.input),
    };
  }

  // Handle arrays
  if (Array.isArray(value)) {
    return value.map(extractTemplateValue);
  }

  // Handle plain objects
  const obj = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    result[key] = extractTemplateValue(val);
  }
  return result;
}

// =============================================================================
// Parse JSON with Procedure Refs
// =============================================================================

/**
 * Parse JSON string and convert $proc objects to runtime ProcedureRef objects.
 *
 * @param json - JSON string potentially containing procedure references
 * @returns Parsed object with ProcedureRef objects
 */
export function parseProcedureJson<T>(json: string): T {
  const parsed = JSON.parse(json);
  return convertJsonToRefs(parsed) as T;
}

/**
 * Convert parsed JSON to runtime procedure refs.
 */
function convertJsonToRefs(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value !== "object") {
    return value;
  }

  // Convert $proc objects to ProcedureRef
  if (isProcedureRefJson(value)) {
    return {
      [PROCEDURE_SYMBOL]: true,
      path: value.$proc,
      input: convertJsonToRefs(value.input),
    };
  }

  // Handle arrays
  if (Array.isArray(value)) {
    return value.map(convertJsonToRefs);
  }

  // Handle plain objects
  const obj = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    result[key] = convertJsonToRefs(val);
  }
  return result;
}

/**
 * Stringify an object with procedure refs to JSON.
 * Converts ProcedureRef objects to $proc JSON form.
 *
 * @param value - Object potentially containing ProcedureRef objects
 * @param space - Indentation (passed to JSON.stringify)
 * @returns JSON string
 */
export function stringifyProcedureJson(value: unknown, space?: number): string {
  const converted = extractTemplateValue(value);
  return JSON.stringify(converted, null, space);
}
