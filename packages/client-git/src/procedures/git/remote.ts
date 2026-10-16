/**
 * git.remote and git.remote.set
 *
 * git.remote reads the URL of a remote. git.remote.set replaces it, or adds the remote. Two
 * procedures, so that a reader of the URL declares that it changes nothing (CAPABILITIES-2026-10).
 */

import { gitArg } from "./args.js";
import { git, GitError, type GitContext } from "./run.js";
import type { GitRemoteInput, GitRemoteOutput, GitRemoteSetInput } from "../../types.js";

/** This function gives the URL of a remote. */
export async function gitRemote(input: GitRemoteInput, ctx: GitContext = {}): Promise<GitRemoteOutput> {
  const { name, cwd } = input;
  const url = (await git(["remote", "get-url", gitArg("name", name)], { cwd, signal: ctx.signal })).trim();
  return { name, url };
}

/** This function sets the URL of a remote, and adds the remote when it is missing. */
export async function gitRemoteSet(input: GitRemoteSetInput, ctx: GitContext = {}): Promise<GitRemoteOutput> {
  const { name, url, cwd } = input;
  const run = { cwd, signal: ctx.signal };
  try {
    await git(["remote", "set-url", gitArg("name", name), gitArg("url", url)], run);
  } catch (error) {
    // The remote is missing: add it
    if (!(error instanceof GitError)) throw error;
    await git(["remote", "add", gitArg("name", name), gitArg("url", url)], run);
  }
  return { name, url };
}
