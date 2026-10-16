/**
 * gh.release.list procedure
 *
 * The releases of a repository
 */

import type { ProcedureContext } from "@procedures/client";
import type { GhReleaseListInput, GhReleaseListOutput } from "../../../types.js";
import { ghJson, listArgs, repoArgs } from "../shared.js";

/**
 * The releases of a repository
 */
export async function ghReleaseList(input: GhReleaseListInput, ctx: ProcedureContext): Promise<GhReleaseListOutput> {
  const args = ["release", "list", "--json", "tagName,name,isDraft,isPrerelease,isLatest,publishedAt,createdAt", ...listArgs(input), ...repoArgs(input)];
  return { items: await ghJson<Array<Record<string, unknown>>>(args, input, ctx) };
}
