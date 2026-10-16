/**
 * npm.distTags.list procedure
 *
 * List the dist-tags of a package. `npm dist-tag ls` writes one line for each tag,
 * "tag: version", and `tags` has them as an object.
 */

import type { ProcedureContext } from "@procedures/client";
import { accountOptions, npmArg, runNpm } from "../shared.js";
import type { NpmDistTagsListInput, NpmDistTagsListOutput } from "../../../types.js";

/** This function reads the lines of `npm dist-tag ls`: "latest: 1.2.0". */
export function parseDistTags(stdout: string): Record<string, string> {
  const tags: Record<string, string> = {};
  for (const line of stdout.split(/\r?\n/)) {
    const match = /^([^:\s]+):\s*(\S+)\s*$/.exec(line);
    if (match) tags[match[1]!] = match[2]!;
  }
  return tags;
}

/**
 * List the dist-tags of a package
 *
 * @example
 * const { tags } = await client.call(["npm", "distTags", "list"], { package: "zod" });
 */
export async function npmDistTagsList(input: NpmDistTagsListInput, ctx: ProcedureContext): Promise<NpmDistTagsListOutput> {
  const args = ["dist-tag", "ls", ...accountOptions(input), "--", npmArg("package", input.package)];
  const result: NpmDistTagsListOutput = await runNpm(args, input, ctx);
  if (result.success) result.tags = parseDistTags(result.stdout);
  return result;
}
