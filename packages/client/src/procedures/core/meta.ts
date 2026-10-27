/**
 * Meta Procedures
 *
 * Procedures for working with procedure references, serialization, and evaluation.
 * Enables dynamic procedure composition and remote execution.
 * The namespace of all these procedures is "client": for example client.import and client.eval.
 */

import { z } from "zod";
import { anyOutput, stringOutput } from "./outputs.js";
import { defineProcedure, namespace } from "../define.js";
import type { AnyProcedure, Procedure } from "../types.js";
import {
  parseProcedureJson,
  stringifyProcedureJson,
  isAnyProcedureRef,
  isProcedureRef,
  isOutputRef,
  isPlainObject,
  resolveOutputRef,
  scopeOf,
  RUNS_REFS_TAG,
  RAW_INPUT_TAG,
} from "../ref.js";
import { callOperand } from "./operands.js";
import { PROCEDURE_REGISTRY } from "../registry.js";
import { PURE_EFFECTS, REGISTRY_READ_EFFECTS, withEffects } from "../effects.js";

// =============================================================================
// Import Procedure
// =============================================================================

interface ImportInput {
  /** JSON string containing procedure ref */
  json?: string | undefined;
  /** File path to load procedure ref from (requires fs.read procedure) */
  path?: string | undefined;
}

const ImportInputSchema = z.object({
  json: z.string().optional().describe("JSON string containing procedure ref"),
  path: z.string().optional().describe("File path to load procedure ref from (requires fs.read procedure)"),
});

