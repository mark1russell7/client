/**
 * git.tag.list procedure
 *
 * List the tags (roadmap R40).
 */

import { gitArg } from "../args.js";
import { git, type GitContext } from "../run.js";
import type { GitTagInfo, GitTagListInput, GitTagListOutput } from "../../../types.js";

/**
 * The fields of each tag, separated by NUL: the name, the type of the object, the commit of an
 * annotated tag, the object, and the subject of the message.
 */
const FORMAT = "--format=%(refname:strip=2)%00%(objecttype)%00%(*objectname)%00%(objectname)%00%(contents:subject)";

/**
 * List the tags
 */
export async function gitTagList(input: GitTagListInput, ctx: GitContext = {}): Promise<GitTagListOutput> {
  const args = ["tag", "--list", FORMAT];
  if (input.pattern) args.push(gitArg("pattern", input.pattern));

  const output = await git(args, { cwd: input.cwd, signal: ctx.signal });
  const tags: GitTagInfo[] = output
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => {
      const [name = "", type = "", peeled = "", object = "", subject = ""] = line.split("\0");
      const annotated = type === "tag";
      const tag: GitTagInfo = { name, hash: annotated && peeled ? peeled : object, annotated };
      if (annotated) tag.message = subject;
      return tag;
    });
  return { tags };
}
