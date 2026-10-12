/**
 * procedure.* Registry Procedures
 *
 * Procedures for managing the procedure registry dynamically.
 * Enables procedure-as-data patterns, remote registration, and persistence.
 */

import { defineProcedure, PROCEDURE_REGISTRY, pathToKey, keyToPath } from "@mark1russell7/client";
import type { AnyProcedure, ProcedurePath } from "@mark1russell7/client";
import { z } from "zod";

// Schema that accepts any value (for output schema)
const anySchema: {
  parse: (data: unknown) => unknown;
  safeParse: (data: unknown) => { success: true; data: unknown };
  _output: unknown;
} = {
  parse: (data: unknown) => data,
  safeParse: (data: unknown) => ({ success: true as const, data }),
  _output: undefined as unknown,
};

// procedure.list and procedure.get are core procedures (`@mark1russell7/client`, in
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

export const procedureExportProcedure: AnyProcedure = defineProcedure({
  path: ["procedure", "export"],
  input: ProcedureExportInputSchema,
  output: anySchema as any,
  metadata: {
    description: "Export a procedure definition as JSON",
    tags: ["procedure", "registry"],
    args: ["path"],
    shorts: {},
    output: "json",
  },
  handler: async (input: ProcedureExportInput): Promise<ProcedureExportOutput> => {
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
        metadata: proc.metadata as Record<string, unknown> | undefined,
      },
    };
  },
});

// =============================================================================
// Export all procedure.* procedures
// =============================================================================

export const procedureRegistryProcedures: AnyProcedure[] = [procedureExportProcedure];
