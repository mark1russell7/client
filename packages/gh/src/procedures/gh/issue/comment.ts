/**
 * gh.issue.comment procedure
 *
 * Add a comment to an issue or a pull request
 */

import type { ProcedureContext } from "@procedures/client";
import type { GhIssueCommentInput, GhIssueCommentOutput } from "../../../types.js";
import { ghArg, repoArgs, runGh, urlOf } from "../shared.js";

/**
 * Add a comment to an issue or a pull request
 */
export async function ghIssueComment(input: GhIssueCommentInput, ctx: ProcedureContext): Promise<GhIssueCommentOutput> {
  const args = ["issue", "comment", ghArg("issue", input.issue), "--body", input.body, ...repoArgs(input)];
  return { url: urlOf(await runGh(args, input, ctx)) };
}
