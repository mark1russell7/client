/**
 * Meta Procedures
 *
 * Procedures for working with procedure references, serialization, and evaluation.
 * Enables dynamic procedure composition and remote execution.
 * All procedures are namespaced under "client" (e.g., client.import, client.eval).
 */
import type { AnyProcedure, Procedure } from "../types.js";
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
type ImportProcedure = Procedure<ImportInput, ImportOutput, {
    description: string;
    tags: string[];
}>;
declare const importProcedure: ImportProcedure;
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
type ExportProcedure = Procedure<ExportInput, ExportOutput, {
    description: string;
    tags: string[];
}>;
declare const exportProcedure: ExportProcedure;
interface EvalInput {
    /** Procedure reference (path or full ref) */
    procedure: unknown;
    /** Input to pass to the procedure */
    input?: unknown;
}
type EvalProcedure = Procedure<EvalInput, unknown, {
    description: string;
    tags: string[];
}>;
declare const evalProcedure: EvalProcedure;
interface ParseJsonInput {
    /** JSON string to parse */
    json: string;
    /** Whether to parse procedure refs ($proc syntax) */
    parseProcedures?: boolean;
}
type ParseJsonProcedure = Procedure<ParseJsonInput, unknown, {
    description: string;
    tags: string[];
}>;
declare const parseJsonProcedure: ParseJsonProcedure;
interface StringifyJsonInput {
    /** Value to stringify */
    value: unknown;
    /** Pretty print with indentation */
    pretty?: boolean;
    /** Custom indentation (number of spaces or string) */
    indent?: number | string;
}
type StringifyJsonProcedure = Procedure<StringifyJsonInput, string, {
    description: string;
    tags: string[];
}>;
declare const stringifyJsonProcedure: StringifyJsonProcedure;
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
type LookupProcedure = Procedure<LookupInput, LookupOutput, {
    description: string;
    tags: string[];
}>;
declare const lookupProcedure: LookupProcedure;
/**
 * All meta procedures namespaced under "client".
 */
export declare const metaProcedures: AnyProcedure[];
/**
 * Meta procedures module for registration.
 */
export declare const metaModule: {
    name: string;
    procedures: AnyProcedure[];
};
export { importProcedure, exportProcedure, evalProcedure, parseJsonProcedure, stringifyJsonProcedure, lookupProcedure, };
//# sourceMappingURL=meta.d.ts.map