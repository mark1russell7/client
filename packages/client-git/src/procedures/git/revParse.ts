/**
 * git.revParse procedure
 *
 * Give the hash or the name of a ref (roadmap R40). With `--verify`, git gives exactly one value,
 * or fails for an unknown ref.
 */

import { gitArg } from "./args.js";
import { git, type GitContext } from "./run.js";
import type { GitRevParseInput, GitRevParseOutput } from "../../types.js";

/**
 * Give the hash or the name of a ref
 */
export async function gitRevParse(input: GitRevParseInput, ctx: GitContext = {}): Promise<GitRevParseOutput> {
  const ref = input.ref ?? "HEAD";
  const args = ["rev-parse", "--verify"];
  if (input.abbrevRef) args.push("--abbrev-ref");
  else if (input.short) args.push("--short");
  args.push(gitArg("ref", ref));

  const value = (await git(args, { cwd: input.cwd, signal: ctx.signal })).trim();
  return { ref, value };
}
