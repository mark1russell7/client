/**
 * gh.run.rerun procedure
 *
 * Run a workflow run again
 */

import type { ProcedureContext } from "@procedures/client";
import type { GhRunRerunInput, GhRunRerunOutput } from "../../../types.js";
import { repoArgs, runGh } from "../shared.js";

/**
 * Run a workflow run again
 */
export async function ghRunRerun(input: GhRunRerunInput, ctx: ProcedureContext): Promise<GhRunRerunOutput> {
  const args = ["run", "rerun", String(input.run), ...repoArgs(input)];
  if (input.failedOnly) args.push("--failed");
  await runGh(args, input, ctx);
  return { run: input.run };
}
