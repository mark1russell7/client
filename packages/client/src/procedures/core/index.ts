/**
 * Core Language Procedures
 *
 * Foundational procedures for composing and controlling procedure execution.
 * These procedures enable declarative pipelines and control flow.
 *
 * Core procedures:
 * - `chain` - Execute procedures sequentially, passing results through
 * - `parallel` - Execute procedures concurrently
 * - `conditional` - Conditional execution (if/then/else)
 * - `and` - Short-circuit AND (returns first falsy or last result)
 * - `or` - Short-circuit OR (returns first truthy result)
 * - `map` - Map over array with a procedure
 * - `reduce` - Reduce array with a procedure
 * - `identity` - Return input unchanged
 * - `constant` - Return a constant value
 *
 * @example
 * ```typescript
 * import { proc } from "@mark1russell7/client";
 *
 * // Sequential execution
 * const pipeline = proc(["client", "chain"]).input({
 *   steps: [
 *     proc(["git", "add"]).input({ all: true }).ref,
 *     proc(["git", "commit"]).input({ message: "auto" }).ref,
 *     proc(["git", "push"]).input({}).ref,
 *   ],
 * });
 *
 * // Parallel execution
 * const parallel = proc(["client", "parallel"]).input({
 *   tasks: [
 *     proc(["lib", "build"]).input({ path: "pkg1" }).ref,
 *     proc(["lib", "build"]).input({ path: "pkg2" }).ref,
 *   ],
 * });
 *
 * // Conditional
 * const conditional = proc(["client", "conditional"]).input({
 *   condition: proc(["git", "hasChanges"]).input({}).ref,
 *   then: proc(["git", "commit"]).input({ message: "auto" }).ref,
 *   else: proc(["client", "identity"]).input({ message: "no changes" }).ref,
 * });
 * ```
 */

import { defineProcedure, namespace } from "../define.js";
import type { AnyProcedure, Procedure, ProcedurePath } from "../types.js";
import { anySchema } from "./schemas.js";
import { PROCEDURE_REGISTRY } from "../registry.js";

// Re-export for convenience
export { anySchema } from "./schemas.js";

// =============================================================================
// Operands
// =============================================================================

import type { ProcedureContext } from "../types.js";
import {
  isAnyProcedureRef,
  normalizeRef,
  hydrateInput,
  createRefScope,
  isOutputRef,
  lookupOutputRef,
  rawInputRule,
  scopeOf,
  withScope,
  RUNS_REFS_TAG,
  type AnyProcedureRef,
  type RefScope,
} from "../ref.js";

/**
 * The operands of a control-flow procedure arrive raw: the procedure runs them itself, with the
 * same rules as `exec()` (one interpreter, `hydrateInput`). The input of a control-flow procedure
 * carries the scope of its caller (`withScope`), so an operand can read the names of an outer
 * chain, `map` or `reduce` (deep dive CORE-13).
 */

/** The raw-input rule of the caller's registry: the procedure at a path decides (deep dive CORE-5). */
function rawRule(ctx: ProcedureContext): (path: ProcedurePath) => boolean {
  return rawInputRule(ctx.registry ?? PROCEDURE_REGISTRY);
}

/**
 * Without a client, a control-flow procedure cannot run refs. This function gives a value with
 * its known `$ref` values resolved. A name that the scope does not have stays as it is.
 */
function substituteRefs(value: unknown, scope: RefScope): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (isOutputRef(value)) {
    const { found, value: resolved } = lookupOutputRef(value.$ref, scope);
    return found ? resolved : value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => substituteRefs(item, scope));
  }
  if (isAnyProcedureRef(value)) {
    return value;
  }
  return Object.fromEntries(Object.entries(value).map(([key, val]) => [key, substituteRefs(val, scope)]));
}

/**
 * This function gives the value of an operand that is not a ref: it resolves its `$ref` values
 * in `scope` and runs its nested refs, as `exec()` does for an input.
 */
