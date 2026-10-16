/**
 * The types and schemas of the procedures of this package: `program.check`, `program.compile`,
 * `program.diagram`, `program.explain`, `sdk.openrpc` and `sdk.typescript`.
 *
 * mark procedure new adds the types of each new procedure here.
 */

import { z } from "zod";
import type { Capability, PermittedEffects } from "@procedures/client/browser";
import type { Diagnostic } from "./diagnostics.js";

// =============================================================================
// Shared parts
// =============================================================================

/** The JSON form of a capability: the effects that the run can have. */
export interface CapabilityInput {
  clearance?: unknown;
  effects?:
    | {
        reads?: string[] | "any" | undefined;
        writes?: string[] | "any" | undefined;
        destructive?: boolean | undefined;
      }
    | undefined;
  deadline?: number | undefined;
}

const PermitSchema = z.union([z.array(z.string()), z.literal("any")]);

/** The schema of a capability in the input of the procedures. */
export const CapabilityInputSchema: z.ZodType<CapabilityInput> = z
  .object({
    clearance: z.unknown().optional().describe("The clearance of the run"),
    effects: z
      .object({
        reads: PermitSchema.optional().describe('The resources that a call can read: names, or "any"'),
        writes: PermitSchema.optional().describe('The resources that a call can change: names, or "any". An empty list: no change.'),
        destructive: z.boolean().optional().describe("False: a call cannot start a destructive procedure"),
      })
      .optional()
      .describe("The effects that the calls can have. Absent: all effects."),
    deadline: z.number().optional().describe("The deadline (the static check does not use it)"),
  })
  .describe("The capability of the run. Absent: the capability of the caller.") as z.ZodType<CapabilityInput>;

/** This function makes a capability from its JSON form. */
export function toCapability(input: CapabilityInput): Capability<unknown> {
  const effects: { reads?: readonly string[] | "any"; writes?: readonly string[] | "any"; destructive?: boolean } = {};
  if (input.effects?.reads !== undefined) effects.reads = input.effects.reads;
  if (input.effects?.writes !== undefined) effects.writes = input.effects.writes;
  if (input.effects?.destructive !== undefined) effects.destructive = input.effects.destructive;
  return {
    ...(input.clearance !== undefined ? { clearance: input.clearance } : {}),
    ...(input.effects ? { effects: effects as PermittedEffects } : {}),
    ...(input.deadline !== undefined ? { deadline: input.deadline } : {}),
  };
}

/** The effects of a program, in the output of the procedures. */
export interface EffectsOutput {
  reads?: string[] | undefined;
  writes?: string[] | undefined;
  destructive?: boolean | undefined;
  idempotent?: boolean | undefined;
}

const EffectsOutputSchema = z
  .object({
    reads: z.array(z.string()).optional().describe("The resources that a run can read. Absent: not known."),
    writes: z.array(z.string()).optional().describe("The resources that a run can change. Absent: not known."),
    destructive: z.boolean().optional().describe("True: a call can delete or overwrite data"),
    idempotent: z.boolean().optional().describe("True: each call that changes data is idempotent"),
  })
  .describe("The effects that a run can have (the upper bound)");

const MustEffectsSchema = z
  .object({
    reads: z.array(z.string()).describe("The resources that each run reads"),
    writes: z.array(z.string()).describe("The resources that each run changes"),
  })
  .describe("The effects of each run in which no call fails (the lower bound)");

const DiagnosticSchema = z.object({
  severity: z.enum(["error", "warning", "info"]).describe("An error stops the program"),
  code: z.string().describe("The code of the problem, for example unknown-name"),
  message: z.string().describe("The text of the problem"),
  pointer: z.string().describe("The JSON pointer of the part of the program"),
});

const ProgramField = z.unknown().describe("The program: a call ({ $proc, input }). The procedure reads it as data: nothing in it starts.");
const ModeField = z
  .enum(["exec", "body"])
  .optional()
  .describe("exec (the default): the program runs as client.exec runs it. body: as the body of a defined procedure, with input in scope.");

// =============================================================================
// program.check Types - Check a program before it runs
// =============================================================================

/** The input of `program.check`. */
export interface ProgramCheckInput {
  program: unknown;
  capability?: CapabilityInput | undefined;
  mode?: "exec" | "body" | undefined;
}

export const ProgramCheckInputSchema: z.ZodType<ProgramCheckInput> = z.object({
  program: ProgramField,
  capability: CapabilityInputSchema.optional(),
  mode: ModeField,
}) as z.ZodType<ProgramCheckInput>;

