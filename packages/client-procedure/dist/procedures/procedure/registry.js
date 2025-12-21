/**
 * procedure.* Registry Procedures
 *
 * Procedures for managing the procedure registry dynamically.
 * Enables procedure-as-data patterns, remote registration, and persistence.
 */
import { defineProcedure, PROCEDURE_REGISTRY, pathToKey, keyToPath } from "@mark1russell7/client";
import { z } from "zod";
// Schema that accepts any value (for output schema)
const anySchema = {
    parse: (data) => data,
    safeParse: (data) => ({ success: true, data }),
    _output: undefined,
};
// =============================================================================
// procedure.list - List all registered procedures
// =============================================================================
const ProcedureListInputSchema = z.object({
    /** Filter by namespace prefix */
    namespace: z.string().optional(),
    /** Include full metadata in response */
    includeMetadata: z.boolean().default(false),
});
export const procedureListProcedure = defineProcedure({
    path: ["procedure", "list"],
    input: ProcedureListInputSchema,
    output: anySchema,
    metadata: {
        description: "List all registered procedures",
        tags: ["procedure", "registry"],
        args: [],
        shorts: { namespace: "n", includeMetadata: "m" },
        output: "json",
    },
    handler: async (input) => {
        const all = PROCEDURE_REGISTRY.getAll();
        let filtered = all;
        if (input.namespace) {
            filtered = all.filter(p => p.path[0] === input.namespace);
        }
        const procedures = filtered.map(p => {
            const meta = p.metadata;
            return {
                path: p.path,
                key: pathToKey(p.path),
                description: meta?.["description"],
                tags: meta?.["tags"],
                hasHandler: !!p.handler,
            };
        });
        return {
            procedures,
            count: procedures.length,
        };
    },
});
// =============================================================================
// procedure.get - Get a procedure definition
// =============================================================================
const ProcedureGetInputSchema = z.object({
    /** Procedure path (array or dot-separated) */
    path: z.union([z.array(z.string()), z.string()]),
});
export const procedureGetProcedure = defineProcedure({
    path: ["procedure", "get"],
    input: ProcedureGetInputSchema,
    output: anySchema,
    metadata: {
        description: "Get a procedure definition by path",
        tags: ["procedure", "registry"],
        args: ["path"],
        shorts: {},
        output: "json",
    },
    handler: async (input) => {
        const path = typeof input.path === "string"
            ? keyToPath(input.path)
            : input.path;
        const proc = PROCEDURE_REGISTRY.get(path);
        if (!proc) {
            return { found: false };
        }
        return {
            found: true,
            path: proc.path,
            metadata: proc.metadata,
            hasHandler: !!proc.handler,
            hasInputSchema: !!proc.input,
            hasOutputSchema: !!proc.output,
        };
    },
});
// =============================================================================
// procedure.export - Export procedure as JSON
// =============================================================================
const ProcedureExportInputSchema = z.object({
    /** Procedure path (array or dot-separated) */
    path: z.union([z.array(z.string()), z.string()]),
});
export const procedureExportProcedure = defineProcedure({
    path: ["procedure", "export"],
    input: ProcedureExportInputSchema,
    output: anySchema,
    metadata: {
        description: "Export a procedure definition as JSON",
        tags: ["procedure", "registry"],
        args: ["path"],
        shorts: {},
        output: "json",
    },
    handler: async (input) => {
        const path = typeof input.path === "string"
            ? keyToPath(input.path)
            : input.path;
        const proc = PROCEDURE_REGISTRY.get(path);
        if (!proc) {
            return {
                success: false,
                error: `Procedure not found: ${pathToKey(path)}`,
            };
        }
        return {
            success: true,
            definition: {
                $proc: proc.path,
                metadata: proc.metadata,
            },
        };
    },
});
// =============================================================================
// Export all procedure.* procedures
// =============================================================================
export const procedureRegistryProcedures = [
    procedureListProcedure,
    procedureGetProcedure,
    procedureExportProcedure,
];
//# sourceMappingURL=registry.js.map