async function hydrateOperand(value: unknown, ctx: ProcedureContext, scope?: RefScope): Promise<unknown> {
  return hydrateInput(value, (path, input) => ctx.client.call(path, input), { scope, rawInput: rawRule(ctx) });
}

/**
 * This function runs an operand ref of a control-flow procedure.
 *
 * It resolves the `$ref` values of the ref's input in `scope`, runs the nested refs of the
 * input and adds `extra` (the parent context, for example `cwd`). Then it calls the procedure.
 * A procedure that takes its input raw (control flow) gets the input unchanged, with the scope:
 * that procedure runs its own operands.
 */
async function callOperand(
  ref: AnyProcedureRef,
  ctx: ProcedureContext,
  options: { scope?: RefScope | undefined; extra?: Record<string, unknown> | undefined } = {},
): Promise<unknown> {
  const normalized = normalizeRef(ref);
  const raw = rawRule(ctx)(normalized.path);
  let input: unknown = raw ? normalized.input : await hydrateOperand(normalized.input, ctx, options.scope);
  const extra = options.extra ?? {};
  if (Object.keys(extra).length > 0) {
    input = { ...(typeof input === "object" && input !== null && !Array.isArray(input) ? input : {}), ...extra };
  }
  if (raw) {
    input = withScope(input, options.scope);
  }
  return ctx.client.call(normalized.path, input);
}

/** This function gives the value of any operand: a ref runs, another value is hydrated. */
async function evaluateOperand(
  value: unknown,
  ctx: ProcedureContext,
  options: { scope?: RefScope | undefined; extra?: Record<string, unknown> | undefined } = {},
): Promise<unknown> {
  if (isAnyProcedureRef(value)) {
    return callOperand(value, ctx, options);
  }
  return hydrateOperand(value, ctx, options.scope);
}

/** The parent context that the control-flow procedures give to their operands. */
function parentContext(input: { cwd?: string | undefined; node?: unknown }): Record<string, unknown> {
  return {
    ...(input.cwd ? { cwd: input.cwd } : {}),
    ...(input.node ? { node: input.node } : {}),
  };
}

/** A child scope of `parent` with the given `$ref` names, for one call of `fn`. */
function scopeWith(values: Record<string, unknown>, parent?: RefScope): RefScope {
  const scope = createRefScope(parent);
  for (const [name, value] of Object.entries(values)) scope.outputs.set(name, value);
  return scope;
}

/** The tags of a control-flow procedure: hydration gives it its input raw. */
function controlFlowTags(...tags: string[]): string[] {
  return ["core", ...tags, RUNS_REFS_TAG];
}

// =============================================================================
// Chain Procedure
// =============================================================================

interface ChainInput {
  /** Procedures to execute in sequence */
  steps: unknown[];
  /** If true, pass each step's output as input to the next step */
  passThrough?: boolean;
  /** Initial input for the first step (when passThrough is true) */
  initialInput?: unknown;
}

interface ChainOutput {
  /** Results from each step */
  results: unknown[];
  /** Final result (last step's output) */
  final: unknown;
}

type ChainProcedure = Procedure<ChainInput, ChainOutput, { description: string; tags: string[] }>;

const chainProcedure: ChainProcedure = defineProcedure({
  path: ["chain"],
  input: anySchema as any,
  output: anySchema as any,
  metadata: {
    description: "Execute procedures sequentially",
    tags: controlFlowTags("control-flow"),
  },
  handler: async (input: ChainInput, ctx?: ProcedureContext): Promise<ChainOutput> => {
    const { steps, ...parentInput } = input;
    if (!Array.isArray(steps)) {
      throw new Error(`client.chain: steps must be an array, got ${steps === null ? "null" : typeof steps}`);
    }
    const results: unknown[] = [];
    // The scope of an outer chain is the parent: its names stay visible here
    const scope = createRefScope(scopeOf(input));

    // Extract context to propagate to steps (e.g., cwd, node)
    const { cwd, node } = parentInput as { cwd?: string; node?: unknown };

    for (const step of steps) {
      let result: unknown;

      if (!ctx?.client) {
        // No client context: the result of a step is its input, with the known $refs resolved
        result = substituteRefs(isAnyProcedureRef(step) ? normalizeRef(step).input : step, scope);
      } else if (isAnyProcedureRef(step)) {
        // Resolve the $refs of the step's input, run its nested refs, add the parent context (cwd, node)
        result = await callOperand(step, ctx, { scope, extra: parentContext({ cwd, node }) });
      } else {
        // A $ref, a $literal, or a value that holds refs
        result = await hydrateOperand(step, ctx, scope);
      }

      // Store named output
      const stepName = isAnyProcedureRef(step) ? normalizeRef(step).$name : undefined;
      if (stepName) {
        scope.outputs.set(stepName, result);
      }

      // Update $last
      scope.last = result;
      results.push(result);
    }

    return {
      results,
      final: results[results.length - 1],
    };
  },
});

