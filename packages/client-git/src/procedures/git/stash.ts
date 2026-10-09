/**
 * git.stash.* procedures
 *
 * Stash operations for saving and restoring work in progress.
 * Includes export/import for snapshot storage.
 */

import { gitArg } from "./args.js";
import { git, GitError, type GitContext } from "./run.js";
import type {
  GitStashListInput,
  GitStashListOutput,
  GitStashPushInput,
  GitStashPushOutput,
  GitStashPopInput,
  GitStashPopOutput,
  GitStashApplyInput,
  GitStashApplyOutput,
  GitStashDropInput,
  GitStashDropOutput,
  GitStashExportInput,
  GitStashExportOutput,
  GitStashImportInput,
  GitStashImportOutput,
  GitStashEntry,
} from "../../types.js";

/**
 * True when git stopped on a merge conflict. Git writes "CONFLICT (content): ..." to stdout,
 * so the message alone (which has stderr) does not show it. (Before, the procedures examined
 * only the message, and never reported a conflict.)
 */
function isConflict(error: unknown): boolean {
  return error instanceof GitError && /conflict/i.test(`${error.stdout}\n${error.stderr}`);
}

/** The message of a git failure. An abort is not a git failure: it throws again. */
function failure(error: unknown): string {
  if (!(error instanceof GitError)) throw error;
  return error.message;
}

function stashRef(index: number | undefined): string {
  return index !== undefined ? `stash@{${index}}` : "stash@{0}";
}

/**
 * List all stashes
 */
export async function gitStashList(input: GitStashListInput, ctx: GitContext = {}): Promise<GitStashListOutput> {
  const cwd = input.cwd || process.cwd();

  let output: string;
  try {
    // Get stash list with format: stash@{n}: WIP on branch: message
    output = await git(["stash", "list", "--format=%H%x00%gd%x00%gs"], { cwd, signal: ctx.signal });
  } catch (error) {
    // No stashes or not a git repo
    failure(error);
    return { stashes: [], count: 0 };
  }

  const stashes: GitStashEntry[] = [];
  for (const line of output.split("\n").filter(Boolean)) {
    const parts = line.split("\0");
    const hash = parts[0] || "";
    const ref = parts[1] || "";
    const message = parts[2] || "";
    // Extract index from stash@{n}
    const indexMatch = ref.match(/stash@\{(\d+)\}/);
    const index = indexMatch && indexMatch[1] ? parseInt(indexMatch[1], 10) : 0;

    stashes.push({
      index,
      ref,
      hash,
      message,
    });
  }

  return { stashes, count: stashes.length };
}

/**
 * Push changes to stash
 */
export async function gitStashPush(input: GitStashPushInput, ctx: GitContext = {}): Promise<GitStashPushOutput> {
  const cwd = input.cwd || process.cwd();
  const run = { cwd, signal: ctx.signal };

  const args: string[] = ["stash", "push"];

  if (input.message) {
    args.push("-m", input.message);
  }

  if (input.includeUntracked) {
    args.push("--include-untracked");
  }

  if (input.keepIndex) {
    args.push("--keep-index");
  }

  if (input.paths && input.paths.length > 0) {
    args.push("--");
    args.push(...input.paths);
  }

  try {
    const output = await git(args, run);

    // Check if anything was stashed
    if (output.includes("No local changes to save")) {
      return { stashed: false, message: "No local changes to save" };
    }

    // Get the ref of the new stash
    const refOutput = (await git(["stash", "list", "-1", "--format=%gd"], run)).trim();

    return {
      stashed: true,
      ref: refOutput || "stash@{0}",
      message: input.message || "WIP",
    };
  } catch (error) {
    return { stashed: false, message: failure(error) || "Failed to stash" };
  }
}

/**
 * Pop stash (apply and remove)
 */
export async function gitStashPop(input: GitStashPopInput, ctx: GitContext = {}): Promise<GitStashPopOutput> {
  const cwd = input.cwd || process.cwd();
  const ref = stashRef(input.index);

  try {
    await git(["stash", "pop", gitArg("ref", ref)], { cwd, signal: ctx.signal });
    return { applied: true, ref, dropped: true };
  } catch (error) {
    // Check if it's a conflict
    if (isConflict(error)) {
      return { applied: false, ref, dropped: false, conflict: true };
    }
    failure(error);
    return { applied: false, ref, dropped: false };
  }
}

/**
 * Apply stash without removing
 */
export async function gitStashApply(input: GitStashApplyInput, ctx: GitContext = {}): Promise<GitStashApplyOutput> {
  const cwd = input.cwd || process.cwd();
  const ref = stashRef(input.index);

  try {
    await git(["stash", "apply", gitArg("ref", ref)], { cwd, signal: ctx.signal });
    return { applied: true, ref };
  } catch (error) {
    if (isConflict(error)) {
      return { applied: false, ref, conflict: true };
    }
    failure(error);
    return { applied: false, ref };
  }
}

/**
 * Drop a stash
 */
export async function gitStashDrop(input: GitStashDropInput, ctx: GitContext = {}): Promise<GitStashDropOutput> {
  const cwd = input.cwd || process.cwd();
  const ref = stashRef(input.index);

  try {
    await git(["stash", "drop", gitArg("ref", ref)], { cwd, signal: ctx.signal });
    return { dropped: true, ref };
  } catch (error) {
    failure(error);
    return { dropped: false, ref };
  }
}

/**
 * Export a stash as a patch (for snapshot storage)
 */
export async function gitStashExport(input: GitStashExportInput, ctx: GitContext = {}): Promise<GitStashExportOutput> {
  const cwd = input.cwd || process.cwd();
  const run = { cwd, signal: ctx.signal };
  const ref = stashRef(input.index);

  try {
    // Get the stash as a patch
    const patch = await git(["stash", "show", "-p", gitArg("ref", ref)], run);

    // Get metadata
    const metadata = (await git(["stash", "list", "-1", "--format=%H%x00%gs", ref], run)).trim();
    const metaParts = metadata.split("\0");
    const hash = metaParts[0] || "";
    const message = metaParts[1] || "";

    // Get untracked files if present (stash^3 contains untracked files if any)
    let untrackedPatch = "";
    try {
      untrackedPatch = await git(["show", `${ref}^3`, "--format=", "--name-only"], run);
    } catch (error) {
      // No untracked files in this stash
      failure(error);
    }

    return {
      ref,
      hash,
      message,
      patch,
      hasUntracked: untrackedPatch.length > 0,
      untrackedPatch: untrackedPatch || undefined,
    };
  } catch (error) {
    throw new Error(`Failed to export stash ${ref}: ${failure(error)}`);
  }
}

/**
 * Import a stash from a patch (for snapshot restore)
 * Note: This creates a new stash, it doesn't recreate the exact stash state
 */
export async function gitStashImport(input: GitStashImportInput, ctx: GitContext = {}): Promise<GitStashImportOutput> {
  const cwd = input.cwd || process.cwd();
  const run = { cwd, signal: ctx.signal };

  try {
    // Apply the patch to working directory
    await git(["apply", "--3way"], { ...run, input: input.patch });

    // Stash the changes with the original message
    const message = input.message || "Imported stash";
    const args = ["stash", "push", "-m", message];

    if (input.includeUntracked) {
      args.push("--include-untracked");
    }

    await git(args, run);

    // Get the new stash ref
    const ref = (await git(["stash", "list", "-1", "--format=%gd"], run)).trim();

    return { imported: true, ref: ref || "stash@{0}" };
  } catch (error) {
    return { imported: false, error: failure(error) || "Failed to import stash" };
  }
}
