/**
 * gh.release.view procedure
 *
 * One release: the release of a tag, or the latest release
 */

import type { ProcedureContext } from "@procedures/client";
import type { GhReleaseViewInput, GhReleaseViewOutput } from "../../../types.js";
import { ghArg, ghJson, repoArgs } from "../shared.js";

const FIELDS = "tagName,name,body,url,isDraft,isPrerelease,publishedAt,createdAt,author,assets";

/**
 * One release
 */
export async function ghReleaseView(input: GhReleaseViewInput, ctx: ProcedureContext): Promise<GhReleaseViewOutput> {
  const tag = input.tag === undefined ? [] : [ghArg("tag", input.tag)];
  const args = ["release", "view", ...tag, "--json", FIELDS, ...repoArgs(input)];
  return { item: await ghJson<Record<string, unknown>>(args, input, ctx) };
}
