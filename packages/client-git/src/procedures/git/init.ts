/**
 * git.init procedure
 *
 * Initialize a git repository
 */

import { join, resolve } from "node:path";
import type { ProcedureContext } from "@mark1russell7/client";
import { git } from "./run.js";
import type { GitInitInput, GitInitOutput } from "../../types.js";

interface FsExistsOutput { exists: boolean; path: string; }

/**
 * Initialize a git repository
 */
export async function gitInit(input: GitInitInput, ctx: ProcedureContext): Promise<GitInitOutput> {
  const cwd = input.cwd ? resolve(input.cwd) : process.cwd();

  // Check if already a git repo
  const gitDir = join(cwd, ".git");
  const existsResult = await ctx.client.call<{ path: string }, FsExistsOutput>(
    ["fs", "exists"],
    { path: gitDir }
  );
  const alreadyExists = existsResult.exists;

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
