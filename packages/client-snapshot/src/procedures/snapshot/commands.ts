/**
 * The programs that the snapshot procedures run: git and pnpm, through `runCommand`.
 *
 * `runCommand` is async, kills the process tree when the signal aborts, and runs no shell.
 * Before, the procedures used `execSync`: it blocked the event loop of the host for each call,
 * ignored the signal, and passed the command line to a shell.
 */

import { runCommand } from "@mark1russell7/client-shell/command";
import { resolvePnpm } from "@mark1russell7/client-pnpm";

/** The longest time of one git or pnpm query, in milliseconds. */
const QUERY_TIMEOUT_MS = 30_000;

/**
 * This function runs `git <args>` in `cwd` and gives its trimmed output. It gives `undefined`
 * when git fails, when it cannot start, or when the signal aborts.
 */
export async function gitText(args: readonly string[], cwd: string, signal?: AbortSignal): Promise<string | undefined> {
  const result = await runCommand("git", { args, cwd, signal, timeout: QUERY_TIMEOUT_MS });
  return result.success ? result.stdout.trim() : undefined;
}

/** This function gives the version of pnpm, or "unknown" when pnpm cannot run. */
export async function pnpmVersion(signal?: AbortSignal): Promise<string> {
  let pnpm: { command: string; prefix: string[] };
  try {
    pnpm = resolvePnpm();
  } catch {
    return "unknown";
  }
  const result = await runCommand(pnpm.command, { args: [...pnpm.prefix, "--version"], signal, timeout: QUERY_TIMEOUT_MS });
  return result.success ? result.stdout.trim() : "unknown";
}
