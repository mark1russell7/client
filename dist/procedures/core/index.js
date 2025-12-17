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
// =============================================================================
// Type-safe passthrough schema
// =============================================================================
/**
 * Schema that accepts any value (for dynamic procedure composition).
 */
const anySchema = {
    parse: (data) => data,
    safeParse: (data) => ({ success: true, data }),
    _output: undefined,
};
const chainProcedure = defineProcedure({
    path: ["chain"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Execute procedures sequentially",
        tags: ["core", "control-flow"],
    },
    handler: async (input) => {
        const { steps } = input;
        const results = [];
        for (const step of steps) {
            // If step is a procedure ref, it should already be hydrated by exec()
            // If it's a raw value, use it directly
            results.push(step);
        }
        return {
            results,
            final: results[results.length - 1],
        };
    },
});
const parallelProcedure = defineProcedure({
    path: ["parallel"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Execute procedures in parallel",
        tags: ["core", "control-flow"],
    },
    handler: async (input) => {
        const { tasks } = input;
        // Tasks should already be hydrated by exec(), so they're just values
        // If you want true parallel execution, the caller should use parallel refs
        // that get hydrated concurrently
        // For now, tasks are already resolved (hydration happened)
        const results = tasks;
        const errors = [];
        return {
            results,
            allSucceeded: errors.length === 0,
            errors,
        };
    },
});
const conditionalProcedure = defineProcedure({
    path: ["conditional"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Conditional execution (if/then/else)",
        tags: ["core", "control-flow"],
    },
    handler: async (input) => {
        const { condition, then: thenValue, else: elseValue } = input;
        // Condition is already evaluated (hydrated)
        if (condition) {
            return thenValue;
        }
        return elseValue;
    },
});
const andProcedure = defineProcedure({
    path: ["and"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Short-circuit AND (returns first falsy or last value)",
        tags: ["core", "logic"],
    },
    handler: async (input) => {
        const { values } = input;
        // Values are already hydrated
        for (const value of values) {
            if (!value) {
                return value; // Return first falsy
            }
        }
        return values[values.length - 1]; // Return last value
    },
});
const orProcedure = defineProcedure({
    path: ["or"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Short-circuit OR (returns first truthy value)",
        tags: ["core", "logic"],
    },
    handler: async (input) => {
        const { values } = input;
        // Values are already hydrated
        for (const value of values) {
            if (value) {
                return value; // Return first truthy
            }
        }
        return values[values.length - 1]; // Return last value (all falsy)
    },
});
const notProcedure = defineProcedure({
    path: ["not"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Logical NOT",
        tags: ["core", "logic"],
    },
    handler: async (input) => {
        return !input.value;
    },
});
const mapProcedure = defineProcedure({
    path: ["map"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Map over array (items should contain procedure refs)",
        tags: ["core", "collection"],
    },
    handler: async (input) => {
        // Items are already hydrated (procedure refs executed)
        return {
            results: input.items,
        };
    },
});
const reduceProcedure = defineProcedure({
    path: ["reduce"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Reduce array to single value",
        tags: ["core", "collection"],
    },
    handler: async (input) => {
        // For reduce with procedure refs, the caller needs to compose
        // the reduction manually. This just returns the accumulated value.
        return input.accumulated ?? input.initial;
    },
});
const identityProcedure = defineProcedure({
    path: ["identity"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Return input unchanged",
        tags: ["core", "utility"],
    },
    handler: async (input) => {
        return input.value;
    },
});
const constantProcedure = defineProcedure({
    path: ["constant"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Return a constant value",
        tags: ["core", "utility"],
    },
    handler: async (input) => {
        return input.value;
    },
});
const throwProcedure = defineProcedure({
    path: ["throw"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Throw an error",
        tags: ["core", "control-flow"],
    },
    handler: async (input) => {
        const error = new Error(input.message);
        if (input.code) {
            error.code = input.code;
        }
        throw error;
    },
});
const tryCatchProcedure = defineProcedure({
    path: ["tryCatch"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Try/catch wrapper for procedures",
        tags: ["core", "control-flow"],
    },
    handler: async (input) => {
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
export const coreProcedures = namespace(["client"], [
    chainProcedure,
    parallelProcedure,
    conditionalProcedure,
    andProcedure,
    orProcedure,
    notProcedure,
    mapProcedure,
    reduceProcedure,
    identityProcedure,
    constantProcedure,
    throwProcedure,
    tryCatchProcedure,
]);
/**
 * Core procedures module for registration.
 */
export const coreModule = {
    name: "client-core",
    procedures: coreProcedures,
};
// Re-export individual procedures for direct access
export { chainProcedure, parallelProcedure, conditionalProcedure, andProcedure, orProcedure, notProcedure, mapProcedure, reduceProcedure, identityProcedure, constantProcedure, throwProcedure, tryCatchProcedure, };
//# sourceMappingURL=index.js.map