/**
 * Procedure Reference System
 *
 * Enables procedures-as-data: procedures can be passed as inputs to other procedures,
 * composed declaratively via JSON, or imperatively via TypeScript.
 *
 * This module holds the `$proc` form of a program: its keys, its types, the builder, the JSON
 * helpers, the scope that a raw input carries and the raw-input rules. The kernel of coeval runs
 * a program: `program.ts` changes the `$proc` form into a run document (roadmap item M14).
 *
 * Key concepts:
 * - PROCEDURE_SYMBOL: Symbol tag to identify procedure references in JSON/objects
 * - ProcedureRef: A reference to a procedure with pre-bound input
 * - $when: Controls when a procedure reference is executed during hydration
 * - $name: Names the result of a chain step, for `$ref`
 * - $ref: Reads a name of the scope (a chain step, `$last`, `item`, `acc`, `index`, `input`)
 * - $literal: Gives a value without hydration
 * - proc(): Factory function to create procedure references
 *
 * ## Execution Control with $when
 *
 * The `$when` field controls when a procedure reference is executed:
 * - `"$immediate"` (or absent): Execute during hydration (default)
 * - `"$never"`: Never execute during hydration, pass as pure data (with its whole subtree)
 * - `"$parent"`: Defer to parent procedure (pass as data)
 * - `"someName"`: Defer to the runner that gives this name in its `contextStack`
 *   (`dag.traverse` gives "dag.traverse". `client.tryCatch` gives no name: it is control flow,
 *   and it runs its `try` and `catch` operands itself.)
 *
 * A deferred ref is data at every depth: hydration of the input that holds it does not run it.
 * The procedure that receives it runs it later (deep dive CORE-11).
 *
 * ## Raw input
 *
 * A procedure that takes its input raw (control flow, the `runs-refs` and `raw-input` tags) gets
 * the refs of its input unchanged: it runs them itself. Such an input carries the scope of the
 * caller (`withScope`), so nested control flow can read the names of an outer chain.
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
 * JSON key that names the result of a chain step: a later step reads it with `{ $ref: "<name>" }`.
 */
export const PROCEDURE_NAME_KEY: string = "$name";

/**
 * JSON key used to reference outputs from named stages.
 */
export const OUTPUT_REF_KEY: string = "$ref";

/**
 * JSON key of a literal. Hydration gives the value of `{ $literal: value }` and does not look
 * inside it, so a `$proc` or a `$ref` in the value stays data (for example a JSON Schema `$ref`).
 */
export const LITERAL_KEY: string = "$literal";

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
 * Only the own properties are read, so a path such as "a.constructor" gives undefined.
 */
