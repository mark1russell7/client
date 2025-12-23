/**
 * Procedure Definition Procedure
 *
 * Meta-procedure that creates procedures at runtime from JSON aggregations.
 * Enables fully declarative procedure definition without native TypeScript code.
 *
 * @example
 * ```typescript
 * // Define a procedure that chains multiple steps
 * await client.call(["procedure", "define"], {
 *   path: ["my", "workflow"],
 *   aggregation: {
 *     $proc: ["client", "chain"],
 *     input: {
 *       steps: [
 *         { $proc: ["fs", "mkdir"], input: { path: { $ref: "input.dir" } } },
 *         { $proc: ["git", "init"], input: { cwd: { $ref: "input.dir" } } },
 *       ],
 *     },
 *   },
 * });
 *
 * // Now use the defined procedure
 * await client.call(["my", "workflow"], { dir: "/path/to/project" });
 * ```
 */
import { defineProcedure, validateProcedure } from "./define.js";
import { anySchema } from "./core/schemas.js";
// =============================================================================
// Aggregation Handler Factory
// =============================================================================
/**
 * Create a handler that executes an aggregation definition.
 *
 * The handler:
 * 1. Takes the procedure input
 * 2. Walks the aggregation tree
 * 3. Resolves $ref references to input values
 * 4. Executes $proc calls via the client
 * 5. Returns the final result
 */
function createAggregationHandler(aggregation) {
    return async (input, ctx) => {
        // Resolve the aggregation tree with the input context
        const resolvedInput = resolveInputRefs(aggregation.input, { input });
        // Execute the root procedure
        if (!ctx.client) {
            throw new Error("procedure.define requires a client context to execute aggregations");
        }
        return ctx.client.call(aggregation.$proc, resolvedInput);
    };
}
/**
 * Resolve $ref placeholders in an input tree.
 *
 * Supports:
 * - { $ref: "input.path.to.value" } - reference to input field
 * - { $ref: "$last" } - reference to last result (in chains)
 * - Nested objects and arrays
 */
function resolveInputRefs(value, context) {
    if (value === null || value === undefined) {
        return value;
    }
    // Handle $ref objects
    if (typeof value === "object" && value !== null && "$ref" in value) {
        const ref = value.$ref;
        return resolveRefPath(ref, context);
    }
    // Handle arrays
    if (Array.isArray(value)) {
        return value.map(item => resolveInputRefs(item, context));
    }
    // Handle objects
    if (typeof value === "object") {
        const result = {};
        for (const [key, val] of Object.entries(value)) {
            result[key] = resolveInputRefs(val, context);
        }
        return result;
    }
    // Primitives pass through
    return value;
}
/**
 * Resolve a dot-separated path against a context object.
 */
function resolveRefPath(path, context) {
    const parts = path.split(".");
    let current;
    // Handle special prefixes
    if (parts[0] === "input") {
        current = context.input;
        parts.shift();
    }
    else if (parts[0] === "$last") {
        current = context.last;
        parts.shift();
    }
    else {
        // Assume it's an input reference
        current = context.input;
    }
    // Navigate the path
    for (const part of parts) {
        if (current === null || current === undefined) {
            return undefined;
        }
        if (typeof current !== "object") {
            return undefined;
        }
        current = current[part];
    }
    return current;
}
// =============================================================================
// Registry for Runtime-Defined Procedures
// =============================================================================
/**
 * Storage for runtime-defined procedures.
 * Maps path key to procedure definition.
 */
const runtimeProcedures = new Map();
/**
 * Get a runtime-defined procedure by path.
 */
export function getRuntimeProcedure(path) {
    return runtimeProcedures.get(path.join("."));
}
/**
 * Check if a runtime procedure exists.
 */
export function hasRuntimeProcedure(path) {
    return runtimeProcedures.has(path.join("."));
}
/**
 * Get all runtime-defined procedures.
 */
export function getAllRuntimeProcedures() {
    return Array.from(runtimeProcedures.values());
}
/**
 * Clear all runtime-defined procedures.
 * Useful for testing.
 */
export function clearRuntimeProcedures() {
    runtimeProcedures.clear();
}
/**
 * The procedure.define procedure.
 *
 * This is a meta-procedure that creates other procedures at runtime
 * from JSON aggregation definitions.
 */
export const defineProcedureProcedure = defineProcedure({
    path: ["procedure", "define"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Define a new procedure from an aggregation",
        tags: ["core", "meta"],
        metaProcedure: true,
    },
    handler: async (input, _ctx) => {
        const { path, aggregation, metadata, replace } = input;
        // Check if procedure already exists
        const pathKey = path.join(".");
        const exists = runtimeProcedures.has(pathKey);
        if (exists && !replace) {
            throw new Error(`Procedure already exists at path: ${pathKey}`);
        }
        // Create the aggregation handler
        const handler = createAggregationHandler(aggregation);
        // Create the procedure
        const procedure = defineProcedure({
            path,
            input: anySchema,
            output: anySchema,
            metadata: metadata ?? {
                description: `Runtime-defined aggregation procedure`,
                generatedFrom: "procedure.define",
                aggregation,
            },
            handler,
        });
        // Validate the procedure
        validateProcedure(procedure);
        // Register in runtime storage
        runtimeProcedures.set(pathKey, procedure);
        return {
            path,
            replaced: exists,
        };
    },
});
// =============================================================================
// Additional Meta-Procedures
// =============================================================================
/**
 * Get a runtime-defined procedure by path.
 */
export const getProcedureProcedure = defineProcedure({
    path: ["procedure", "get"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Get a runtime-defined procedure by path",
        tags: ["core", "meta"],
    },
    handler: async (input) => {
        return getRuntimeProcedure(input.path) ?? null;
    },
});
/**
 * List all runtime-defined procedures.
 */
export const listProceduresProcedure = defineProcedure({
    path: ["procedure", "list"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "List all runtime-defined procedures",
        tags: ["core", "meta"],
    },
    handler: async () => {
        const procedures = getAllRuntimeProcedures().map(proc => ({
            path: proc.path,
            metadata: proc.metadata,
        }));
        return { procedures };
    },
});
/**
 * Delete a runtime-defined procedure.
 */
export const deleteProcedureProcedure = defineProcedure({
    path: ["procedure", "delete"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Delete a runtime-defined procedure",
        tags: ["core", "meta"],
    },
    handler: async (input) => {
        const pathKey = input.path.join(".");
        const deleted = runtimeProcedures.delete(pathKey);
        return { deleted };
    },
});
// =============================================================================
// Export All Meta-Procedures
// =============================================================================
/**
 * All meta-procedures for procedure management.
 */
export const metaProcedures = [
    defineProcedureProcedure,
    getProcedureProcedure,
    listProceduresProcedure,
    deleteProcedureProcedure,
];
//# sourceMappingURL=define-procedure.js.map