interface ImportOutput {
  /** The parsed procedure reference */
  procedure?: unknown;
  /** Whether parsing succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
}

const ImportOutputSchema = z.looseObject({
  procedure: z.unknown().optional().describe("The parsed procedure reference"),
  success: z.boolean().describe("True when the text is a valid procedure reference"),
  error: z.string().optional().describe("The error message when the parse failed"),
}) as z.ZodType<ImportOutput>;

type ImportProcedure = Procedure<ImportInput, ImportOutput, { description: string; tags: string[] }>;

/**
 * This function gives true for the runtime form of a procedure reference whose path is a list of
 * texts. `client.import` accepts only such a value at the top level.
 */
function isImportableRef(value: unknown): boolean {
  if (!isProcedureRef(value)) return false;
  const path = (value as { path?: unknown }).path;
  return Array.isArray(path) && path.length > 0 && path.every((segment) => typeof segment === "string");
}

const importProcedure: ImportProcedure = defineProcedure({
  path: ["import"],
  input: ImportInputSchema,
  output: ImportOutputSchema,
  metadata: {
    description:
      "Parse a procedure reference ({ $proc, input }) from JSON text. Other JSON, for example a number or a list, gives success false.",
    tags: ["core", "meta"],
  },
  handler: async (input: ImportInput): Promise<ImportOutput> => {
    try {
      if (input.json) {
        const procedure = parseProcedureJson(input.json);
        // Before, each JSON value gave success true, for example 42 (catalog test, roadmap R29)
        if (!isImportableRef(procedure)) {
          return {
            procedure: null,
            success: false,
            error: "The JSON is not a procedure reference. A reference is an object whose $proc is a list of texts.",
          };
        }
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
  procedure?: unknown;
  /** Pretty print JSON output */
  pretty?: boolean | undefined;
}

/**
 * This function gives a schema of a required value: undefined has no JSON text, so the input
 * schema refuses it with `VALIDATION_ERROR`. Before, the call failed with
 * `OUTPUT_VALIDATION_ERROR` (catalog test, roadmap R29).
 */
const definedValue = (description: string) =>
  z
    .unknown()
    .refine((value) => value !== undefined, { message: "The value is missing: undefined has no JSON text" })
    .describe(description);

const ExportInputSchema = z.object({
  procedure: definedValue("The procedure reference to serialize. The procedure refuses a missing value (undefined) with VALIDATION_ERROR, because undefined has no JSON text."),
  pretty: z.boolean().optional().describe("Pretty print JSON output"),
});

interface ExportOutput {
  /** Serialized JSON string */
  json: string;
  /** Whether serialization succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
}

const ExportOutputSchema = z.looseObject({
  json: z.string().describe("The procedure reference as JSON text"),
  success: z.boolean().describe("True when the serialization succeeded"),
  error: z.string().optional().describe("The error message when the serialization failed"),
}) as z.ZodType<ExportOutput>;

type ExportProcedure = Procedure<ExportInput, ExportOutput, { description: string; tags: string[] }>;

const exportProcedure: ExportProcedure = defineProcedure({
  path: ["export"],
  input: ExportInputSchema,
  output: ExportOutputSchema,
  metadata: {
    description: "Serialize a procedure reference to JSON text. It refuses a missing procedure (undefined) with VALIDATION_ERROR.",
    // The refs of the input are data: exec() must not run them (deep dive CORE-5)
    tags: ["core", "meta", RAW_INPUT_TAG],
  },
  handler: async (input: ExportInput): Promise<ExportOutput> => {
    try {
      const json = stringifyProcedureJson(input.procedure, input.pretty ? 2 : undefined) as string | undefined;
      // A function or a symbol has no JSON text either: an error result, not an invalid output
      if (json === undefined) return { json: "", success: false, error: "The procedure has no JSON text" };
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
  procedure?: unknown;
  /** Input to pass to the procedure */
  input?: unknown | undefined;
}

const EvalInputSchema = z.object({
  procedure: z.unknown().optional().describe("Procedure reference (path or full ref)"),
  input: z.unknown().optional().describe("Input to pass to the procedure"),
});

type EvalProcedure = Procedure<EvalInput, unknown, { description: string; tags: string[] }>;

const evalProcedure: EvalProcedure = defineProcedure({
  path: ["eval"],
  input: EvalInputSchema,
  output: anyOutput("The result of the evaluated call"),
  metadata: {
    description: "Evaluate a procedure reference (for dynamic composition)",
    tags: ["core", "meta", RUNS_REFS_TAG],
  },
  handler: async (input: EvalInput, ctx): Promise<unknown> => {
    // The call goes through ctx.client, so it gets input validation, its own context and the
    // expose rule of a server. Before, eval called the handler from the global registry directly,
    // with the context of eval.
    //
    // eval takes its input raw (runs-refs). It evaluates its call like exec(): the calls and the
    // $ref values of the call's input run in the scope of the caller, and a procedure that takes
    // raw input (control flow) gets it raw. (Docs review DOC-2: before, eval gave the raw input
    // to the call, so `add` with a nested call gave "[object Object]1".)
    const scope = scopeOf(input);
    let procedure = input.procedure;
    // The procedure can be a $ref to a ref that an earlier step made (data of the scope)
    if (isOutputRef(procedure) && scope) {
      procedure = resolveOutputRef(procedure.$ref, scope);
    }

    if (Array.isArray(procedure) && procedure.every((p) => typeof p === "string")) {
      return callOperand({ $proc: procedure as string[], input: input.input }, ctx, { scope });
    }

    if (isAnyProcedureRef(procedure)) {
      const procRef = procedure as { path?: string[]; $proc?: string[]; input?: unknown };
      const refPath = procRef.path ?? procRef.$proc;
      if (!refPath) {
        throw new Error("Invalid procedure reference: missing path");
      }
      // The input of eval goes over the input of the ref, for objects
      const refInput = procRef.input;
      const extra = input.input;
      const finalInput =
        extra === undefined
          ? refInput
          : isPlainObject(refInput) && isPlainObject(extra)
            ? { ...refInput, ...extra }
            : extra;
      return callOperand({ $proc: refPath, input: finalInput }, ctx, { scope });
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
  parseProcedures?: boolean | undefined;
}

const ParseJsonInputSchema = z.object({
  json: z.string().describe("JSON string to parse"),
  parseProcedures: z.boolean().optional().describe("Whether to parse procedure refs ($proc syntax)"),
});

type ParseJsonProcedure = Procedure<ParseJsonInput, unknown, { description: string; tags: string[] }>;

const parseJsonProcedure: ParseJsonProcedure = defineProcedure({
  path: ["parseJson"],
  input: ParseJsonInputSchema,
  output: anyOutput("The parsed JSON value"),
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
  value?: unknown;
  /** Pretty print with indentation */
  pretty?: boolean | undefined;
  /** Custom indentation (number of spaces or string) */
  indent?: number | string | undefined;
}

const StringifyJsonInputSchema = z.object({
  value: definedValue("The value to write as JSON. The procedure refuses a missing value (undefined) with VALIDATION_ERROR, because undefined has no JSON text."),
  pretty: z.boolean().optional().describe("Pretty print with indentation"),
  indent: z.union([z.number(), z.string()]).optional().describe("Custom indentation (number of spaces or string)"),
});

type StringifyJsonProcedure = Procedure<StringifyJsonInput, string, { description: string; tags: string[] }>;

const stringifyJsonProcedure: StringifyJsonProcedure = defineProcedure({
  path: ["stringifyJson"],
  input: StringifyJsonInputSchema,
  output: stringOutput("The JSON text"),
  metadata: {
    description: "Stringify value to JSON (with procedure ref support). It refuses a missing value (undefined) with VALIDATION_ERROR.",
    // The refs of the input are data: exec() must not run them (deep dive CORE-5)
    tags: ["core", "meta", RAW_INPUT_TAG],
  },
  handler: async (input: StringifyJsonInput): Promise<string> => {
    const indent = input.pretty ? (input.indent ?? 2) : input.indent;
    const json = stringifyProcedureJson(input.value, indent as number) as string | undefined;
    // A function or a symbol has no JSON text either: a clear error, not an invalid output
    if (json === undefined) throw new Error("The value has no JSON text");
    return json;
  },
});

// =============================================================================
// Lookup Procedure
// =============================================================================

interface LookupInput {
  /** Procedure path to look up */
  path: string[];
}

const LookupInputSchema = z.object({
  path: z.array(z.string()).describe("Procedure path to look up"),
});

interface LookupOutput {
  /** Whether procedure exists */
  exists: boolean;
  /** Procedure metadata if found */
  metadata?: unknown;
  /** Procedure path */
  path: string[];
}

const LookupOutputSchema = z.looseObject({
  exists: z.boolean().describe("True when the registry has the procedure"),
  metadata: z.unknown().optional().describe("The metadata of the procedure, when it exists"),
  path: z.array(z.string()).describe("The path of the procedure"),
}) as z.ZodType<LookupOutput>;

type LookupProcedure = Procedure<LookupInput, LookupOutput, { description: string; tags: string[] }>;

const lookupProcedure: LookupProcedure = defineProcedure({
  path: ["lookup"],
  input: LookupInputSchema,
  output: LookupOutputSchema,
  metadata: {
    description: "Look up procedure in registry by path",
    tags: ["core", "meta"],
  },
  handler: async (input: LookupInput, ctx): Promise<LookupOutput> => {
    // The registry of the caller (a server or a client with its own registry)
    const proc = (ctx?.registry ?? PROCEDURE_REGISTRY).get(input.path);
    // A procedure outside the expose rule of the host does not exist for its callers (R17)
    if (proc && (!ctx?.expose || ctx.expose(proc.path))) {
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
  // These parse, serialize or run programs: no effects of their own (CAPABILITIES-2026-10)
  ...withEffects(PURE_EFFECTS, [
    importProcedure as AnyProcedure,
    exportProcedure as AnyProcedure,
    evalProcedure as AnyProcedure,
    parseJsonProcedure as AnyProcedure,
    stringifyJsonProcedure as AnyProcedure,
  ]),
  // It reads the registry
  ...withEffects(REGISTRY_READ_EFFECTS, [lookupProcedure as AnyProcedure]),
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
