/**
 * gh.pr.list procedure
 *
 * The pull requests of a repository
 */

import type { ProcedureContext } from "@procedures/client";
import type { GhPrListInput, GhPrListOutput } from "../../../types.js";
import { ghArg, ghJson, listArgs, repoArgs } from "../shared.js";

export const PR_FIELDS = "number,title,state,url,author,headRefName,baseRefName,isDraft,createdAt,updatedAt";

/**
 * The pull requests of a repository
 */
export async function ghPrList(input: GhPrListInput, ctx: ProcedureContext): Promise<GhPrListOutput> {
  const args = ["pr", "list", "--json", PR_FIELDS, "--state", input.state ?? "open", ...listArgs(input), ...repoArgs(input)];
  if (input.author !== undefined) args.push("--author", ghArg("author", input.author));
  if (input.base !== undefined) args.push("--base", ghArg("base", input.base));
  if (input.head !== undefined) args.push("--head", ghArg("head", input.head));
  return { items: await ghJson<Array<Record<string, unknown>>>(args, input, ctx) };
}
