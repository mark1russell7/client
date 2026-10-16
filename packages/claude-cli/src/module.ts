/**
 * The procedures of @procedures/claude-cli as data. An import of this file registers nothing.
 *
 * Scaffold a procedure with: mark procedure new <name> --path packages/claude-cli
 */

import {
  defineModule,
  registerModules,
  PROCEDURE_REGISTRY,
  type AnyProcedure,
  type ProcedureModule,
  type ProcedureRegistry,
  createProcedure,
  zodAdapter,
} from "@procedures/client";
import { claudeStart } from "./procedures/claude/start.js";
import { claudeRead } from "./procedures/claude/read.js";
import { claudeFollow } from "./procedures/claude/follow.js";
import { claudeCancel } from "./procedures/claude/cancel.js";
import {
  ClaudeStartInputSchema,
  ClaudeStartOutputSchema,
  ClaudeReadInputSchema,
  ClaudeReadOutputSchema,
  ClaudeFollowInputSchema,
  ClaudeFollowOutputSchema,
  ClaudeCancelInputSchema,
  ClaudeCancelOutputSchema,
  type ClaudeStartInput,
  type ClaudeStartOutput,
  type ClaudeReadInput,
  type ClaudeReadOutput,
  type ClaudeFollowInput,
  type ClaudeFollowOutput,
  type ClaudeCancelInput,
  type ClaudeCancelOutput,
} from "./types.js";

/** The effects of a read of the output file. The check of the process id reads the turn process. */
const READS_TURN = { reads: ["fs", "jobs"], writes: [] } as const;

export const claudeStartProcedure: AnyProcedure = createProcedure()
  .path(["claude", "start"])
  .input(zodAdapter<ClaudeStartInput>(ClaudeStartInputSchema))
  .output(zodAdapter<ClaudeStartOutput>(ClaudeStartOutputSchema))
  .meta({
    description: "Start one turn of the Claude Code CLI as a detached process that writes to a file",
    args: ["prompt"],
    shorts: { cwd: "C" },
    output: "json",
    // The agent of the turn can read and change files, start programs and use the network
    effects: { reads: ["fs", "network", "process"], writes: ["fs", "network", "process", "jobs"] },
  })
  .handler(async (input: ClaudeStartInput): Promise<ClaudeStartOutput> => claudeStart(input))
  .build() as AnyProcedure;

export const claudeReadProcedure: AnyProcedure = createProcedure()
  .path(["claude", "read"])
  .input(zodAdapter<ClaudeReadInput>(ClaudeReadInputSchema))
  .output(zodAdapter<ClaudeReadOutput>(ClaudeReadOutputSchema))
  .meta({
    description: "Read the new events of a turn from its output file",
    args: ["outputFile"],
    shorts: {},
    output: "json",
    effects: READS_TURN,
  })
  .handler(async (input: ClaudeReadInput): Promise<ClaudeReadOutput> => claudeRead(input))
  .build() as AnyProcedure;

export const claudeFollowProcedure: AnyProcedure = createProcedure()
  .path(["claude", "follow"])
  .input(zodAdapter<ClaudeFollowInput>(ClaudeFollowInputSchema))
  .output(zodAdapter<ClaudeFollowOutput>(ClaudeFollowOutputSchema))
  .meta({
    description: "Follow the output file of a turn and stream its events until the turn ends",
    args: ["outputFile"],
    shorts: {},
    output: "json",
    streaming: true,
    // A turn has no time limit: the stream ends with the turn
    stream: { unbounded: true },
    effects: READS_TURN,
  })
  .handler(claudeFollow)
  .build() as AnyProcedure;

export const claudeCancelProcedure: AnyProcedure = createProcedure()
  .path(["claude", "cancel"])
  .input(zodAdapter<ClaudeCancelInput>(ClaudeCancelInputSchema))
  .output(zodAdapter<ClaudeCancelOutput>(ClaudeCancelOutputSchema))
  .meta({
    description: "Stop a turn and the processes that it started",
    args: ["pid"],
    shorts: {},
    output: "json",
    // It stops the process tree of the id that it gets
    effects: { reads: ["jobs"], writes: ["jobs"], destructive: true, idempotent: true },
  })
  .handler(async (input: ClaudeCancelInput): Promise<ClaudeCancelOutput> => claudeCancel(input))
  .build() as AnyProcedure;

export const claudeCliProcedures: AnyProcedure[] = [claudeStartProcedure, claudeReadProcedure, claudeFollowProcedure, claudeCancelProcedure];

export const claudeCliModule: ProcedureModule = defineModule("@procedures/claude-cli", claudeCliProcedures);

export default claudeCliModule;

/**
 * This function registers the procedures of @procedures/claude-cli in a registry. The default is the
 * global registry.
 */
export function registerClaudeCliProcedures(registry: ProcedureRegistry = PROCEDURE_REGISTRY): void {
  registerModules(registry, [claudeCliModule]);
}
