/**
 * The programs of the snapshot procedures: git through the `git.*` procedures, and pnpm.
 *
 * - Git goes through the `git.*` procedures of the host (`ctx.client`), not through a process of
 *   this package. Under a root of the files, the rules of the root then apply to each git command:
 *   the working folder in the root, no hooks, no configuration that starts a program (tracker
 *   item O46).
 * - `runCommand` starts pnpm. It is async, kills the process tree when the signal aborts, and runs
 *   no shell. Under a root, pnpm does not start.
 */

import type { ProcedureContext, ProcedurePath } from "@procedures/client";
import { isOutsideRoot } from "@procedures/fs/root";
import { runCommand } from "@procedures/shell/command";
import { resolvePnpm } from "@procedures/pnpm";

/** The longest time of one pnpm query, in milliseconds. */
const QUERY_TIMEOUT_MS = 30_000;

/**
 * This function starts a `git.*` procedure of the host and gives its output. It gives `undefined`
 * when the procedure fails, for example in a folder that is not a repository. A refusal of the
 * root (`FORBIDDEN` with the reason `outside-root`) is not a failure of git: it stays the error.
 */
export async function gitCall<T>(ctx: ProcedureContext, path: ProcedurePath, input: Record<string, unknown>): Promise<T | undefined> {
  try {
    return await ctx.client.call<Record<string, unknown>, T>(path, input);
  } catch (error) {
    if (isOutsideRoot(error)) throw error;
    return undefined;
  }
}

/**
 * This function gives the version of pnpm, or "unknown" when pnpm cannot run. Under a root of the
 * files (`fsRoot`), it starts no program and gives "unknown".
 */
export async function pnpmVersion(signal?: AbortSignal, fsRoot?: string): Promise<string> {
  if (fsRoot !== undefined) return "unknown";
  let pnpm: { command: string; prefix: string[] };
  try {
    pnpm = resolvePnpm();
  } catch {
    return "unknown";
  }
  const result = await runCommand(pnpm.command, { args: [...pnpm.prefix, "--version"], signal, timeout: QUERY_TIMEOUT_MS });
  return result.success ? result.stdout.trim() : "unknown";
}
