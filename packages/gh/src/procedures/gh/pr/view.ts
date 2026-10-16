/**
 * gh.pr.view procedure
 *
 * One pull request
 */

import type { ProcedureContext } from "@procedures/client";
import type { GhPrViewInput, GhPrViewOutput } from "../../../types.js";
import { ghArg, ghJson, repoArgs } from "../shared.js";

const FIELDS = "number,title,state,url,body,author,headRefName,baseRefName,isDraft,mergeable,reviewDecision,additions,deletions,changedFiles,createdAt,updatedAt";

/**
 * One pull request
 */
export async function ghPrView(input: GhPrViewInput, ctx: ProcedureContext): Promise<GhPrViewOutput> {
  const args = ["pr", "view", ghArg("pr", input.pr), "--json", FIELDS, ...repoArgs(input)];
  return { item: await ghJson<Record<string, unknown>>(args, input, ctx) };
}
