/**
 * git.tag.add procedure
 *
 * Make a tag (roadmap R40). An existing tag is an error: the procedure never moves a tag.
 */

import { gitArg } from "../args.js";
import { git, type GitContext } from "../run.js";
import { commitOf } from "../refs.js";
import type { GitTagAddInput, GitTagAddOutput } from "../../../types.js";

/**
 * Make a tag
 */
export async function gitTagAdd(input: GitTagAddInput, ctx: GitContext = {}): Promise<GitTagAddOutput> {
  const { name, ref, message, cwd } = input;
  const run = { cwd, signal: ctx.signal };

  const args = ["tag"];
  // With -m, git makes an annotated tag and does not start an editor
  if (message !== undefined) args.push("-a", "-m", message);
  args.push(gitArg("name", name));
  if (ref) args.push(gitArg("ref", ref));
  await git(args, run);

  return { name, hash: await commitOf(`refs/tags/${name}`, run), annotated: message !== undefined };
}
