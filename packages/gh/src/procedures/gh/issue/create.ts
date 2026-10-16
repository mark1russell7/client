/**
 * gh.issue.create procedure
 *
 * Open an issue
 */

import type { ProcedureContext } from "@procedures/client";
import type { GhIssueCreateInput, GhIssueCreateOutput } from "../../../types.js";
import { ghArg, repoArgs, runGh, urlOf } from "../shared.js";

/**
 * Open an issue
 */
export async function ghIssueCreate(input: GhIssueCreateInput, ctx: ProcedureContext): Promise<GhIssueCreateOutput> {
  // --title and --body take their value as the next argument, so a value that starts with "-" is text
  const args = ["issue", "create", "--title", input.title, "--body", input.body, ...repoArgs(input)];
  for (const label of input.labels ?? []) args.push("--label", ghArg("label", label));
  return { url: urlOf(await runGh(args, input, ctx)) };
}