// =============================================================================
// Parallel Procedure
// =============================================================================

interface ParallelInput {
  /** Procedures to execute in parallel */
  tasks: unknown[];
  /** Maximum concurrency (default: unlimited) */
  concurrency?: number;
  /** Whether to fail fast on first error (default: false) */
  failFast?: boolean;
}

interface ParallelOutput {
  /** Results from each task (in order) */
  results: unknown[];
  /** Whether all tasks succeeded */
  allSucceeded: boolean;
  /** Errors from failed tasks */
  errors: Array<{ index: number; error: string }>;
}

type ParallelProcedure = Procedure<ParallelInput, ParallelOutput, { description: string; tags: string[] }>;

const parallelProcedure: ParallelProcedure = defineProcedure({
  path: ["parallel"],
  input: anySchema as any,
  output: anySchema as any,
  metadata: {
    description: "Execute procedures in parallel",
    tags: controlFlowTags("control-flow"),
  },
  handler: async (input: ParallelInput, ctx?: ProcedureContext): Promise<ParallelOutput> => {
    const { tasks, concurrency, failFast } = input as ParallelInput & {
      cwd?: string;
      node?: unknown;
    };
    const { cwd, node } = input as { cwd?: string; node?: unknown };
    const scope = scopeOf(input);

    // Operands arrive raw (exec() does not pre-hydrate control-flow procedures). Execute
    // task refs concurrently, honoring `concurrency` and `failFast`, and report per-task
    // errors. Other tasks are values: their refs run. See BUGS-2026-07 M35.
    const runTask = async (task: unknown): Promise<unknown> => {
      if (!ctx?.client) {
        return task;
      }
      return evaluateOperand(task, ctx, { scope, extra: parentContext({ cwd, node }) });
    };

    const results: unknown[] = new Array(tasks.length);
    const errors: Array<{ index: number; error: string }> = [];

    const limit =
      typeof concurrency === "number" && concurrency > 0
        ? Math.min(concurrency, tasks.length)
        : tasks.length;

    let nextIndex = 0;
    let aborted = false;

    const worker = async (): Promise<void> => {
      while (!aborted) {
        const index = nextIndex++;
        if (index >= tasks.length) {
          return;
        }
        try {
          results[index] = await runTask(tasks[index]);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (failFast) {
            aborted = true;
            throw error;
          }
          errors.push({ index, error: message });
          results[index] = undefined;
        }
      }
    };

    const workerCount = Math.max(1, limit);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));

    errors.sort((a, b) => a.index - b.index);

    return {
      results,
      allSucceeded: errors.length === 0,
      errors,
    };
  },
});

// =============================================================================
// Conditional Procedure
// =============================================================================

interface ConditionalInput {
  /** Condition value (truthy/falsy) */
  condition: unknown;
  /** Value/result to use if condition is truthy */
  then: unknown;
  /** Value/result to use if condition is falsy */
  else?: unknown;
}

type ConditionalProcedure = Procedure<ConditionalInput, unknown, { description: string; tags: string[] }>;

