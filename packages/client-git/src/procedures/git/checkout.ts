/**
 * git.checkout procedure
 *
 * Checkout branch or files
 */

import { execFileSync } from "node:child_process";
import { gitArg } from "./args.js";
import type { GitCheckoutInput, GitCheckoutOutput } from "../../types.js";

/**
 * Checkout branch or files
 */
export async function gitCheckout(input: GitCheckoutInput): Promise<GitCheckoutOutput> {
  const { ref, create, paths, cwd } = input;
  const opts = { cwd, encoding: "utf8" as const };

  const args: string[] = ["checkout"];
  if (create) args.push("-b");
  args.push(gitArg("ref", ref));
  if (paths && paths.length > 0) {
    args.push("--", ...paths);
  }

  execFileSync("git", args, opts);

  return { ref, created: create };
}
