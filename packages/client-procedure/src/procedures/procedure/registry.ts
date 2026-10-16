/**
 * procedure.* Registry Procedures
 *
 * Procedures for managing the procedure registry dynamically.
 * Enables procedure-as-data patterns, remote registration, and persistence.
 */

import { defineProcedure, PROCEDURE_REGISTRY, REGISTRY_READ_EFFECTS, pathToKey, keyToPath } from "@procedures/client";
import type { AnyProcedure, ProcedureContext, ProcedurePath } from "@procedures/client";
import { z } from "zod";

// procedure.list and procedure.get are core procedures (`@procedures/client`, in
// define-procedure.ts). This package gave its own versions for the whole registry and replaced
// the core ones, so the results depended on the imports of the host (docs review DOC-6). The core
// versions now list and describe the whole registry of the caller, with a `runtime` flag.

// =============================================================================
// procedure.export - Export procedure as JSON
// =============================================================================

const ProcedureExportInputSchema = z.object({
  /** Procedure path (array or dot-separated) */
  path: z.union([z.array(z.string()), z.string()]).describe("Procedure path (array or dot-separated)"),
});

type ProcedureExportInput = z.infer<typeof ProcedureExportInputSchema>;

interface ProcedureExportOutput {
  /** Whether export succeeded */
  success: boolean;
  /** Exported procedure definition */
  definition?: {
    $proc: ProcedurePath;
    metadata?: Record<string, unknown> | undefined;
  };
  /** Error if failed */
  error?: string;
}

/** The output of `procedure.export` (roadmap 2.1: before, a pass-through schema) */
const ProcedureExportOutputSchema = z.looseObject({
  success: z.boolean().describe("True when the registry has the procedure"),
  definition: z
    .looseObject({
      $proc: z.array(z.string()).describe("The path of the procedure"),
      metadata: z.record(z.string(), z.unknown()).optional().describe("The metadata of the procedure"),
    })
    .optional()
    .describe("The procedure as a procedure reference, when it exists"),
  error: z.string().optional().describe("The error message when the registry has no such procedure"),
}) as z.ZodType<ProcedureExportOutput>;

export const procedureExportProcedure: AnyProcedure = defineProcedure({
  path: ["procedure", "export"],
  input: ProcedureExportInputSchema,
  output: ProcedureExportOutputSchema,
  metadata: {
    description: "Export a procedure definition as JSON",
    tags: ["procedure", "registry"],
    effects: REGISTRY_READ_EFFECTS,
    args: ["path"],
    shorts: {},
    output: "json",
  },
  handler: async (input: ProcedureExportInput, ctx?: ProcedureContext): Promise<ProcedureExportOutput> => {
    const path = typeof input.path === "string"
      ? keyToPath(input.path)
      : input.path;

    const found = (ctx?.registry ?? PROCEDURE_REGISTRY).get(path);
    // A procedure outside the expose rule of the host is not found (roadmap R17)
    const proc = found && (!ctx?.expose || ctx.expose(found.path)) ? found : undefined;

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
        metadata: proc.metadata as Record<string, unknown> | undefined,
      },
    };
  },
});

// =============================================================================
// Export all procedure.* procedures
// =============================================================================

export const procedureRegistryProcedures: AnyProcedure[] = [procedureExportProcedure];
