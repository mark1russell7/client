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
 * import { proc } from "@procedures/client";
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

import { PURE_EFFECTS, withEffects } from "../effects.js";
import { z } from "zod";
import { anyOutput, booleanOutput } from "./outputs.js";
import { defineProcedure, namespace } from "../define.js";
import type { AnyProcedure, Procedure, ProcedureContext } from "../types.js";

// Re-export for convenience
export { anySchema } from "./schemas.js";

// =============================================================================
// Input schemas of the control-flow procedures (roadmap 2.1)
// =============================================================================
// The operands are programs: a call ({ $proc, input }), a list of calls, or a plain value. So
// each operand is any JSON (z.unknown()), and each object is loose: a runner adds fields such as
// `cwd` and `node`, which the operands get. The schemas name the fields for the MCP tool list and
// the help of mark.

// An operand is optional: in zod 4 a z.unknown() key is required, and JSON drops a key whose
// value is undefined (over HTTP, { value: undefined } arrives as {})
const operand = (description: string) => z.unknown().optional().describe(description);

const ChainInputSchema = z.looseObject({
  steps: z.array(z.unknown()).describe("The steps, in order: calls or values. A step can read an earlier result as { $ref: name } or { $ref: \"$last\" }."),
  passThrough: z.boolean().optional().describe("Give each step that has no input the result of the step before"),
  initialInput: operand("The input of the first step when passThrough is true"),
});
const ParallelInputSchema = z.looseObject({
  tasks: z.array(z.unknown()).describe("The tasks to run at the same time: calls or values"),
  concurrency: z.number().int().min(1).optional().describe("The most tasks that run at the same time (default: all)"),
  failFast: z.boolean().optional().describe("Stop at the first error (default: false)"),
});
const ConditionalInputSchema = z.looseObject({
  condition: operand("The condition: a value or a call. A truthy result runs then, a falsy one runs else."),
  then: operand("The program for a truthy condition"),
  else: operand("The program for a falsy condition (default: undefined)"),
});
const LogicInputSchema = z.looseObject({
  values: z.array(z.unknown()).describe("The operands, in order: values or calls. The evaluation stops at the deciding value."),
});
// not, all, any and none take values (roadmap R29, the owner's choice). They do not run a call in
// their operands: a call is an object, thus truthy. In a program, the calls of their input run
// first, as for each procedure that is not control flow. client.and and client.or run calls.
const NotInputSchema = z.looseObject({
  value: operand("The value to negate. This procedure does not run a call: a call is an object, thus truthy."),
});
const VariadicBoolInputSchema = z.looseObject({
  values: z
    .array(z.unknown())
    .describe("The values to evaluate. This procedure does not run calls: a call is an object, thus truthy. client.and and client.or run calls."),
});
const MapInputSchema = z.looseObject({
  items: operand("The array, or a call that gives it"),
  fn: operand("The call to run for each item. It reads the item as { $ref: \"item\" } (or the name in as) and the position as { $ref: \"index\" }."),
  as: z.string().optional().describe("The $ref name of the item in fn (default: item)"),
  results: operand("Results that were computed before (old form)"),
});
const ReduceInputSchema = z.looseObject({
  items: operand("The array, or a call that gives it"),
  initial: operand("The first accumulator value"),
  fn: operand("The call to run for each item. It reads { $ref: \"acc\" }, { $ref: \"item\" } and { $ref: \"index\" }; its result is the next accumulator."),
  accumulated: operand("A result that was computed before (old form)"),
});
const ValueInputSchema = z.looseObject({ value: operand("The value") });
const ThrowInputSchema = z.looseObject({
  message: z.string().describe("The error message"),
  code: z.string().optional().describe("The error code"),
});
const TryCatchInputSchema = z.looseObject({
  try: operand("The program to try"),
  catch: operand("The program or value for an error. It reads the message as { $ref: \"error\" }."),
});


// =============================================================================
// Operands
// =============================================================================

import {
  isAnyProcedureRef,
  normalizeRef,
  createRefScope,
  scopeOf,
  getRefWhen,
  WHEN_NEVER,
  RUNS_REFS_TAG,
  type AnyProcedureRef,
} from "../ref.js";
import { substituteRefs, runControlFlow, controlFlowTags } from "./operands.js";

// =============================================================================
// Chain Procedure
// =============================================================================

