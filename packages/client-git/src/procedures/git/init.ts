/**
 * git.init procedure
 *
 * Initialize a git repository
 */

import { execSync } from "node:child_process";
import { join, resolve } from "node:path";
import type { ProcedureContext } from "@mark1russell7/client";
import type { GitInitInput, GitInitOutput } from "../../types.js";

interface FsExistsOutput { exists: boolean; path: string; }

/**
 * Initialize a git repository
 */
export async function gitInit(input: GitInitInput, ctx: ProcedureContext): Promise<GitInitOutput> {
  const cwd = input.cwd ? resolve(input.cwd) : process.cwd();
  const opts = { cwd, encoding: "utf8" as const };

  // Check if already a git repo
  const gitDir = join(cwd, ".git");
  const existsResult = await ctx.client.call<{ path: string }, FsExistsOutput>(
    ["fs", "exists"],
    { path: gitDir }
  );
  const alreadyExists = existsResult.exists;

  if (!alreadyExists) {
    let cmd = "git init";
    if (input.bare) {
      cmd += " --bare";
    }
    if (input.initialBranch) {
      cmd += ` --initial-branch=${input.initialBranch}`;
    }
    execSync(cmd, opts);
  }

  return {
    path: cwd,
    created: !alreadyExists,
  };
}
