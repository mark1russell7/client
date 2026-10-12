/**
 * String Procedures
 *
 * String manipulation operations for procedure aggregation.
 * All procedures are namespaced under "client" (e.g., client.concat, client.split).
 */

import { z } from "zod";
import { defineProcedure, namespace } from "../define.js";
import type { AnyProcedure, Procedure } from "../types.js";

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
// Concat Procedure
// =============================================================================

interface ConcatInput {
  values: string[];
  separator?: string | undefined;
}

const ConcatInputSchema = z.object({
  values: z.array(z.string()).describe("The values"),
  separator: z.string().optional().describe("The separator"),
});

type ConcatProcedure = Procedure<ConcatInput, string, { description: string; tags: string[] }>;

const concatProcedure: ConcatProcedure = defineProcedure({
  path: ["concat"],
  input: ConcatInputSchema,
  output: anySchema as any,
  metadata: {
    description: "Concatenate strings with optional separator",
    tags: ["core", "string"],
  },
  handler: async (input: ConcatInput): Promise<string> => {
    return input.values.join(input.separator ?? "");
  },
});

// =============================================================================
// Split Procedure
// =============================================================================

interface SplitInput {
  value: string;
  separator: string;
  limit?: number | undefined;
}

const SplitInputSchema = z.object({
  value: z.string().describe("The value"),
  separator: z.string().describe("The separator"),
  limit: z.number().optional().describe("The most parts to give"),
});

type SplitProcedure = Procedure<SplitInput, string[], { description: string; tags: string[] }>;

const splitProcedure: SplitProcedure = defineProcedure({
  path: ["split"],
  input: SplitInputSchema,
  output: anySchema as any,
  metadata: {
    description: "Split string by separator",
    tags: ["core", "string"],
  },
  handler: async (input: SplitInput): Promise<string[]> => {
    return input.value.split(input.separator, input.limit);
  },
});

// =============================================================================
// Join Procedure
// =============================================================================

interface JoinInput {
  values: string[];
  separator: string;
}

const JoinInputSchema = z.object({
  values: z.array(z.string()).describe("The values"),
  separator: z.string().describe("The separator"),
});

type JoinProcedure = Procedure<JoinInput, string, { description: string; tags: string[] }>;

const joinProcedure: JoinProcedure = defineProcedure({
  path: ["join"],
  input: JoinInputSchema,
  output: anySchema as any,
  metadata: {
    description: "Join array of strings with separator",
    tags: ["core", "string"],
  },
  handler: async (input: JoinInput): Promise<string> => {
    return input.values.join(input.separator);
  },
});

// =============================================================================
// Replace Procedure
// =============================================================================

interface ReplaceInput {
  value: string;
  search: string;
  replace: string;
  all?: boolean | undefined;
}

const ReplaceInputSchema = z.object({
  value: z.string().describe("The value"),
  search: z.string().describe("The text to find"),
  replace: z.string().describe("The replacement text"),
  all: z.boolean().optional().describe("Replace every match, not only the first one"),
});

type ReplaceProcedure = Procedure<ReplaceInput, string, { description: string; tags: string[] }>;

const replaceProcedure: ReplaceProcedure = defineProcedure({
  path: ["replace"],
  input: ReplaceInputSchema,
  output: anySchema as any,
  metadata: {
    description: "Replace substring (first occurrence or all)",
    tags: ["core", "string"],
  },
  handler: async (input: ReplaceInput): Promise<string> => {
    if (input.all) {
      return input.value.split(input.search).join(input.replace);
    }
    return input.value.replace(input.search, input.replace);
  },
});

// =============================================================================
// Substring Procedure
// =============================================================================

interface SubstringInput {
  value: string;
  start: number;
  end?: number | undefined;
}

const SubstringInputSchema = z.object({
  value: z.string().describe("The value"),
  start: z.number().describe("The start position (inclusive)"),
  end: z.number().optional().describe("The end position (exclusive)"),
});