interface ChainInput {
  /** Procedures to execute in sequence */
  steps: unknown[];
  /**
   * When true, a step that is a call with no `input` gets the result of the step before as its
   * input (the first step gets `initialInput`). A step with its own input keeps it, and can read
   * the result of the step before as `{ $ref: "$last" }`.
   */
  passThrough?: boolean;
  /** The input of the first step when `passThrough` is true. Its calls run first. */
  initialInput?: unknown;
}

interface ChainOutput {
  /** Results from each step */
  results: unknown[];
  /** Final result (last step's output) */
  final: unknown;
}

const ChainOutputSchema = z.looseObject({
  results: z.array(z.unknown()).describe("The result of each step, in order"),
  final: z.unknown().optional().describe("The result of the last step"),
}) as z.ZodType<ChainOutput>;

type ChainProcedure = Procedure<ChainInput, ChainOutput, { description: string; tags: string[] }>;

const chainProcedure: ChainProcedure = defineProcedure({
  path: ["chain"],
  input: ChainInputSchema as any,
  output: ChainOutputSchema,
  metadata: {
    description: "Execute procedures sequentially",
    tags: controlFlowTags("control-flow"),
  },
  handler: async (input: ChainInput, ctx?: ProcedureContext): Promise<ChainOutput> => {
    const { steps } = input;
    if (!Array.isArray(steps)) {
      throw new Error(`client.chain: steps must be an array, got ${steps === null ? "null" : typeof steps}`);
    }
    if (ctx?.client) {
      // The runner of the kind client.chain runs the steps on the kernel (program.ts). A step reads
      // the names of the earlier steps, $last and the names of the caller (the scope of the input).
      return (await runControlFlow("chain", input, ctx)) as ChainOutput;
    }
    // No client context: the result of a step is its input, with the known $refs resolved
    const scope = createRefScope(scopeOf(input));
    const results: unknown[] = [];
    for (const step of steps) {
      const call = isAnyProcedureRef(step) ? normalizeRef(step) : undefined;
      // A $never step is data, like a $never ref anywhere (docs review DOC-1)
      const result = call && getRefWhen(step as AnyProcedureRef) === WHEN_NEVER ? step : substituteRefs(call ? call.input : step, scope);
      if (call?.$name) scope.outputs.set(call.$name, result);
      scope.last = result;
      results.push(result);
    }
    return { results, final: results[results.length - 1] };
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
  /**
   * Whether to fail fast on first error (default: false).
   *
   * After the first error, the other tasks stop at their next wait, and their later calls do not
   * start (D26). Before 0.26.0, they went on in the background to their end. When those calls
   * must start, wait for the tasks yourself, or do not use `failFast`.
   */
  failFast?: boolean;
}

interface ParallelOutput {
  /** Results from each task (in order) */
  results: unknown[];
  /** Whether all tasks succeeded */
  allSucceeded: boolean;
  /**
   * Errors from failed tasks.
   *
   * The error text of a task that throws `undefined` is the reason of the kernel (D26). Before
   * 0.26.0, it was `"undefined"`.
   */
  errors: Array<{ index: number; error: string }>;
}

const ParallelOutputSchema = z.looseObject({
  results: z.array(z.unknown()).describe("The result of each task, in the order of the tasks"),
  allSucceeded: z.boolean().describe("True when no task failed"),
  errors: z
    .array(
      z.looseObject({
        index: z.number().describe("The index of the task that failed"),
        error: z.string().describe("The error message of the task"),
      })
    )
    .describe("The failed tasks"),
}) as z.ZodType<ParallelOutput>;

type ParallelProcedure = Procedure<ParallelInput, ParallelOutput, { description: string; tags: string[] }>;

const parallelProcedure: ParallelProcedure = defineProcedure({
  path: ["parallel"],
  input: ParallelInputSchema as any,
  output: ParallelOutputSchema,
  metadata: {
    description: "Execute procedures in parallel",
    tags: controlFlowTags("control-flow"),
  },
  handler: async (input: ParallelInput, ctx?: ProcedureContext): Promise<ParallelOutput> => {
    // Operands arrive raw (exec() does not pre-hydrate control-flow procedures). The runner of
    // the kind client.parallel runs the tasks at the same time on the kernel, with `concurrency`
    // and `failFast`, and reports the error of each task. See BUGS-2026-07 M35.
    if (ctx?.client) return (await runControlFlow("parallel", input, ctx)) as ParallelOutput;
    // Without a client, nothing can run: each task is its value
    return { results: Array.from(input.tasks), allSucceeded: true, errors: [] };
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
  input: ConditionalInputSchema as any,
  output: anyOutput("The value of the chosen branch: its shape depends on the program"),
  metadata: {
    description: "Conditional execution (if/then/else)",
    tags: controlFlowTags("control-flow"),
  },
  handler: async (input: ConditionalInput, ctx?: ProcedureContext): Promise<unknown> => {
    // Operands arrive raw (exec() does not pre-hydrate control-flow procedures), so the
    // condition runs in the runner of the kind client.conditional, before its truthiness is
    // known, and only the selected branch runs. See BUGS-2026-07 H2.
    if (ctx?.client) return runControlFlow("conditional", input, ctx);
    // Without a client, the branch is the result as it is. The `value` field of an object decides
    // (a predicate such as git.hasChanges gives { value }).
    const { condition } = input;
    const truthy = condition && typeof condition === "object" && "value" in condition ? Boolean((condition as { value: unknown }).value) : Boolean(condition);
    return truthy ? input.then : input.else;
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
function shortCircuit(name: "and" | "or", stopOn: (value: unknown) => boolean) {
  return async (input: { values: unknown[]; cwd?: string; node?: unknown }, ctx?: ProcedureContext): Promise<unknown> => {
    const { values } = input;
    if (!Array.isArray(values)) {
      throw new Error(`values must be an array, got ${values === null ? "null" : typeof values}`);
    }
    // The runner of the kind client.and or client.or runs the operands in order on the kernel
    if (ctx?.client) return runControlFlow(name, input, ctx);
    let last: unknown = undefined;
    for (const operand of values) {
      last = operand;
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
  input: LogicInputSchema as any,
  output: anyOutput("The first falsy operand value, or the last value"),
  metadata: { ...andMetadata, tags: [...andMetadata.tags, RUNS_REFS_TAG] },
  handler: shortCircuit("and", (value) => !value),
});

interface OrInput {
  /** Values to OR together (short-circuit) */
  values: unknown[];
}

type OrProcedure = Procedure<OrInput, unknown, LogicMetadata>;

const orProcedure: OrProcedure = defineProcedure({
  path: ["or"],
  input: LogicInputSchema as any,
  output: anyOutput("The first truthy operand value, or the last value"),
  metadata: { ...orMetadata, tags: [...orMetadata.tags, RUNS_REFS_TAG] },
  handler: shortCircuit("or", (value) => Boolean(value)),
});

interface NotInput {
  /** Value to negate */
  value: unknown;
}

type NotProcedure = Procedure<NotInput, boolean, LogicMetadata>;

const notProcedure: NotProcedure = defineProcedure({
  path: ["not"],
  input: NotInputSchema as any,
  output: booleanOutput("The negated truth value"),
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
  input: VariadicBoolInputSchema as any,
  output: booleanOutput("True when every value is truthy"),
  metadata: allMetadata,
  handler: allHandler,
});

type AnyProcedureType = Procedure<VariadicBoolInput, boolean, LogicMetadata>;

const anyProcedure: AnyProcedureType = defineProcedure({
  path: ["any"],
  input: VariadicBoolInputSchema as any,
  output: booleanOutput("True when one value is truthy"),
  metadata: anyMetadata,
  handler: anyLogicHandler,
});

type NoneProcedure = Procedure<VariadicBoolInput, boolean, LogicMetadata>;

const noneProcedure: NoneProcedure = defineProcedure({
  path: ["none"],
  input: VariadicBoolInputSchema as any,
  output: booleanOutput("True when no value is truthy"),
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
  /** The results of the map. Each item is a procedure ref that the map hydrates. */
  results?: unknown[];
}

interface MapOutput {
  /** Mapped results */
  results: unknown[];
}

const MapOutputSchema = z.looseObject({
  results: z.array(z.unknown()).describe("The result of fn for each item, in order"),
}) as z.ZodType<MapOutput>;

type MapProcedure = Procedure<MapInput, MapOutput, { description: string; tags: string[] }>;

const mapProcedure: MapProcedure = defineProcedure({
  path: ["map"],
  input: MapInputSchema as any,
  output: MapOutputSchema,
  metadata: {
    description: "Map over an array: run fn for each item (the item is { $ref: \"item\" })",
    tags: controlFlowTags("collection"),
  },
  handler: async (input: MapInput, ctx?: ProcedureContext): Promise<MapOutput> => {
    // map is a control-flow procedure: its operands arrive raw, and the runner of the kind
    // client.map runs them on the kernel. Before, the handler only returned the raw items, so
    // their refs never ran and no function was applied.
    if (input.fn !== undefined && !isAnyProcedureRef(input.fn)) {
      // Before, a fn that was not a call was ignored without a word (roadmap R4)
      throw new Error("client.map: fn must be one call ({ $proc, input }), or absent");
    }
    if (ctx?.client) return (await runControlFlow("map", input, ctx)) as MapOutput;
    return { results: Array.isArray(input.items) ? input.items : [] };
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
  input: ReduceInputSchema as any,
  output: anyOutput("The last accumulator: its shape depends on the program"),
  metadata: {
    description: "Reduce an array: run fn for each item (acc and item are $refs)",
    tags: controlFlowTags("collection"),
  },
  handler: async (input: ReduceInput, ctx?: ProcedureContext): Promise<unknown> => {
    if (input.fn !== undefined && !isAnyProcedureRef(input.fn)) {
      // Before, a fn that was not a call was ignored without a word (roadmap R4)
      throw new Error("client.reduce: fn must be one call ({ $proc, input }), or absent");
    }
    if (!ctx?.client) {
      return input.accumulated ?? input.initial;
    }
    // The runner of the kind client.reduce runs the operands on the kernel. Without fn, the
    // result is the accumulated value, hydrated like any operand. (Docs review DOC-4: before, a
    // call in initial did not run, while map without fn hydrated its items.)
    return runControlFlow("reduce", input, ctx);
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
  input: ValueInputSchema as any,
  output: anyOutput("The input value, unchanged"),
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
  input: ValueInputSchema as any,
  output: anyOutput("The constant value"),
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
  input: ThrowInputSchema as any,
  output: z.never().describe("client.throw never gives a value: it throws"),
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
  /** The value to try: a procedure ref. */
  try: unknown;
  /** Value to use on error (a procedure ref or a value). It can read the message as `{ $ref: "error" }`. */
  catch: unknown;
}

interface TryCatchOutput {
  /** Whether the try succeeded */
  success: boolean;
  /** Result value */
  value: unknown;
  /**
   * Error if failed.
   *
   * The error text of a `try` that throws `undefined` is the reason of the kernel (D26). Before
   * 0.26.0, it was `"undefined"`.
   */
  error?: string;
}

const TryCatchOutputSchema = z.looseObject({
  success: z.boolean().describe("True when the try operand did not throw"),
  value: z.unknown().optional().describe("The value of the try operand, or of the catch operand after an error"),
  error: z.string().optional().describe("The error message of the try operand"),
}) as z.ZodType<TryCatchOutput>;

type TryCatchProcedure = Procedure<TryCatchInput, TryCatchOutput, { description: string; tags: string[] }>;

const tryCatchProcedure: TryCatchProcedure = defineProcedure({
  path: ["tryCatch"],
  input: TryCatchInputSchema as any,
  output: TryCatchOutputSchema,
  metadata: {
    description: "Try/catch wrapper for procedures",
    tags: controlFlowTags("control-flow"),
  },
  handler: async (input: TryCatchInput, ctx?: ProcedureContext): Promise<TryCatchOutput> => {
    // Without a client, nothing can run: `try` is the value
    if (!ctx?.client) {
      return { success: true, value: input.try };
    }
    // Operands arrive raw (exec() does not pre-hydrate control-flow procedures), so the runner of
    // the kind client.tryCatch runs the `try` operand. If it fails, the `catch` operand runs with
    // the name `error`, and its value is the result. See BUGS-2026-07 H3.
    return (await runControlFlow("tryCatch", input, ctx)) as TryCatchOutput;
  },
});

// =============================================================================
// Export Core Procedures
// =============================================================================

/**
 * All core language procedures namespaced under "client".
 */
// Control flow and the operators: no effects of their own. The admission examines each nested
// call of a data-driven procedure (CAPABILITIES-2026-10).
export const coreProcedures: AnyProcedure[] = namespace(["client"], withEffects(PURE_EFFECTS, [
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
]));

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
