/**
 * Meta Procedures
 *
 * Procedures for working with procedure references, serialization, and evaluation.
 * Enables dynamic procedure composition and remote execution.
 * All procedures are namespaced under "client" (e.g., client.import, client.eval).
 */

import { defineProcedure, namespace } from "../define.js";
import type { AnyProcedure, Procedure } from "../types.js";
import { parseProcedureJson, stringifyProcedureJson, isAnyProcedureRef, RUNS_REFS_TAG, RAW_INPUT_TAG } from "../ref.js";
import { PROCEDURE_REGISTRY } from "../registry.js";

// =============================================================================
// Type-safe passthrough schema
// =============================================================================

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
// Import Procedure
// =============================================================================

interface ImportInput {
  /** JSON string containing procedure ref */
  json?: string;
  /** File path to load procedure ref from (requires fs.read procedure) */
  path?: string;
}

interface ImportOutput {
  /** The parsed procedure reference */
  procedure: unknown;
  /** Whether parsing succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
}

type ImportProcedure = Procedure<ImportInput, ImportOutput, { description: string; tags: string[] }>;

const importProcedure: ImportProcedure = defineProcedure({
  path: ["import"],
  input: anySchema as any,
  output: anySchema as any,
  metadata: {
    description: "Parse procedure aggregation from JSON string",
    tags: ["core", "meta"],
  },
  handler: async (input: ImportInput): Promise<ImportOutput> => {
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
    } catch (error) {
      return {
        procedure: null,
        success: false,
        error: error instanceof Error ? error.message : "Parse failed",
      };
    }
  },
});

// =============================================================================
// Export Procedure
// =============================================================================

interface ExportInput {
  /** Procedure reference to serialize */
  procedure: unknown;
  /** Pretty print JSON output */
  pretty?: boolean;
}

interface ExportOutput {
  /** Serialized JSON string */
  json: string;
  /** Whether serialization succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
}

type ExportProcedure = Procedure<ExportInput, ExportOutput, { description: string; tags: string[] }>;

const exportProcedure: ExportProcedure = defineProcedure({
  path: ["export"],
  input: anySchema as any,
  output: anySchema as any,
  metadata: {
    description: "Serialize procedure aggregation to JSON string",
    // The refs of the input are data: exec() must not run them (deep dive CORE-5)
    tags: ["core", "meta", RAW_INPUT_TAG],
  },
  handler: async (input: ExportInput): Promise<ExportOutput> => {
    try {
      const json = stringifyProcedureJson(input.procedure, input.pretty ? 2 : undefined);
      return { json, success: true };
    } catch (error) {
      return {
        json: "",
        success: false,
        error: error instanceof Error ? error.message : "Serialization failed",
      };
    }
  },
});

// =============================================================================
// Eval Procedure
// =============================================================================

interface EvalInput {
  /** Procedure reference (path or full ref) */
  procedure: unknown;
  /** Input to pass to the procedure */
  input?: unknown;
}

type EvalProcedure = Procedure<EvalInput, unknown, { description: string; tags: string[] }>;

const evalProcedure: EvalProcedure = defineProcedure({
  path: ["eval"],
  input: anySchema as any,
  output: anySchema as any,
  metadata: {
    description: "Evaluate a procedure reference (for dynamic composition)",
    tags: ["core", "meta", RUNS_REFS_TAG],
  },
  handler: async (input: EvalInput, ctx): Promise<unknown> => {
    // The call goes through ctx.client, so it gets input validation, its own context and the
    // expose rule of a server. Before, eval called the handler from the global registry directly,
    // with the context of eval.
    if (Array.isArray(input.procedure) && input.procedure.every((p) => typeof p === "string")) {
      return ctx.client.call(input.procedure as string[], input.input);
    }

    if (isAnyProcedureRef(input.procedure)) {
      const procRef = input.procedure as { path?: string[]; $proc?: string[]; input?: Record<string, unknown> };
      const refPath = procRef.path ?? procRef.$proc;
      const refInput = procRef.input ?? {};

      if (!refPath) {
        throw new Error("Invalid procedure reference: missing path");
      }

      // Merge input from ref with provided input
      const finalInput = { ...refInput, ...(input.input as Record<string, unknown> ?? {}) };
      return ctx.client.call(refPath, finalInput);
    }

    throw new Error("Invalid procedure reference");
  },
});

