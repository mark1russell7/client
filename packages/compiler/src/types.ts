/**
 * The types and schemas of the procedures of this package: `program.check` and `program.compile`.
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