/** The output of `program.check`. */
export interface ProgramCheckOutput {
  ok: boolean;
  effects: EffectsOutput;
  mustEffects: { reads: string[]; writes: string[] };
  diagnostics: Diagnostic[];
  registryHash: string;
}

const checkOutputFields = {
  ok: z.boolean().describe("True when no diagnostic is an error: then the host can start the program"),
  effects: EffectsOutputSchema,
  mustEffects: MustEffectsSchema,
  diagnostics: z.array(DiagnosticSchema).describe("The problems, in the order of the program"),
  registryHash: z.string().describe("The hash of the manifest that the check used"),
};

export const ProgramCheckOutputSchema: z.ZodType<ProgramCheckOutput> = z.object(checkOutputFields) as z.ZodType<ProgramCheckOutput>;

// =============================================================================
// program.compile Types - Compile a program to a JavaScript function
// =============================================================================

/** The input of `program.compile`. */
export interface ProgramCompileInput extends ProgramCheckInput {
  fold?: boolean | undefined;
  language?: "js" | "ts" | undefined;
}

export const ProgramCompileInputSchema: z.ZodType<ProgramCompileInput> = z.object({
  program: ProgramField,
  capability: CapabilityInputSchema.optional(),
  mode: ModeField,
  fold: z.boolean().optional().describe("True: compute the pure core calls with literal inputs now"),
  language: z.enum(["js", "ts"]).optional().describe("The language of the code: js (the default) or ts"),
}) as z.ZodType<ProgramCompileInput>;

/** The output of `program.compile`. */
export interface ProgramCompileOutput extends ProgramCheckOutput {
  code: string;
  sourceMap: Array<{ line: number; pointer: string }>;
  folded: string[];
}

export const ProgramCompileOutputSchema: z.ZodType<ProgramCompileOutput> = z.object({
  ...checkOutputFields,
  code: z.string().describe("The ES module: its default export is async (ctx, input) => output"),
  sourceMap: z
    .array(z.object({ line: z.number().describe("The line of the code, from 1"), pointer: z.string().describe("The JSON pointer of the part of the program") }))
    .describe("The lines of the code that start a part of the program"),
  folded: z.array(z.string()).describe("The pointers of the calls that the fold pass computed"),
}) as z.ZodType<ProgramCompileOutput>;

// =============================================================================
// program.diagram Types - Draw a program as a Mermaid flowchart
// =============================================================================

/** The input of `program.diagram`. */
export interface ProgramDiagramInput {
  program: unknown;
  mode?: "exec" | "body" | undefined;
  direction?: "TD" | "LR" | undefined;
}

export const ProgramDiagramInputSchema: z.ZodType<ProgramDiagramInput> = z.object({
  program: ProgramField,
  mode: ModeField,
  direction: z.enum(["TD", "LR"]).optional().describe("The direction of the flowchart: TD (from the top down, the default) or LR (from left to right)"),
}) as z.ZodType<ProgramDiagramInput>;

/** The output of `program.diagram`. */
export interface ProgramDiagramOutput {
  mermaid: string;
  diagnostics: Diagnostic[];
}

export const ProgramDiagramOutputSchema: z.ZodType<ProgramDiagramOutput> = z.object({
  mermaid: z.string().describe("The Mermaid flowchart of the program. A node with an error has the class error."),
  diagnostics: z.array(DiagnosticSchema).describe("The problems that the check found, in the order of the program"),
}) as z.ZodType<ProgramDiagramOutput>;

// =============================================================================
// program.explain Types - Explain a program: its effects, each call and its refusal under the capability
// =============================================================================

/** The input of `program.explain`. */
export type ProgramExplainInput = ProgramCheckInput;

export const ProgramExplainInputSchema: z.ZodType<ProgramExplainInput> = z.object({
  program: ProgramField,
  capability: CapabilityInputSchema.optional(),
  mode: ModeField,
}) as z.ZodType<ProgramExplainInput>;

/** The explanation of one call, in the output of `program.explain`. */
export interface CallExplanationOutput {
  key: string;
  path: string[];
  pointer: string;
  kind: "call" | "control" | "dynamic";
  effects?: EffectsOutput | undefined;
  known: boolean;
  exposed: boolean;
  permitted: boolean;
  reason?: "effects-undeclared" | "effects-exceeded" | "clearance" | "deadline" | "not-found" | undefined;
  message: string;
}