// =============================================================================
// ParseJson Procedure
// =============================================================================

interface ParseJsonInput {
  /** JSON string to parse */
  json: string;
  /** Whether to parse procedure refs ($proc syntax) */
  parseProcedures?: boolean;
}

type ParseJsonProcedure = Procedure<ParseJsonInput, unknown, { description: string; tags: string[] }>;

const parseJsonProcedure: ParseJsonProcedure = defineProcedure({
  path: ["parseJson"],
  input: anySchema as any,
  output: anySchema as any,
  metadata: {
    description: "Parse JSON string (optionally with procedure ref support)",
    tags: ["core", "meta"],
  },
  handler: async (input: ParseJsonInput): Promise<unknown> => {
    if (input.parseProcedures !== false) {
      return parseProcedureJson(input.json);
    }
    return JSON.parse(input.json);
  },
});

// =============================================================================
// StringifyJson Procedure
// =============================================================================

interface StringifyJsonInput {
  /** Value to stringify */
  value: unknown;
  /** Pretty print with indentation */
  pretty?: boolean;
  /** Custom indentation (number of spaces or string) */
  indent?: number | string;
}

type StringifyJsonProcedure = Procedure<StringifyJsonInput, string, { description: string; tags: string[] }>;

const stringifyJsonProcedure: StringifyJsonProcedure = defineProcedure({
  path: ["stringifyJson"],
  input: anySchema as any,
  output: anySchema as any,
  metadata: {
    description: "Stringify value to JSON (with procedure ref support)",
    // The refs of the input are data: exec() must not run them (deep dive CORE-5)
    tags: ["core", "meta", RAW_INPUT_TAG],
  },
  handler: async (input: StringifyJsonInput): Promise<string> => {
    const indent = input.pretty ? (input.indent ?? 2) : input.indent;
    return stringifyProcedureJson(input.value, indent as number);
  },
});

// =============================================================================
// Lookup Procedure
// =============================================================================

interface LookupInput {
  /** Procedure path to look up */
  path: string[];
}

interface LookupOutput {
  /** Whether procedure exists */
  exists: boolean;
  /** Procedure metadata if found */
  metadata?: unknown;
  /** Procedure path */
  path: string[];
}

type LookupProcedure = Procedure<LookupInput, LookupOutput, { description: string; tags: string[] }>;

const lookupProcedure: LookupProcedure = defineProcedure({
  path: ["lookup"],
  input: anySchema as any,
  output: anySchema as any,
  metadata: {
    description: "Look up procedure in registry by path",
    tags: ["core", "meta"],
  },
  handler: async (input: LookupInput, ctx): Promise<LookupOutput> => {
    // The registry of the caller (a server or a client with its own registry)
    const proc = (ctx?.registry ?? PROCEDURE_REGISTRY).get(input.path);
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
const metaProceduresRaw: AnyProcedure[] = [
  importProcedure as AnyProcedure,
  exportProcedure as AnyProcedure,
  evalProcedure as AnyProcedure,
  parseJsonProcedure as AnyProcedure,
  stringifyJsonProcedure as AnyProcedure,
  lookupProcedure as AnyProcedure,
];

/**
 * All meta procedures namespaced under "client".
 */
export const metaProcedures: AnyProcedure[] = namespace(["client"], metaProceduresRaw);

/**
 * Meta procedures module for registration.
 */
export const metaModule: { name: string; procedures: AnyProcedure[] } = {
  name: "client-meta",
  procedures: metaProcedures,
};

// Re-export individual procedures for direct access
export {
  importProcedure,
  exportProcedure,
  evalProcedure,
  parseJsonProcedure,
  stringifyJsonProcedure,
  lookupProcedure,
};
