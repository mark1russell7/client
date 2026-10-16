/**
 * gh.issue.list procedure
 *
 * The issues of a repository
 */

import type { ProcedureContext } from "@procedures/client";
import type { GhIssueListInput, GhIssueListOutput } from "../../../types.js";
import { ghArg, ghJson, listArgs, repoArgs } from "../shared.js";

const FIELDS = "number,title,state,url,author,labels,assignees,createdAt,updatedAt";

/**
 * The issues of a repository
 */
export async function ghIssueList(input: GhIssueListInput, ctx: ProcedureContext): Promise<GhIssueListOutput> {
  const args = ["issue", "list", "--json", FIELDS, "--state", input.state ?? "open", ...listArgs(input), ...repoArgs(input)];
  if (input.label !== undefined) args.push("--label", ghArg("label", input.label));
  if (input.author !== undefined) args.push("--author", ghArg("author", input.author));
  return { items: await ghJson<Array<Record<string, unknown>>>(args, input, ctx) };
}
