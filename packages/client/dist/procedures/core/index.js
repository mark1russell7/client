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
import { isAnyProcedureRef, normalizeRef, createRefScope, isOutputRef, resolveOutputRef, } from "../ref.js";
/**
 * Resolve any $ref values in an object using the given scope.
 */
function resolveRefs(value, scope) {
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
        const obj = value;
        const result = {};
        for (const [key, val] of Object.entries(obj)) {
            result[key] = resolveRefs(val, scope);
        }
        return result;
    }
    return value;
}
const chainProcedure = defineProcedure({
    path: ["chain"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Execute procedures sequentially",
        tags: ["core", "control-flow"],
    },
    handler: async (input, ctx) => {
        const { steps } = input;
        const results = [];
        const scope = createRefScope();
        for (const step of steps) {
            let result;
            if (isAnyProcedureRef(step)) {
                // This is a procedure reference - execute it
                const normalized = normalizeRef(step);
                const stepName = step.$name;
                // Resolve any $refs in the step's input
                const resolvedInput = resolveRefs(normalized.input, scope);
                // Execute the procedure
                if (ctx?.client) {
                    result = await ctx.client.call(normalized.path, resolvedInput);
                }
                else {
                    // No client context - just use the resolved input as result
                    result = resolvedInput;
                }
                // Store named output
                if (stepName) {
                    scope.outputs.set(stepName, result);
                }
            }
            else if (isOutputRef(step)) {
                // This is an output reference - resolve it
                result = resolveOutputRef(step.$ref, scope);
            }
            else {
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
    handler: async (input, ctx) => {
        const { condition, then: thenValue, else: elseValue } = input;
        // Determine truthiness - check for .value property (from predicates like git.hasChanges)
        let isTruthy;
        if (condition && typeof condition === "object" && "value" in condition) {
            isTruthy = Boolean(condition.value);
        }
        else {
            isTruthy = Boolean(condition);
        }
        // Select the branch to execute/return
        const selectedBranch = isTruthy ? thenValue : elseValue;
        // If the branch is a procedure ref, execute it
        if (selectedBranch && isAnyProcedureRef(selectedBranch) && ctx?.client) {
            const normalized = normalizeRef(selectedBranch);
            return ctx.client.call(normalized.path, normalized.input);
        }
        return selectedBranch;
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
export const allCoreProcedures = [
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
export const allCoreModules = [
    coreModule,
    mathModule,
    comparisonModule,
    stringModule,
    typeModule,
    objectModule,
    arrayModule,
    metaModule,
];
//# sourceMappingURL=index.js.map