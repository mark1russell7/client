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

// =============================================================================
// procedure.list - List all registered procedures
// =============================================================================

const ProcedureListInputSchema = z.object({
  /** Filter by namespace prefix */
  namespace: z.string().optional(),
  /** Include full metadata in response */
  includeMetadata: z.boolean().default(false),
});

type ProcedureListInput = z.infer<typeof ProcedureListInputSchema>;

interface ProcedureListItem {
  /** Procedure path */
  path: ProcedurePath;
  /** Path as dot-separated string */
  key: string;
  /** Description from metadata */
  description: string | undefined;
  /** Tags from metadata */
  tags: string[] | undefined;
  /** Has handler (executable) */
  hasHandler: boolean;
}

interface ProcedureListOutput {
  /** List of procedures */
  procedures: ProcedureListItem[];
  /** Total count */
  count: number;
}

export const procedureListProcedure: AnyProcedure = defineProcedure({
  path: ["procedure", "list"],
  input: ProcedureListInputSchema,
  output: anySchema as any,
  metadata: {
    description: "List all registered procedures",
    tags: ["procedure", "registry"],
    args: [],
    shorts: { namespace: "n", includeMetadata: "m" },
    output: "json",
  },
  handler: async (input: ProcedureListInput): Promise<ProcedureListOutput> => {
    const all = PROCEDURE_REGISTRY.getAll();

    let filtered = all;
    if (input.namespace) {
      filtered = all.filter(p => p.path[0] === input.namespace);
    }

    const procedures: ProcedureListItem[] = filtered.map(p => {
      const meta = p.metadata as Record<string, unknown> | undefined;
      return {
        path: p.path,
        key: pathToKey(p.path),
        description: meta?.["description"] as string | undefined,
        tags: meta?.["tags"] as string[] | undefined,
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

type ProcedureGetInput = z.infer<typeof ProcedureGetInputSchema>;

interface ProcedureGetOutput {
  /** Whether procedure exists */
  found: boolean;
  /** Procedure path */
  path?: ProcedurePath;
  /** Procedure metadata */
  metadata?: Record<string, unknown> | undefined;
  /** Has handler */
  hasHandler?: boolean;
  /** Has input schema */
  hasInputSchema?: boolean;
  /** Has output schema */
  hasOutputSchema?: boolean;
}

export const procedureGetProcedure: AnyProcedure = defineProcedure({
  path: ["procedure", "get"],
  input: ProcedureGetInputSchema,
  output: anySchema as any,
  metadata: {
    description: "Get a procedure definition by path",
    tags: ["procedure", "registry"],
    args: ["path"],
    shorts: {},
    output: "json",
  },
  handler: async (input: ProcedureGetInput): Promise<ProcedureGetOutput> => {
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
      metadata: proc.metadata as Record<string, unknown> | undefined,
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

export const procedureRegistryProcedures: AnyProcedure[] = [
  procedureListProcedure,
  procedureGetProcedure,
  procedureExportProcedure,
];
