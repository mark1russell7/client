/**
 * gh.issue.view procedure
 *
 * One issue, with its comments
 */

import type { ProcedureContext } from "@procedures/client";
import type { GhIssueViewInput, GhIssueViewOutput } from "../../../types.js";
import { ghArg, ghJson, repoArgs } from "../shared.js";

const FIELDS = "number,title,state,url,body,author,labels,assignees,comments,createdAt,updatedAt";

/**
 * One issue
 */
export async function ghIssueView(input: GhIssueViewInput, ctx: ProcedureContext): Promise<GhIssueViewOutput> {
  const args = ["issue", "view", ghArg("issue", input.issue), "--json", FIELDS, ...repoArgs(input)];
  return { item: await ghJson<Record<string, unknown>>(args, input, ctx) };
}