const conditionalProcedure: ConditionalProcedure = defineProcedure({
  path: ["conditional"],
  input: anySchema as any,
  output: anySchema as any,
  metadata: {
    description: "Conditional execution (if/then/else)",
    tags: controlFlowTags("control-flow"),
  },
  handler: async (input: ConditionalInput, ctx?: ProcedureContext): Promise<unknown> => {
    const { condition: rawCondition, then: thenValue, else: elseValue, ...parentInput } = input as ConditionalInput & {
      cwd?: string;
      node?: unknown;
    };

    // Extract context to propagate to branches (e.g., cwd, node)
    const { cwd, node } = parentInput;
    const scope = scopeOf(input);

    // Operands arrive raw (exec() does not pre-hydrate control-flow procedures), so the
    // condition runs here, before its truthiness is known. See BUGS-2026-07 H2. A condition
    // that is a $ref reads the scope of the caller.
    const condition: unknown = ctx?.client
      ? await evaluateOperand(rawCondition, ctx, { scope, extra: parentContext({ cwd, node }) })
      : rawCondition;

    // Determine truthiness - check for .value property (from predicates like git.hasChanges)
    let isTruthy: boolean;
    if (condition && typeof condition === "object" && "value" in condition) {
      isTruthy = Boolean((condition as { value: unknown }).value);
    } else {
      isTruthy = Boolean(condition);
    }

    // Select the branch to execute/return
    const selectedBranch = isTruthy ? thenValue : elseValue;

    // Only the selected branch runs. Without a client, the branch is the result as it is.
    if (selectedBranch === undefined || !ctx?.client) {
      return selectedBranch;
    }
    return evaluateOperand(selectedBranch, ctx, { scope, extra: parentContext({ cwd, node }) });
  },
});

// =============================================================================
// Logic Operators (unified with group theory)
// =============================================================================

import {
  notHandler,
  allHandler,
  anyHandler as anyLogicHandler,
  noneHandler,
  andMetadata,
  orMetadata,
  notMetadata,
  allMetadata,
  anyMetadata,
  noneMetadata,
  type LogicMetadata,
} from "./logic.js";

/**
 * The handler of a short-circuit operator (`and`, `or`). It runs the operands in order and stops
 * at the first value for which `stopOn` is true: that value is the result. Otherwise the result
 * is the last value. (Deep dive CORE-1: before, the handler only tested the raw operands, and a
 * ref is always truthy, so no operand ran.)
 */
function shortCircuit(stopOn: (value: unknown) => boolean) {
  return async (input: { values: unknown[]; cwd?: string; node?: unknown }, ctx?: ProcedureContext): Promise<unknown> => {
    const { values } = input;
    if (!Array.isArray(values)) {
      throw new Error(`values must be an array, got ${values === null ? "null" : typeof values}`);
    }
    const scope = scopeOf(input);
    let last: unknown = undefined;
    for (const operand of values) {
      last = ctx?.client ? await evaluateOperand(operand, ctx, { scope, extra: parentContext(input) }) : operand;
      if (stopOn(last)) {
        return last;
      }
    }
    return last;
  };
}

interface AndInput {
  /** Values to AND together (short-circuit) */
  values: unknown[];
}

type AndProcedure = Procedure<AndInput, unknown, LogicMetadata>;

const andProcedure: AndProcedure = defineProcedure({
  path: ["and"],
  input: anySchema as any,
  output: anySchema as any,
  metadata: { ...andMetadata, tags: [...andMetadata.tags, RUNS_REFS_TAG] },
  handler: shortCircuit((value) => !value),
});

interface OrInput {
  /** Values to OR together (short-circuit) */
  values: unknown[];
}

type OrProcedure = Procedure<OrInput, unknown, LogicMetadata>;

const orProcedure: OrProcedure = defineProcedure({
  path: ["or"],
  input: anySchema as any,
  output: anySchema as any,
  metadata: { ...orMetadata, tags: [...orMetadata.tags, RUNS_REFS_TAG] },
  handler: shortCircuit((value) => Boolean(value)),
});

interface NotInput {
  /** Value to negate */
  value: unknown;
}

type NotProcedure = Procedure<NotInput, boolean, LogicMetadata>;

