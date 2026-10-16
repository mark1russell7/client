/**
 * gh.workflow.run procedure
 *
 * Start a workflow run: a `workflow_dispatch` event
 */

import type { ProcedureContext } from "@procedures/client";
import type { GhWorkflowRunInput, GhWorkflowRunOutput } from "../../../types.js";
import { fieldArg, ghArg, repoArgs, runGh } from "../shared.js";

/**
 * This function starts a workflow run with `gh workflow run`. Each input goes as `-f key=value`.
 * When GitHub gives the new run, gh prints its URL, and the output has the URL and the run id.
 */
export async function ghWorkflowRun(input: GhWorkflowRunInput, ctx: ProcedureContext): Promise<GhWorkflowRunOutput> {
  const args = ["workflow", "run", ghArg("workflow", input.workflow), ...repoArgs(input)];
  if (input.ref !== undefined) args.push("--ref", ghArg("ref", input.ref));
  // -f gives each value as a string. -F reads a value that starts with "@" from a file, so it is not used.
  for (const [key, value] of Object.entries(input.inputs ?? {})) args.push("-f", fieldArg("input", key, value));
  const output = await runGh(args, input, ctx);

  const result: GhWorkflowRunOutput = { workflow: input.workflow };
  if (input.ref !== undefined) result.ref = input.ref;
  const url = output.split(/\r?\n/).find((line) => /^https:\/\/\S+\/actions\/runs\/\d+/.test(line.trim()))?.trim();
  if (url !== undefined) {
    result.url = url;
    result.run = Number(/\/actions\/runs\/(\d+)/.exec(url)![1]);
  }
  return result;
}
