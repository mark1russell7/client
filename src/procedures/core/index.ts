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
import type { AnyProcedure, Procedure } from "../types.js";
import { anySchema } from "./schemas.js";

// Re-export for convenience
export { anySchema } from "./schemas.js";

// =============================================================================
// Chain Procedure
// =============================================================================

import type { ProcedureContext } from "../types.js";
import {
  isAnyProcedureRef,
  normalizeRef,
  createRefScope,
  isOutputRef,
  resolveOutputRef,
  type RefScope,
  type ProcedureRefJson,
} from "../ref.js";

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

/**
 * Resolve any $ref values in an object using the given scope.
 */
function resolveRefs(value: unknown, scope: RefScope): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value !== "object") {
    return value;
  }

  // Handle $ref
  if (isOutputRef(value)) {
    return resolveOutputRef(value.$ref, scope);
  }

  // Handle arrays
  if (Array.isArray(value)) {
    return value.map((item) => resolveRefs(item, scope));
  }

  // Handle plain objects (but not procedure refs - those should be executed)
  if (!isAnyProcedureRef(value)) {
    const obj = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj)) {
      result[key] = resolveRefs(val, scope);
    }
    return result;
  }

  return value;
}

const chainProcedure: ChainProcedure = defineProcedure({
  path: ["chain"],
  input: anySchema as any,
  output: anySchema as any,
  metadata: {
    description: "Execute procedures sequentially",
    tags: ["core", "control-flow"],
  },
  handler: async (input: ChainInput, ctx?: ProcedureContext): Promise<ChainOutput> => {
    const { steps, ...parentInput } = input;
    const results: unknown[] = [];
    const scope = createRefScope();

    // Extract context to propagate to steps (e.g., cwd, node)
    const { cwd, node } = parentInput as { cwd?: string; node?: unknown };

    for (const step of steps) {
      let result: unknown;

      if (isAnyProcedureRef(step)) {
        // This is a procedure reference - execute it
        const normalized = normalizeRef(step);
        const stepName = (step as ProcedureRefJson).$name;

        // Resolve any $refs in the step's input
        const resolvedInput = resolveRefs(normalized.input, scope);

        // Merge parent context (cwd, node) with step input
        const stepInput = {
          ...(typeof resolvedInput === "object" && resolvedInput !== null ? resolvedInput : {}),
          ...(cwd ? { cwd } : {}),
          ...(node ? { node } : {}),
        };

        // Execute the procedure
        if (ctx?.client) {
          result = await ctx.client.call(normalized.path, stepInput);
        } else {
          // No client context - just use the resolved input as result
          result = resolvedInput;
        }

        // Store named output
        if (stepName) {
          scope.outputs.set(stepName, result);
        }
      } else if (isOutputRef(step)) {
        // This is an output reference - resolve it
        result = resolveOutputRef(step.$ref, scope);
      } else {
        // Raw value - resolve any nested $refs and use directly
        result = resolveRefs(step, scope);
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
    tags: ["core", "control-flow"],
  },
  handler: async (input: ParallelInput): Promise<ParallelOutput> => {
    const { tasks } = input;

    // Tasks should already be hydrated by exec(), so they're just values
    // If you want true parallel execution, the caller should use parallel refs
    // that get hydrated concurrently

    // For now, tasks are already resolved (hydration happened)
    const results = tasks;
    const errors: Array<{ index: number; error: string }> = [];

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
    tags: ["core", "control-flow"],
  },
  handler: async (input: ConditionalInput, ctx?: ProcedureContext): Promise<unknown> => {
    const { condition, then: thenValue, else: elseValue, ...parentInput } = input as ConditionalInput & {
      cwd?: string;
      node?: unknown;
    };

    // Extract context to propagate to branches (e.g., cwd, node)
    const { cwd, node } = parentInput;

    // Determine truthiness - check for .value property (from predicates like git.hasChanges)
    let isTruthy: boolean;
    if (condition && typeof condition === "object" && "value" in condition) {
      isTruthy = Boolean((condition as { value: unknown }).value);
    } else {
      isTruthy = Boolean(condition);
    }

    // Select the branch to execute/return
    const selectedBranch = isTruthy ? thenValue : elseValue;

    // If the branch is a procedure ref, execute it
    if (selectedBranch && isAnyProcedureRef(selectedBranch) && ctx?.client) {
      const normalized = normalizeRef(selectedBranch);
      // Merge parent context (cwd, node) with branch input
      const branchInput = {
        ...(typeof normalized.input === "object" && normalized.input !== null ? normalized.input : {}),
        ...(cwd ? { cwd } : {}),
        ...(node ? { node } : {}),
      };
      return ctx.client.call(normalized.path, branchInput);
    }

    return selectedBranch;
  },
});

// =============================================================================
// Logic Operators (unified with group theory)
// =============================================================================

import {
  andHandler,
  orHandler,
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

interface AndInput {
  /** Values to AND together (short-circuit) */
  values: unknown[];
}

type AndProcedure = Procedure<AndInput, unknown, LogicMetadata>;

const andProcedure: AndProcedure = defineProcedure({
  path: ["and"],
  input: anySchema as any,
  output: anySchema as any,
  metadata: andMetadata,
  handler: andHandler,
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
  metadata: orMetadata,
  handler: orHandler,
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
  /** Array to map over */
  items: unknown[];
  /** Results from mapping (items should be procedure refs that get hydrated) */
  results?: unknown[];
}

interface MapOutput {
  /** Mapped results */
  results: unknown[];
}

type MapProcedure = Procedure<MapInput, MapOutput, { description: string; tags: string[] }>;

const mapProcedure: MapProcedure = defineProcedure({
  path: ["map"],
  input: anySchema as any,
  output: anySchema as any,
  metadata: {
    description: "Map over array (items should contain procedure refs)",
    tags: ["core", "collection"],
  },
  handler: async (input: MapInput): Promise<MapOutput> => {
    // Items are already hydrated (procedure refs executed)
    return {
      results: input.items,
    };
  },
});

// =============================================================================
// Reduce Procedure
// =============================================================================

interface ReduceInput {
  /** Array to reduce */
  items: unknown[];
  /** Initial accumulator value */
  initial: unknown;
  /** Reducer results (computed externally via procedure refs) */
  accumulated?: unknown;
}

type ReduceProcedure = Procedure<ReduceInput, unknown, { description: string; tags: string[] }>;

const reduceProcedure: ReduceProcedure = defineProcedure({
  path: ["reduce"],
  input: anySchema as any,
  output: anySchema as any,
  metadata: {
    description: "Reduce array to single value",
    tags: ["core", "collection"],
  },
  handler: async (input: ReduceInput): Promise<unknown> => {
    // For reduce with procedure refs, the caller needs to compose
    // the reduction manually. This just returns the accumulated value.
    return input.accumulated ?? input.initial;
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
  /** Value to use on error (should be a procedure ref or value) */
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
    tags: ["core", "control-flow"],
  },
  handler: async (input: TryCatchInput): Promise<TryCatchOutput> => {
    // By the time we get here, if `try` was a procedure ref, it's already been
    // hydrated. If it threw, we won't even get here. So this is more of a
    // "catch errors during hydration" pattern - the actual try/catch needs
    // to happen at the hydration level.
    //
    // For now, we just return the try value
    return {
      success: true,
      value: input.try,
    };
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
