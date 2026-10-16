/**
 * Helpers of the git procedures of roadmap R40: the current branch, the hash of a ref, the
 * files with conflicts, and the stop of a merge or a rebase on conflicts.
 */

import { gitArg } from "./args.js";
import { git, GitError, zFields, type GitRunOptions } from "./run.js";

/**
 * The current branch, or "HEAD" when HEAD is detached.
 *
 * `git rev-parse --abbrev-ref HEAD` fails in a repository without commits (roadmap R33), because
 * HEAD names a branch that does not exist yet. `git symbolic-ref` reads the name that HEAD
 * holds, so it works there too. It fails only for a detached HEAD.
 */
export async function currentBranch(run: GitRunOptions): Promise<string> {
  try {
    return (await git(["symbolic-ref", "--quiet", "--short", "HEAD"], run)).trim();
  } catch (error) {
    if (!(error instanceof GitError)) throw error;
    // A detached HEAD: exit 1 and no message. Outside a repository: exit 128, and that is an error.
    if (error.exitCode === 1) return "HEAD";
    throw error;
  }
}

/** The hash of the commit of a ref (a tag gives its commit). It throws a `GitError` for an unknown ref. */
export async function commitOf(ref: string, run: GitRunOptions): Promise<string> {
  return (await git(["rev-parse", "--verify", `${gitArg("ref", ref)}^{commit}`], run)).trim();
}

/** The hash of HEAD. */
export async function headHash(run: GitRunOptions): Promise<string> {
  return (await git(["rev-parse", "--verify", "HEAD"], run)).trim();
}

/** The files that have conflicts, as `git diff --diff-filter=U` gives them. */
export async function conflictedFiles(run: GitRunOptions): Promise<string[]> {
  return zFields(await git(["diff", "--name-only", "--diff-filter=U", "-z"], run));
}

/**
 * True when a failed merge or rebase stopped on conflicts. Git writes "CONFLICT (content): ..."
 * to stdout, and "could not apply" to stderr. Any other failure (a working tree with changes, an
 * unknown ref) is an error of the call.
 */
export function stoppedOnConflict(error: unknown): boolean {
  return error instanceof GitError && /^CONFLICT \(|could not apply/im.test(`${error.stdout}\n${error.stderr}`);
}

/**
 * The environment of a merge or a rebase. Git does not start an editor for a message: it keeps
 * the message that it made. `GIT_EDITOR` overrides `core.editor` and `EDITOR` of the machine.
 */
export const NO_EDITOR: Record<string, string> = { GIT_EDITOR: "true" };