const notProcedure: NotProcedure = defineProcedure({
  path: ["not"],
  input: anySchema as any,
  output: anySchema as any,
  metadata: notMetadata,
  handler: notHandler,
});

// Additional logic operators with boolean results

interface VariadicBoolInput {
  /** Values to evaluate */
  values: unknown[];
}

type AllProcedure = Procedure<VariadicBoolInput, boolean, LogicMetadata>;

const allProcedure: AllProcedure = defineProcedure({
  path: ["all"],
  input: anySchema as any,
  output: anySchema as any,
  metadata: allMetadata,
  handler: allHandler,
});

type AnyProcedureType = Procedure<VariadicBoolInput, boolean, LogicMetadata>;

const anyProcedure: AnyProcedureType = defineProcedure({
  path: ["any"],
  input: anySchema as any,
  output: anySchema as any,
  metadata: anyMetadata,
  handler: anyLogicHandler,
});

type NoneProcedure = Procedure<VariadicBoolInput, boolean, LogicMetadata>;

const noneProcedure: NoneProcedure = defineProcedure({
  path: ["none"],
  input: anySchema as any,
  output: anySchema as any,
  metadata: noneMetadata,
  handler: noneHandler,
});

// =============================================================================
// Map Procedure
// =============================================================================

interface MapInput {
  /** The array to map over. An element (or the whole value) can be a procedure ref: it runs first. */
  items: unknown[];
  /**
   * The procedure ref to run for each item. Its input reads the item as `{ $ref: "item" }`
   * (or the name in `as`) and the position as `{ $ref: "index" }`. Without `fn`, the result
   * is the items, with their refs run.
   */
  fn?: unknown;
  /** The `$ref` name of the item in `fn`. The default is "item". */
  as?: string;
  /** Results from mapping (items should be procedure refs that get hydrated) */
  results?: unknown[];
}

interface MapOutput {
  /** Mapped results */
  results: unknown[];
}

type MapProcedure = Procedure<MapInput, MapOutput, { description: string; tags: string[] }>;

/**
 * This function runs the refs of an `items` operand. It runs each element separately and in
 * order, so an array whose elements are all refs stays an array (hydration makes such an array
 * a chain).
 */
async function hydrateItems(items: unknown, ctx: ProcedureContext | undefined, scope: RefScope | undefined): Promise<unknown[]> {
  if (!ctx?.client) return Array.isArray(items) ? items : [];
  let value: unknown;
  if (Array.isArray(items)) {
    const results: unknown[] = [];
    for (const item of items) results.push(await hydrateOperand(item, ctx, scope));
    value = results;
  } else {
    value = await hydrateOperand(items, ctx, scope);
  }
  if (!Array.isArray(value)) {
    throw new Error(`items must be an array, got ${value === null ? "null" : typeof value}`);
  }
  return value;
}

const mapProcedure: MapProcedure = defineProcedure({
  path: ["map"],
  input: anySchema as any,
  output: anySchema as any,
  metadata: {
    description: "Map over an array: run fn for each item (the item is { $ref: \"item\" })",
    tags: controlFlowTags("collection"),
  },
  handler: async (input: MapInput, ctx?: ProcedureContext): Promise<MapOutput> => {
    // map is a control-flow procedure: its operands arrive raw, and it runs them here.
    // Before, the handler only returned the raw items, so their refs never ran and no
    // function was applied.
    const outer = scopeOf(input);
    const items = await hydrateItems(input.items, ctx, outer);
    if (!isAnyProcedureRef(input.fn) || !ctx?.client) {
      return { results: items };
    }
    const results: unknown[] = [];
    for (const [index, item] of items.entries()) {
      results.push(await callOperand(input.fn, ctx, { scope: scopeWith({ [input.as ?? "item"]: item, index }, outer) }));
    }
    return { results };
  },
});

// =============================================================================
// Reduce Procedure
// =============================================================================