type SubstringProcedure = Procedure<SubstringInput, string, { description: string; tags: string[] }>;

const substringProcedure: SubstringProcedure = defineProcedure({
  path: ["substring"],
  input: SubstringInputSchema,
  output: anySchema as any,
  metadata: {
    description: "Extract substring from start to end index",
    tags: ["core", "string"],
  },
  handler: async (input: SubstringInput): Promise<string> => {
    return input.value.substring(input.start, input.end);
  },
});

// =============================================================================
// Trim Procedure
// =============================================================================

interface TrimInput {
  value: string;
  side?: "start" | "end" | "both" | undefined;
}

const TrimInputSchema = z.object({
  value: z.string().describe("The value"),
  side: z.enum(["start", "end", "both"]).optional().describe("Which side to trim: start, end or both (default: both)"),
});

type TrimProcedure = Procedure<TrimInput, string, { description: string; tags: string[] }>;

const trimProcedure: TrimProcedure = defineProcedure({
  path: ["trim"],
  input: TrimInputSchema,
  output: anySchema as any,
  metadata: {
    description: "Trim whitespace from string",
    tags: ["core", "string"],
  },
  handler: async (input: TrimInput): Promise<string> => {
    const side = input.side ?? "both";
    switch (side) {
      case "start":
        return input.value.trimStart();
      case "end":
        return input.value.trimEnd();
      default:
        return input.value.trim();
    }
  },
});

// =============================================================================
// ToLower Procedure
// =============================================================================

interface ToLowerInput {
  value: string;
}

const ToLowerInputSchema = z.object({
  value: z.string().describe("The value"),
});

type ToLowerProcedure = Procedure<ToLowerInput, string, { description: string; tags: string[] }>;

const toLowerProcedure: ToLowerProcedure = defineProcedure({
  path: ["toLower"],
  input: ToLowerInputSchema,
  output: anySchema as any,
  metadata: {
    description: "Convert string to lowercase",
    tags: ["core", "string"],
  },
  handler: async (input: ToLowerInput): Promise<string> => {
    return input.value.toLowerCase();
  },
});

// =============================================================================
// ToUpper Procedure
// =============================================================================

interface ToUpperInput {
  value: string;
}

const ToUpperInputSchema = z.object({
  value: z.string().describe("The value"),
});

type ToUpperProcedure = Procedure<ToUpperInput, string, { description: string; tags: string[] }>;

const toUpperProcedure: ToUpperProcedure = defineProcedure({
  path: ["toUpper"],
  input: ToUpperInputSchema,
  output: anySchema as any,
  metadata: {
    description: "Convert string to uppercase",
    tags: ["core", "string"],
  },
  handler: async (input: ToUpperInput): Promise<string> => {
    return input.value.toUpperCase();
  },
});

// =============================================================================
// StartsWith Procedure
// =============================================================================

interface StartsWithInput {
  value: string;
  search: string;
}

const StartsWithInputSchema = z.object({
  value: z.string().describe("The value"),
  search: z.string().describe("The text to find"),
});

type StartsWithProcedure = Procedure<StartsWithInput, boolean, { description: string; tags: string[] }>;

const startsWithProcedure: StartsWithProcedure = defineProcedure({
  path: ["startsWith"],
  input: StartsWithInputSchema,
  output: anySchema as any,
  metadata: {
    description: "Check if string starts with search string",
    tags: ["core", "string"],
  },
  handler: async (input: StartsWithInput): Promise<boolean> => {
    return input.value.startsWith(input.search);
  },
});

// =============================================================================
// EndsWith Procedure
// =============================================================================

interface EndsWithInput {
  value: string;
  search: string;
}

const EndsWithInputSchema = z.object({
  value: z.string().describe("The value"),
  search: z.string().describe("The text to find"),
});

type EndsWithProcedure = Procedure<EndsWithInput, boolean, { description: string; tags: string[] }>;

