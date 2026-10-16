/**
 * git.init procedure
 *
 * Initialize a git repository
 *
 * The procedure looks for `.git` in the folder itself. Before, it called `fs.exists` through
 * `ctx.client`, so a registry of `gitModule` alone (`createRegistry(gitModule)`) did not have the
 * procedure that it called, and `git.init` always failed there (roadmap R33).
 */

import { access, realpath } from "node:fs/promises";
import { join, resolve } from "node:path";
import { git, GitError, type GitContext } from "./run.js";
import type { GitInitInput, GitInitOutput } from "../../types.js";

/** True when two absolute paths name the same folder. Windows ignores the case of the letters. */
function samePath(a: string, b: string): boolean {
  return process.platform === "win32" ? resolve(a).toLowerCase() === resolve(b).toLowerCase() : resolve(a) === resolve(b);
}

/**
 * True when the folder is the root of a bare repository. A bare repository has no `.git`: its
 * `HEAD`, `objects` and `refs` are in the folder itself (roadmap R33).
 */
async function isBareRepositoryRoot(cwd: string, ctx: GitContext): Promise<boolean> {
  try {
    const bare = (await git(["rev-parse", "--is-bare-repository"], { cwd, signal: ctx.signal })).trim();
    if (bare !== "true") return false;
    const gitDir = (await git(["rev-parse", "--absolute-git-dir"], { cwd, signal: ctx.signal })).trim();
    return samePath(gitDir, await realpath(cwd));
  } catch (error) {
    // Outside a repository, git fails: the folder is not a repository
    if (error instanceof GitError) return false;
    throw error;
  }
}

/**
 * Initialize a git repository
 */
export async function gitInit(input: GitInitInput, ctx: GitContext = {}): Promise<GitInitOutput> {
  const cwd = input.cwd ? resolve(input.cwd) : process.cwd();
  // A repository with a work tree has .git in the folder: a folder, or a file for a worktree.
  // A bare repository is the folder itself. Before, git.init made a bare repository again.
  const alreadyExists =
    (await access(join(cwd, ".git")).then(
      () => true,
      () => false,
    )) || (await isBareRepositoryRoot(cwd, ctx));

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
