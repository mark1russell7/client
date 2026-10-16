/**
 * git.init procedure
 *
 * Initialize a git repository
 *
 * The procedure looks for `.git` in the folder itself. Before, it called `fs.exists` through
 * `ctx.client`, so a registry of `gitModule` alone (`createRegistry(gitModule)`) did not have the
 * procedure that it called, and `git.init` always failed there (roadmap R33).
 */

import { access } from "node:fs/promises";
import { join, resolve } from "node:path";
import { git, type GitContext } from "./run.js";
import type { GitInitInput, GitInitOutput } from "../../types.js";

/**
 * Initialize a git repository
 */
export async function gitInit(input: GitInitInput, ctx: GitContext = {}): Promise<GitInitOutput> {
  const cwd = input.cwd ? resolve(input.cwd) : process.cwd();

  // Check if already a git repo (as fs.exists did: an error of the check means "no")
  const gitDir = join(cwd, ".git");
  const alreadyExists = await access(gitDir).then(
    () => true,
    () => false,
  );

  if (!alreadyExists) {
    const args: string[] = ["init"];
    if (input.bare) {
      args.push("--bare");
    }
    if (input.initialBranch) {
      args.push(`--initial-branch=${input.initialBranch}`);
    }
    await git(args, { cwd, signal: ctx.signal });
  }

  return {
    path: cwd,
    created: !alreadyExists,
  };
}