export function getPath(obj: unknown, path: string[]): unknown {
  let value = obj;
  for (const key of path) {
    if (value && typeof value === "object" && Object.hasOwn(value, key)) {
      value = (value as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }
  return value;
}

/**
 * Look up an output reference in a scope and its parents.
 *
 * The first segment is a name: the innermost scope with that name gives the value. `$last` is the
 * last result of the innermost scope that has one. The other segments read fields of the value.
 * `found` is false when no scope has the name. A missing field is `found` with the value undefined.
 */
export function lookupOutputRef(refPath: string, scope: RefScope | undefined): { found: boolean; value?: unknown } {
  const [first, ...rest] = refPath.split(".");
  for (let current = scope; current; current = current.parent) {
    if (first === "$last") {
      if (Object.hasOwn(current, "last")) return { found: true, value: getPath(current.last, rest) };
    } else if (current.outputs.has(first!)) {
      return { found: true, value: getPath(current.outputs.get(first!), rest) };
    }
  }
  return { found: false };
}

/**
 * Resolve an output reference within a scope.
 *
 * @param refPath - The reference path (e.g., "stageName.value" or "$last.value")
 * @param scope - The current scope to resolve within
 * @returns The resolved value, or undefined if not found
 */
export function resolveOutputRef(refPath: string, scope: RefScope): unknown {
  return lookupOutputRef(refPath, scope).value;
}

// =============================================================================
// Scope of a raw input
// =============================================================================

const SCOPE_KEY = Symbol.for("@mark/ref-scope");

/**
 * This function gives a copy of a raw input that carries a scope. A procedure that takes its input
 * raw (control flow) reads the scope with `scopeOf()` and makes it the parent of its own scope.
 * Thus the operands of a nested control-flow procedure can read the names of the outer chain.
 * The scope is a property that is not enumerable: JSON and the transports do not see it.
 */
export function withScope<T>(input: T, scope: RefScope | undefined): T {
  if (!scope || !isPlainObject(input)) return input;
  const copy = { ...input };
  Object.defineProperty(copy, SCOPE_KEY, { value: scope, enumerable: false });
  return copy as T;
}

/** The scope that a raw input carries (see `withScope()`), or undefined. */
export function scopeOf(input: unknown): RefScope | undefined {
  if (typeof input !== "object" || input === null) return undefined;
  return (input as { [SCOPE_KEY]?: RefScope })[SCOPE_KEY];
}

// =============================================================================
// Plain data
// =============================================================================

/** True for a plain object: an object literal, or an object with a null prototype. */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** True for `{ $literal: value }`: a plain object whose only key is `$literal`. */
export function isLiteral(value: unknown): value is { $literal: unknown } {
  if (!isPlainObject(value)) return false;
  const keys = Object.keys(value);
  return keys.length === 1 && keys[0] === LITERAL_KEY;
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

/** The `$name` and `$when` fields of a reference, for a copy in the other form. */
function refFields(ref: { $name?: string | undefined; $when?: ProcedureWhen | undefined }): {
  $name?: string;
  $when?: ProcedureWhen;
} {
  return {
    ...(ref.$name !== undefined ? { $name: ref.$name } : {}),
    ...(ref.$when !== undefined ? { $when: ref.$when } : {}),
  };
}

/**
 * Convert a procedure reference from JSON form to runtime form.
 * The `$name` and `$when` fields stay (deep dive CORE-11: before, they were dropped).
 */
export function fromJson<TInput, TOutput>(
  json: ProcedureRefJson<TInput>
): ProcedureRef<TInput, TOutput> {
  return {
    [PROCEDURE_SYMBOL]: true,
    path: json.$proc,
    input: json.input,
    ...refFields(json),
  } as ProcedureRef<TInput, TOutput>;
}

/**
 * Convert a procedure reference from runtime form to JSON form.
 * The `$name` and `$when` fields stay.
 */
export function toJson<TInput>(ref: ProcedureRef<TInput>): ProcedureRefJson<TInput> {
  return {
    $proc: ref.path,
    input: ref.input,
    ...refFields(ref),
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
  /**
   * Maximum nesting of procedure refs (default: 10). Plain data does not count: only the input
   * of a ref inside the input of another ref adds one level.
   */
  maxDepth?: number | undefined;

  /**
   * Whether sibling refs run at the same time (default: false). With false, the refs run one
   * after the other, from left to right and depth first, so the order of their effects is known.
   */
  parallel?: boolean | undefined;

  /**
   * The context names of the runner. A ref with `$when: "<name>"` runs only when this list has
   * the name. A runner such as `dag.traverse` gives its own name here when it hydrates its operand.
   * (Control flow such as `client.tryCatch` runs its operands itself and gives no name.)
   */
  contextStack?: string[] | undefined;

  /**
   * Scope for resolving output references ($ref). Without a scope, a `$ref` object stays as it
   * is (for example a JSON Schema reference). With a scope, a `$ref` name that no scope has is an error.
   */
  scope?: RefScope | undefined;

  /**
   * This function tells whether the procedure at a path takes its input raw (control flow, the
   * `runs-refs` and `raw-input` tags). Such a procedure gets the refs of its input unchanged and
   * runs them itself. The default knows the core control-flow paths only. See `rawInputRule()`.
   */
  rawInput?: ((path: ProcedurePath) => boolean) | undefined;

  /**
   * This function gets an event each time hydration runs a ref (see `HydrationEvent`). A trace
   * uses it to show a nested call under the call that gets its result. An error of the function
   * does not change the hydration.
   */
  onRef?: ((event: HydrationEvent) => void) | undefined;
}

/**
 * An event of hydration: a procedure ref of the input runs now. Its input is hydrated already,
 * so the events of the refs inside its input came first.
 */
export interface HydrationEvent {
  /** The path of the procedure that runs. */
  readonly path: ProcedurePath;
  /**
   * The ref that runs: the object of the program. For an array of refs that runs as an implicit
   * chain, it is the `client.chain` ref that hydration made.
   */
  readonly ref: AnyProcedureRef;
  /**
   * The ref whose input holds this ref: the call that gets the result. It is undefined when the
   * ref is at the top of the hydrated value. Then the caller of the hydration gets the result:
   * `exec()` gives it to the root call, and a control-flow procedure to its operand call.
   */
  readonly consumer: AnyProcedureRef | undefined;
}

/** The maximum nesting of plain data in an input. A deeper input is an error, not a stack overflow. */
export const MAX_DATA_DEPTH = 1000;

// =============================================================================
// Control-Flow Procedures
// =============================================================================

/**
 * Last path segments of the core control-flow procedures (registered under `["client", ...]`).
 *
 * These procedures MUST receive their operand refs RAW so their handlers can execute
 * them with correct ordering, laziness, short-circuiting, and error scoping. If `exec()`
 * eagerly hydrated their inputs, the operands would run up-front (voiding conditional/
 * tryCatch short-circuiting) and an all-refs array would be hijacked into an implicit
 * chain that clobbers `steps` — the outer handler then throws `steps is not iterable`.
 * See documentation/BUGS-2026-07.md (C2, H2, H3, M35).
 */
export const CONTROL_FLOW_PROCEDURES: ReadonlySet<string> = new Set([
  "chain",
  "parallel",
  "conditional",
  "tryCatch",
  "and",
  "or",
  "map",
  "reduce",
]);

/**
 * Whether a procedure path is one of the core control-flow procedures (`client.chain`,
 * `client.map` and the others). The whole path must match: a user procedure `foo.map` is not
 * control flow (deep dive CORE-5: before, only the last segment was compared).
 */
export function isControlFlowPath(path: ProcedurePath): boolean {
  return path.length === 2 && path[0] === "client" && CONTROL_FLOW_PROCEDURES.has(path[1]!);
}

/**
 * The tag of a procedure that runs procedure refs from its input (for example `dag.traverse`).
 * A server with an `expose` rule lets such a procedure call only the exposed procedures.
 * Hydration gives such a procedure its input raw.
 */
export const RUNS_REFS_TAG = "runs-refs";

/**
 * The tag of a procedure that takes refs as data and does not run them (for example
 * `client.export`, which writes a ref as JSON). Hydration gives such a procedure its input raw.
 */
export const RAW_INPUT_TAG = "raw-input";

/** The fields of a procedure that the rules of this module read. */
interface ProcedureShape {
  path: ProcedurePath;
  metadata?: { tags?: string[] | undefined } | undefined;
  handler?: unknown;
}

const DATA_DRIVEN_HANDLERS = new WeakSet<object>();

/**
 * This function marks a procedure whose behavior comes from data, for example a procedure
 * that `procedure.define` made from an aggregation. The mark is on the handler function: the
 * registry stores a copy of each procedure, but the copy has the same handler. The mark is not
 * in the metadata, because the caller of `procedure.define` gives the metadata.
 */
export function markDataDriven<T extends { handler?: unknown }>(procedure: T): T {
  if (typeof procedure.handler === "function") DATA_DRIVEN_HANDLERS.add(procedure.handler);
  return procedure;
}

/**
 * A data-driven procedure runs procedure refs that come from its input or from data: the
 * control-flow procedures, the procedures with the `runs-refs` tag and the procedures that
 * `procedure.define` made. The caller of such a procedure chooses what it calls.
 */
export function isDataDriven(procedure: ProcedureShape): boolean {
  return (
    isControlFlowPath(procedure.path) ||
    (procedure.metadata?.tags?.includes(RUNS_REFS_TAG) ?? false) ||
    (typeof procedure.handler === "function" && DATA_DRIVEN_HANDLERS.has(procedure.handler))
  );
}

/**
 * A procedure that takes its input raw: the control-flow procedures and the procedures with the
 * `runs-refs` or `raw-input` tag. `exec()` and hydration do not run the refs of such an input.
 * A procedure that `procedure.define` made takes ordinary input: its body is the data-driven part.
 */
export function takesRawInput(procedure: ProcedureShape): boolean {
  const tags = procedure.metadata?.tags;
  return (
    isControlFlowPath(procedure.path) ||
    (tags?.includes(RUNS_REFS_TAG) ?? false) ||
    (tags?.includes(RAW_INPUT_TAG) ?? false)
  );
}

/**
 * The raw-input rule of a registry, for `HydrateOptions.rawInput`. The procedure at the path
 * decides (deep dive CORE-5). A path that the registry does not have uses the control-flow paths.
 */
export function rawInputRule(
  registry: { get(path: ProcedurePath): ProcedureShape | undefined } | undefined
): (path: ProcedurePath) => boolean {
  return (path) => {
    const procedure = registry?.get(path);
    return procedure ? takesRawInput(procedure) : isControlFlowPath(path);
  };
}

// =============================================================================
// Template Extraction
// =============================================================================

/**
 * Extract a JSON template from a procedure reference.
 * Useful for serializing imperative procedure compositions.
 * The `$name` and `$when` fields stay. A `$literal` stays as it is.
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

  if (isLiteral(value)) {
    return value;
  }

  // Convert procedure refs to JSON form (runtime form, or already JSON form)
  if (isAnyProcedureRef(value)) {
    const ref = normalizeRef(value);
    return {
      $proc: ref.path,
      input: extractTemplateValue(ref.input),
      ...refFields(ref),
    };
  }

  // Handle arrays
  if (Array.isArray(value)) {
    return value.map(extractTemplateValue);
  }

  // Handle plain objects
  const obj = value as Record<string, unknown>;
  return Object.fromEntries(Object.entries(obj).map(([key, val]) => [key, extractTemplateValue(val)]));
}

// =============================================================================
// Parse JSON with Procedure Refs
// =============================================================================

/**
 * Parse JSON string and convert $proc objects to runtime ProcedureRef objects.
 * The `$name` and `$when` fields stay. A `$literal` stays as it is.
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

  if (isLiteral(value)) {
    return value;
  }

  // Convert $proc objects to ProcedureRef
  if (isProcedureRefJson(value)) {
    return {
      [PROCEDURE_SYMBOL]: true,
      path: value.$proc,
      input: convertJsonToRefs(value.input),
      ...refFields(value),
    };
  }

  // Handle arrays
  if (Array.isArray(value)) {
    return value.map(convertJsonToRefs);
  }

  // Handle plain objects
  const obj = value as Record<string, unknown>;
  return Object.fromEntries(Object.entries(obj).map(([key, val]) => [key, convertJsonToRefs(val)]));
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