interface ReduceInput {
  /** The array to reduce. An element (or the whole value) can be a procedure ref: it runs first. */
  items: unknown[];
  /** Initial accumulator value */
  initial: unknown;
  /**
   * The procedure ref to run for each item. Its input reads the accumulator as `{ $ref: "acc" }`,
   * the item as `{ $ref: "item" }` and the position as `{ $ref: "index" }`. Its result is the
   * next accumulator.
   */
  fn?: unknown;
  /** Reducer results (computed externally via procedure refs) */
  accumulated?: unknown;
}

type ReduceProcedure = Procedure<ReduceInput, unknown, { description: string; tags: string[] }>;

const reduceProcedure: ReduceProcedure = defineProcedure({
  path: ["reduce"],
  input: anySchema as any,
  output: anySchema as any,
  metadata: {
    description: "Reduce an array: run fn for each item (acc and item are $refs)",
    tags: controlFlowTags("collection"),
  },
  handler: async (input: ReduceInput, ctx?: ProcedureContext): Promise<unknown> => {
    if (!isAnyProcedureRef(input.fn) || !ctx?.client) {
      // Without fn, the result is the accumulated value
      return input.accumulated ?? input.initial;
    }
    const outer = scopeOf(input);
    const items = await hydrateItems(input.items, ctx, outer);
    let acc = await hydrateOperand(input.initial, ctx, outer);
    for (const [index, item] of items.entries()) {
      acc = await callOperand(input.fn, ctx, { scope: scopeWith({ acc, item, index }, outer) });
    }
    return acc;
  },
});

// =============================================================================
// Identity Procedure
// =============================================================================

interface IdentityInput {
  /** Value to return unchanged */
  value: unknown;
}

type IdentityProcedure = Procedure<IdentityInput, unknown, { description: string; tags: string[] }>;

const identityProcedure: IdentityProcedure = defineProcedure({
  path: ["identity"],
  input: anySchema as any,
  output: anySchema as any,
  metadata: {
    description: "Return input unchanged",
    tags: ["core", "utility"],
  },
  handler: async (input: IdentityInput): Promise<unknown> => {
    return input.value;
  },
});

// =============================================================================
// Constant Procedure
// =============================================================================

interface ConstantInput {
  /** Constant value to return */
  value: unknown;
}

type ConstantProcedure = Procedure<ConstantInput, unknown, { description: string; tags: string[] }>;

const constantProcedure: ConstantProcedure = defineProcedure({
  path: ["constant"],
  input: anySchema as any,
  output: anySchema as any,
  metadata: {
    description: "Return a constant value",
    tags: ["core", "utility"],
  },
  handler: async (input: ConstantInput): Promise<unknown> => {
    return input.value;
  },
});

// =============================================================================
// Throw Procedure
// =============================================================================

interface ThrowInput {
  /** Error message */
  message: string;
  /** Error code */
  code?: string;
}

type ThrowProcedure = Procedure<ThrowInput, never, { description: string; tags: string[] }>;

const throwProcedure: ThrowProcedure = defineProcedure({
  path: ["throw"],
  input: anySchema as any,
  output: anySchema as any,
  metadata: {
    description: "Throw an error",
    tags: ["core", "control-flow"],
  },
  handler: async (input: ThrowInput): Promise<never> => {
    const error = new Error(input.message);
    if (input.code) {
      (error as any).code = input.code;
    }
    throw error;
  },
});

// =============================================================================
// TryCatch Procedure
// =============================================================================

interface TryCatchInput {
  /** Value to try (should be a procedure ref) */
  try: unknown;
  /** Value to use on error (a procedure ref or a value). It can read the message as `{ $ref: "error" }`. */
  catch: unknown;
}

interface TryCatchOutput {
  /** Whether the try succeeded */
  success: boolean;
  /** Result value */
  value: unknown;
  /** Error if failed */
  error?: string;
}

type TryCatchProcedure = Procedure<TryCatchInput, TryCatchOutput, { description: string; tags: string[] }>;