const endsWithProcedure: EndsWithProcedure = defineProcedure({
  path: ["endsWith"],
  input: EndsWithInputSchema,
  output: anySchema as any,
  metadata: {
    description: "Check if string ends with search string",
    tags: ["core", "string"],
  },
  handler: async (input: EndsWithInput): Promise<boolean> => {
    return input.value.endsWith(input.search);
  },
});

// =============================================================================
// Includes Procedure
// =============================================================================

interface IncludesInput {
  value: string;
  search: string;
}

const IncludesInputSchema = z.object({
  value: z.string().describe("The value"),
  search: z.string().describe("The text to find"),
});

type IncludesProcedure = Procedure<IncludesInput, boolean, { description: string; tags: string[] }>;

const includesProcedure: IncludesProcedure = defineProcedure({
  path: ["includes"],
  input: IncludesInputSchema,
  output: anySchema as any,
  metadata: {
    description: "Check if string contains search string",
    tags: ["core", "string"],
  },
  handler: async (input: IncludesInput): Promise<boolean> => {
    return input.value.includes(input.search);
  },
});

// =============================================================================
// StrLength Procedure
// =============================================================================

interface StrLengthInput {
  value: string;
}

const StrLengthInputSchema = z.object({
  value: z.string().describe("The value"),
});

type StrLengthProcedure = Procedure<StrLengthInput, number, { description: string; tags: string[] }>;

const strLengthProcedure: StrLengthProcedure = defineProcedure({
  path: ["strLength"],
  input: StrLengthInputSchema,
  output: anySchema as any,
  metadata: {
    description: "Get string length",
    tags: ["core", "string"],
  },
  handler: async (input: StrLengthInput): Promise<number> => {
    return input.value.length;
  },
});

// =============================================================================
// Template Procedure
// =============================================================================

interface TemplateInput {
  template: string;
  values: Record<string, unknown>;
}

const TemplateInputSchema = z.object({
  template: z.string().describe("The template text, with {name} placeholders"),
  values: z.record(z.string(), z.unknown()).describe("The values"),
});

type TemplateProcedure = Procedure<TemplateInput, string, { description: string; tags: string[] }>;

const templateProcedure: TemplateProcedure = defineProcedure({
  path: ["template"],
  input: TemplateInputSchema,
  output: anySchema as any,
  metadata: {
    description: "String interpolation with {{key}} placeholders",
    tags: ["core", "string"],
  },
  handler: async (input: TemplateInput): Promise<string> => {
    let result = input.template;
    for (const [key, value] of Object.entries(input.values)) {
      result = result.split(`{{${key}}}`).join(String(value));
    }
    return result;
  },
});

// =============================================================================
// Export String Procedures
// =============================================================================

/**
 * All string procedures (before namespacing).
 */
const stringProceduresRaw: AnyProcedure[] = [
  concatProcedure as AnyProcedure,
  splitProcedure as AnyProcedure,
  joinProcedure as AnyProcedure,
  replaceProcedure as AnyProcedure,
  substringProcedure as AnyProcedure,
  trimProcedure as AnyProcedure,
  toLowerProcedure as AnyProcedure,
  toUpperProcedure as AnyProcedure,
  startsWithProcedure as AnyProcedure,
  endsWithProcedure as AnyProcedure,
  includesProcedure as AnyProcedure,
  strLengthProcedure as AnyProcedure,
  templateProcedure as AnyProcedure,
];

/**
 * All string procedures namespaced under "client".
 */
export const stringProcedures: AnyProcedure[] = namespace(["client"], stringProceduresRaw);

/**
 * String procedures module for registration.
 */
export const stringModule: { name: string; procedures: AnyProcedure[] } = {
  name: "client-string",
  procedures: stringProcedures,
};

// Re-export individual procedures for direct access
export {
  concatProcedure,
  splitProcedure,
  joinProcedure,
  replaceProcedure,
  substringProcedure,
  trimProcedure,
  toLowerProcedure,
  toUpperProcedure,
  startsWithProcedure,
  endsWithProcedure,
  includesProcedure,
  strLengthProcedure,
  templateProcedure,
};
