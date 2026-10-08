/**
 * Meta Procedures
 *
 * Procedures for working with procedure references, serialization, and evaluation.
 * Enables dynamic procedure composition and remote execution.
 * All procedures are namespaced under "client" (e.g., client.import, client.eval).
 */
import { defineProcedure, namespace } from "../define.js";
import { parseProcedureJson, stringifyProcedureJson, isAnyProcedureRef } from "../ref.js";
import { PROCEDURE_REGISTRY } from "../registry.js";
// =============================================================================
// Type-safe passthrough schema
// =============================================================================
const anySchema = {
    parse: (data) => data,
    safeParse: (data) => ({ success: true, data }),
    _output: undefined,
};
const importProcedure = defineProcedure({
    path: ["import"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Parse procedure aggregation from JSON string",
        tags: ["core", "meta"],
    },
    handler: async (input) => {
        try {
            if (input.json) {
                const procedure = parseProcedureJson(input.json);
                return { procedure, success: true };
            }
            if (input.path) {
                // File loading would need to use fs.read procedure
                // For now, return error indicating path loading requires fs.read
                return {
                    procedure: null,
                    success: false,
                    error: "File path loading requires fs.read procedure. Use json parameter instead or call fs.read first.",
                };
            }
            return {
                procedure: null,
                success: false,
                error: "Either json or path parameter is required",
            };
        }
        catch (error) {
            return {
                procedure: null,
                success: false,
                error: error instanceof Error ? error.message : "Parse failed",
            };
        }
    },
});
const exportProcedure = defineProcedure({
    path: ["export"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Serialize procedure aggregation to JSON string",
        tags: ["core", "meta"],
    },
    handler: async (input) => {
        try {
            const json = stringifyProcedureJson(input.procedure, input.pretty ? 2 : undefined);
            return { json, success: true };
        }
        catch (error) {
            return {
                json: "",
                success: false,
                error: error instanceof Error ? error.message : "Serialization failed",
            };
        }
    },
});
const evalProcedure = defineProcedure({
    path: ["eval"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Evaluate a procedure reference (for dynamic composition)",
        tags: ["core", "meta"],
    },
    handler: async (input, ctx) => {
        // If procedure is a string array (path), look up in registry
        if (Array.isArray(input.procedure) && input.procedure.every((p) => typeof p === "string")) {
            const proc = PROCEDURE_REGISTRY.get(input.procedure);
            if (proc && proc.handler) {
                return proc.handler(input.input, ctx);
            }
            throw new Error(`Procedure not found: ${input.procedure.join(".")}`);
        }
        // If procedure is a procedure ref, the hydration should have already executed it
        // This procedure is mainly for programmatic execution
        if (isAnyProcedureRef(input.procedure)) {
            // Get the path and input from the ref
            const procRef = input.procedure;
            const refPath = procRef.path ?? procRef.$proc;
            const refInput = procRef.input ?? {};
            if (!refPath) {
                throw new Error("Invalid procedure reference: missing path");
            }
            const proc = PROCEDURE_REGISTRY.get(refPath);
            if (proc && proc.handler) {
                // Merge input from ref with provided input
                const finalInput = { ...refInput, ...(input.input ?? {}) };
                return proc.handler(finalInput, ctx);
            }
            throw new Error(`Procedure not found: ${refPath.join(".")}`);
        }
        throw new Error("Invalid procedure reference");
    },
});
const parseJsonProcedure = defineProcedure({
    path: ["parseJson"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Parse JSON string (optionally with procedure ref support)",
        tags: ["core", "meta"],
    },
    handler: async (input) => {
        if (input.parseProcedures !== false) {
            return parseProcedureJson(input.json);
        }
        return JSON.parse(input.json);
    },
});
const stringifyJsonProcedure = defineProcedure({
    path: ["stringifyJson"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Stringify value to JSON (with procedure ref support)",
        tags: ["core", "meta"],
    },
    handler: async (input) => {
        const indent = input.pretty ? (input.indent ?? 2) : input.indent;
        return stringifyProcedureJson(input.value, indent);
    },
});
const lookupProcedure = defineProcedure({
    path: ["lookup"],
    input: anySchema,
    output: anySchema,
    metadata: {
        description: "Look up procedure in registry by path",
        tags: ["core", "meta"],
    },
    handler: async (input) => {
        const proc = PROCEDURE_REGISTRY.get(input.path);
        if (proc) {
            return {
                exists: true,
                metadata: proc.metadata,
                path: proc.path,
            };
        }
        return {
            exists: false,
            path: input.path,
        };
    },
});
// =============================================================================
// Export Meta Procedures
// =============================================================================
/**
 * All meta procedures (before namespacing).
 */
const metaProceduresRaw = [
    importProcedure,
    exportProcedure,
    evalProcedure,
    parseJsonProcedure,
    stringifyJsonProcedure,
    lookupProcedure,
];
/**
 * All meta procedures namespaced under "client".
 */
export const metaProcedures = namespace(["client"], metaProceduresRaw);
/**
 * Meta procedures module for registration.
 */
export const metaModule = {
    name: "client-meta",
    procedures: metaProcedures,
};
// Re-export individual procedures for direct access
export { importProcedure, exportProcedure, evalProcedure, parseJsonProcedure, stringifyJsonProcedure, lookupProcedure, };
//# sourceMappingURL=meta.js.map