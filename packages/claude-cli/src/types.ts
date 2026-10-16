/**
 * The input and the output of the procedures of this package.
 */

import { z } from "zod";
import type { TurnEvent } from "./turn.js";

/** The schema of one event. It keeps each field of the event. */
const ClaudeEventSchema = z.looseObject({
  type: z.string().describe("meta, text, text-delta, thinking, tool-use, tool-result, result, log or error"),
});

/** The schema of one event of a turn, with the byte offset after its line. */
export const TurnEventSchema: z.ZodType<TurnEvent> = z.object({
  offset: z.number().describe("The byte offset after the line of the event"),
  event: ClaudeEventSchema,
}) as unknown as z.ZodType<TurnEvent>;

const pidSchema = z.number().int().min(2).describe("The process id of the turn");
const offsetSchema = z.number().int().min(0).describe("The byte offset to start from (default: 0)");

// =============================================================================
// claude.start: start one turn as a detached process that writes to a file
// =============================================================================

export interface ClaudeStartInput {
  prompt: string;
  cwd?: string | undefined;
  args?: string[] | undefined;
  outputFile?: string | undefined;
  promptFile?: string | undefined;
  executable?: string | undefined;
  executableArgs?: string[] | undefined;
  env?: Record<string, string> | undefined;
}

export const ClaudeStartInputSchema: z.ZodType<ClaudeStartInput> = z.object({
  prompt: z.string().min(1).describe("The prompt of the turn"),
  cwd: z.string().min(1).optional().describe("The working folder of the turn"),
  args: z.array(z.string()).optional().describe('More arguments, for example ["--resume", "<session>"] or ["--model", "<name>"]'),
  outputFile: z.string().min(1).optional().describe("The file that gets the output (default: a file in a new temporary folder)"),
  promptFile: z.string().min(1).optional().describe("The file that holds the prompt (default: <outputFile>.prompt.txt)"),
  executable: z.string().min(1).optional().describe("The claude program (default: CLAUDE_BIN, then a search)"),
  executableArgs: z.array(z.string()).optional().describe("The arguments before the flags, for example the path of cli.js"),
  env: z.record(z.string(), z.string()).optional().describe("Environment variables to add to the environment of the host"),
});

export interface ClaudeStartOutput {
  pid: number;
  outputFile: string;
  promptFile: string;
  offset: number;
  command: string;
  args: readonly string[];
  startedAt: string;
}

export const ClaudeStartOutputSchema: z.ZodType<ClaudeStartOutput> = z.object({
  pid: z.number().describe("The process id of the turn"),
  outputFile: z.string().describe("The absolute path of the output file"),
  promptFile: z.string().describe("The absolute path of the prompt file"),
  offset: z.number().describe("The byte offset where the output of this turn starts"),
  command: z.string().describe("The program"),
  args: z.array(z.string()).describe("The arguments of the program"),
  startedAt: z.string().describe("The start time (ISO 8601)"),
});

// =============================================================================
// claude.read: read the new events of a turn from its output file
// =============================================================================

export interface ClaudeReadInput {
  outputFile: string;
  offset?: number | undefined;
  pid?: number | undefined;
}

export const ClaudeReadInputSchema: z.ZodType<ClaudeReadInput> = z.object({
  outputFile: z.string().min(1).describe("The output file of the turn"),
  offset: offsetSchema.optional(),
  pid: pidSchema.optional(),
});

export interface ClaudeReadOutput {
  events: TurnEvent[];
  offset: number;
  finished: boolean;
  running?: boolean | undefined;
  newBytes: number;
}

export const ClaudeReadOutputSchema: z.ZodType<ClaudeReadOutput> = z.object({
  events: z.array(TurnEventSchema).describe("The new events"),
  offset: z.number().describe("The byte offset for the next read"),
  finished: z.boolean().describe("True when the events include the result of the turn"),
  running: z.boolean().optional().describe("True when the process runs (only with pid)"),
  newBytes: z.number().describe("The number of new bytes in the file"),
});

// =============================================================================
// claude.follow: stream the events of a turn until the turn ends
// =============================================================================

export interface ClaudeFollowInput {
  outputFile: string;
  offset?: number | undefined;
  pid?: number | undefined;
  pollMs?: number | undefined;
}

export const ClaudeFollowInputSchema: z.ZodType<ClaudeFollowInput> = z.object({
  outputFile: z.string().min(1).describe("The output file of the turn"),
  offset: offsetSchema.optional(),
  pid: pidSchema.optional().describe("The process id of the turn. Without it, only the result stops the follow."),
  pollMs: z.number().int().min(10).max(60_000).optional().describe("The time between two reads, in milliseconds (default: 250)"),
});

export type ClaudeFollowOutput = TurnEvent;

export const ClaudeFollowOutputSchema: z.ZodType<ClaudeFollowOutput> = TurnEventSchema;

// =============================================================================
// claude.cancel: stop a turn and the processes that it started
// =============================================================================

export interface ClaudeCancelInput {
  pid: number;
}

export const ClaudeCancelInputSchema: z.ZodType<ClaudeCancelInput> = z.object({
  pid: pidSchema,
});

export interface ClaudeCancelOutput {
  stopped: boolean;
  reason?: string | undefined;
}

export const ClaudeCancelOutputSchema: z.ZodType<ClaudeCancelOutput> = z.object({
  stopped: z.boolean().describe("True when the stop reached the process"),
  reason: z.string().optional().describe("Why the stop did not occur"),
});
