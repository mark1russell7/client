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

// =============================================================================
// Procedure Reference Symbol
// =============================================================================

/**
 * Symbol used to tag objects as procedure references.
 * This allows procedure references to be identified during input hydration.
 */
export const PROCEDURE_SYMBOL: symbol = Symbol.for("@mark/procedure");

/**
 * JSON key used to identify procedure references in serialized form.
 * When parsing JSON, objects with this key are treated as procedure refs.
 */
export const PROCEDURE_JSON_KEY: string = "$proc";

// =============================================================================
// Procedure Reference Types
// =============================================================================

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

// =============================================================================
// Procedure Reference Builder
// =============================================================================

/**
 * Builder for creating procedure references with a fluent API.
 */
export class ProcedureRefBuilder<TInput = unknown, TOutput = unknown> {
  private _path: ProcedurePath;
  private _input: TInput = {} as TInput;

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
   * Build the procedure reference object.
   */
  build(): ProcedureRef<TInput, TOutput> {
    return {
      [PROCEDURE_SYMBOL]: true,
      path: this._path,
      input: this._input,
    } as ProcedureRef<TInput, TOutput>;
  }

  /**
   * Convert to JSON-serializable form.
   */
  toJson(): ProcedureRefJson<TInput> {
    return {
      $proc: this._path,
      input: this._input,
    };
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
export async function hydrateInput<T>(
  input: T,
  executor: RefExecutor,
  options: HydrateOptions = {}
): Promise<T> {
  const { maxDepth = 10 } = options;
  return hydrateValue(input, executor, 0, maxDepth);
}

/**
 * Internal recursive hydration function.
 */
async function hydrateValue<T>(
  value: T,
  executor: RefExecutor,
  depth: number,
  maxDepth: number
): Promise<T> {
  // Depth check
  if (depth > maxDepth) {
    throw new Error(`Hydration depth exceeded maximum of ${maxDepth}`);
  }

  // Handle null/undefined/primitives
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value !== "object") {
    return value;
  }

  // Check if this is a procedure reference
  if (isAnyProcedureRef(value)) {
    const ref = normalizeRef(value);

    // First, hydrate the input of the procedure reference itself
    const hydratedInput = await hydrateValue(ref.input, executor, depth + 1, maxDepth);

    // Then execute the procedure with hydrated input
    const result = await executor(ref.path, hydratedInput);

    return result as T;
  }

  // Handle arrays
  if (Array.isArray(value)) {
    const hydrated = await Promise.all(
      value.map((item) => hydrateValue(item, executor, depth + 1, maxDepth))
    );
    return hydrated as T;
  }

  // Handle plain objects
  const obj = value as Record<string, unknown>;
  const entries = Object.entries(obj);
  const hydratedEntries = await Promise.all(
    entries.map(async ([key, val]) => {
      const hydratedVal = await hydrateValue(val, executor, depth + 1, maxDepth);
      return [key, hydratedVal] as const;
    })
  );

  return Object.fromEntries(hydratedEntries) as T;
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