const DeclaredEffectsSchema = z
  .object({
    reads: z.array(z.string()).optional().describe("The resources that the procedure can read. Absent: not declared."),
    writes: z.array(z.string()).optional().describe("The resources that the procedure can change. Absent: not declared."),
    destructive: z.boolean().optional().describe("True: the procedure can delete or overwrite data"),
    idempotent: z.boolean().optional().describe("True: a second call with the same input changes nothing more"),
  })
  .describe("The effects that the procedure declares. Absent: the procedure declares none.");

const CallExplanationSchema = z.object({
  key: z.string().describe("The key of the procedure: its path with dots"),
  path: z.array(z.string()).describe("The path of the procedure"),
  pointer: z.string().describe("The JSON pointer of the call in the program"),
  kind: z.enum(["call", "control", "dynamic"]).describe("call, a control-flow call, or a dynamic call whose input is a program"),
  effects: DeclaredEffectsSchema.optional(),
  known: z.boolean().describe("True when the host has a procedure at the path"),
  exposed: z.boolean().describe("True when the host has the procedure and lets a program call it"),
  permitted: z.boolean().describe("True when the capability permits the call"),
  reason: z
    .enum(["effects-undeclared", "effects-exceeded", "clearance", "deadline", "not-found"])
    .optional()
    .describe("The reason of a refusal, or not-found for a path without a procedure"),
  message: z.string().describe("The answer of the capability in words"),
});

/** The output of `program.explain`. */
export interface ProgramExplainOutput extends ProgramCheckOutput {
  calls: CallExplanationOutput[];
  summary: string;
}

export const ProgramExplainOutputSchema: z.ZodType<ProgramExplainOutput> = z.object({
  ...checkOutputFields,
  calls: z.array(CallExplanationSchema).describe("The calls of the program, in the order of the tree: a call comes before the calls of its input"),
  summary: z.string().describe("The explanation in short sentences"),
}) as z.ZodType<ProgramExplainOutput>;

// =============================================================================
// sdk.openrpc Types - Describe the procedures of the registry as an OpenRPC document
// =============================================================================

/** The input of `sdk.openrpc` and `sdk.typescript`. */
export interface SdkInput {
  namespace?: string | undefined;
}

const SdkInputSchema: z.ZodType<SdkInput> = z.object({
  namespace: z.string().optional().describe("Only the procedures under this first path segment"),
}) as z.ZodType<SdkInput>;

/** The input of `sdk.openrpc`. */
export type SdkOpenrpcInput = SdkInput;

export const SdkOpenrpcInputSchema: z.ZodType<SdkOpenrpcInput> = SdkInputSchema;

/** The output of `sdk.openrpc`: an OpenRPC 1.3 document. */
export interface SdkOpenrpcOutput {
  openrpc: string;
  info: { title: string; version: string; description?: string | undefined };
  methods: Array<Record<string, unknown>>;
}

export const SdkOpenrpcOutputSchema: z.ZodType<SdkOpenrpcOutput> = z.object({
  openrpc: z.string().describe("The version of the OpenRPC specification"),
  info: z
    .object({
      title: z.string().describe("The title of the document"),
      version: z.string().describe("The version of the document: the hash of the manifest"),
      description: z.string().optional().describe("The description of the document"),
    })
    .describe("The information about the document"),
  methods: z
    .array(z.record(z.string(), z.unknown()))
    .describe("One method for each procedure, in the order of the names: params, result, x-path and x-effects"),
}) as z.ZodType<SdkOpenrpcOutput>;

// =============================================================================
// sdk.typescript Types - Write a typed TypeScript SDK for the procedures of the registry
// =============================================================================

/** The input of `sdk.typescript`. */
export type SdkTypescriptInput = SdkInput;

export const SdkTypescriptInputSchema: z.ZodType<SdkTypescriptInput> = SdkInputSchema;

/** The output of `sdk.typescript`. */
export interface SdkTypescriptOutput {
  code: string;
  procedures: number;
  registryHash: string;
}

export const SdkTypescriptOutputSchema: z.ZodType<SdkTypescriptOutput> = z.object({
  code: z.string().describe("The source of the TypeScript module: the types, the interface Sdk and the function createSdk"),
  procedures: z.number().describe("The number of procedures in the SDK"),
  registryHash: z.string().describe("The hash of the manifest that the SDK comes from"),
}) as z.ZodType<SdkTypescriptOutput>;