const tryCatchProcedure: TryCatchProcedure = defineProcedure({
  path: ["tryCatch"],
  input: anySchema as any,
  output: anySchema as any,
  metadata: {
    description: "Try/catch wrapper for procedures",
    tags: controlFlowTags("control-flow"),
  },
  handler: async (input: TryCatchInput, ctx?: ProcedureContext): Promise<TryCatchOutput> => {
    const { try: tryValue, catch: catchValue } = input;

    // Without a client, nothing can run: `try` is the value
    if (!ctx?.client) {
      return { success: true, value: tryValue };
    }

    // Operands arrive raw (exec() does not pre-hydrate control-flow procedures), so the
    // `try` operand runs HERE inside a real JS try/catch. If it throws, the `catch` operand
    // runs (or its value is the result). See BUGS-2026-07 H3.
    const scope = scopeOf(input);
    try {
      const value = await evaluateOperand(tryValue, ctx, { scope });
      return { success: true, value };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const value = await evaluateOperand(catchValue, ctx, { scope: scopeWith({ error: message }, scope) });
      return { success: false, value, error: message };
    }
  },
});

// =============================================================================
// Export Core Procedures
// =============================================================================

/**
 * All core language procedures namespaced under "client".
 */
export const coreProcedures: AnyProcedure[] = namespace(["client"], [
  chainProcedure as AnyProcedure,
  parallelProcedure as AnyProcedure,
  conditionalProcedure as AnyProcedure,
  // Logic operators (unified with group theory)
  andProcedure as AnyProcedure,
  orProcedure as AnyProcedure,
  notProcedure as AnyProcedure,
  allProcedure as AnyProcedure,
  anyProcedure as AnyProcedure,
  noneProcedure as AnyProcedure,
  // Collection operators
  mapProcedure as AnyProcedure,
  reduceProcedure as AnyProcedure,
  // Utility operators
  identityProcedure as AnyProcedure,
  constantProcedure as AnyProcedure,
  throwProcedure as AnyProcedure,
  tryCatchProcedure as AnyProcedure,
]);

/**
 * Core procedures module for registration.
 */
export const coreModule: { name: string; procedures: AnyProcedure[] } = {
  name: "client-core",
  procedures: coreProcedures,
};

// Re-export individual procedures for direct access
export {
  chainProcedure,
  parallelProcedure,
  conditionalProcedure,
  // Logic operators
  andProcedure,
  orProcedure,
  notProcedure,
  allProcedure,
  anyProcedure,
  noneProcedure,
  // Collection operators
  mapProcedure,
  reduceProcedure,
  // Utility operators
  identityProcedure,
  constantProcedure,
  throwProcedure,
  tryCatchProcedure,
};

// Re-export schemas, result types, and logic utilities
export * from "./schemas.js";
export * from "./results.js";
export * from "./logic.js";

// =============================================================================
// Import additional procedure modules
// =============================================================================

export * from "./math.js";
export * from "./comparison.js";
export * from "./string.js";
export * from "./type.js";
export * from "./object.js";
export * from "./array.js";
export * from "./meta.js";

// =============================================================================
// Combined exports for all core procedures
// =============================================================================

import { mathProcedures, mathModule } from "./math.js";
import { comparisonProcedures, comparisonModule } from "./comparison.js";
import { stringProcedures, stringModule } from "./string.js";
import { typeProcedures, typeModule } from "./type.js";
import { objectProcedures, objectModule } from "./object.js";
import { arrayProcedures, arrayModule } from "./array.js";
import { metaProcedures, metaModule } from "./meta.js";

/**
 * All core procedures combined (control flow + math + comparison + string + type + object + array + meta).
 */
export const allCoreProcedures: AnyProcedure[] = [
  ...coreProcedures,
  ...mathProcedures,
  ...comparisonProcedures,
  ...stringProcedures,
  ...typeProcedures,
  ...objectProcedures,
  ...arrayProcedures,
  ...metaProcedures,
];

/**
 * All core modules combined.
 */
export const allCoreModules: Array<{ name: string; procedures: AnyProcedure[] }> = [
  coreModule,
  mathModule,
  comparisonModule,
  stringModule,
  typeModule,
  objectModule,
  arrayModule,
  metaModule,
];
