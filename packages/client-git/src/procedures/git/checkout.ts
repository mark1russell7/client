/**
 * git.checkout procedure
 *
 * Checkout branch or files
 */

import { gitArg } from "./args.js";
import { git, type GitContext } from "./run.js";
import type { GitCheckoutInput, GitCheckoutOutput } from "../../types.js";

/**
 * Checkout branch or files
 */
export async function gitCheckout(input: GitCheckoutInput, ctx: GitContext = {}): Promise<GitCheckoutOutput> {
  const { ref, create, paths, cwd } = input;

  const args: string[] = ["checkout"];
  if (create) args.push("-b");
  args.push(gitArg("ref", ref));
  if (paths && paths.length > 0) {
    args.push("--", ...paths);
  }

  await git(args, { cwd, signal: ctx.signal });

  return { ref, created: create };
}
