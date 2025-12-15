/**
 * Type definitions for the declarative CLI spec
 */
import type { z } from "zod";
/**
 * Procedure path (e.g., ["lib", "refresh"])
 */
export type ProcedurePath = string[];
/**
 * Argument type
 */
export type ArgType = "string" | "number" | "boolean";
/**
 * Positional argument definition
 */
export interface ArgSpec {
    /** Argument name */
    name: string;
    /** Argument type */
    type: ArgType;
    /** Description for help text */
    description: string;
    /** Whether the argument is required */
    required?: boolean;
    /** Default value if not provided */
    default?: unknown;
    /** Position index (0-based) */
    position: number;
}
/**
 * Option/flag definition
 */
export interface OptionSpec {
    /** Option name (long form, e.g., "recursive") */
    name: string;
    /** Short form (e.g., "r" for -r) */
    short?: string;
    /** Option type */
    type: ArgType;
    /** Description for help text */
    description: string;
    /** Default value if not provided */
    default?: unknown;
}
/**
 * Parsed CLI arguments
 */
export interface ParsedArgs {
    /** Positional arguments */
    args: Record<string, unknown>;
    /** Options/flags */
    options: Record<string, unknown>;
}
/**
 * Command specification - maps CLI signature to procedure
 */
export interface CommandSpec {
    /** CLI path (e.g., ["lib", "refresh"] -> "mark lib refresh") */
    path: string[];
    /** Description for help text */
    description: string;
    /** Procedure path to call */
    procedure: ProcedurePath;
    /** Positional arguments */
    args?: ArgSpec[];
    /** Options/flags */
    options?: OptionSpec[];
    /** Zod schema for input validation (optional) */
    inputSchema?: z.ZodSchema;
    /** Transform parsed args to procedure payload */
    transform?: (parsed: ParsedArgs) => unknown;
}
/**
 * Full CLI specification
 */
export interface CLISpec {
    /** CLI name */
    name: string;
    /** CLI version */
    version: string;
    /** CLI description */
    description: string;
    /** Commands */
    commands: CommandSpec[];
}
//# sourceMappingURL=types.d.ts.map