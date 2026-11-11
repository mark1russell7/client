/**
 * shell.which procedure
 *
 * Find the full path to a command.
 */

import { runCommand } from "../../command/run.js";
import type { ShellWhichInput, ShellWhichOutput } from "../../types.js";

export async function shellWhich(
  input: ShellWhichInput,
  ctx?: { signal?: AbortSignal | undefined }
): Promise<ShellWhichOutput> {
  // The name is one argument of where/which, with no shell. (Before, `where ${command}` ran in a
  // shell, so a name such as `x & calc` ran a second command: deep dive WRP-6.)
  if (input.command.startsWith("-")) {
    return { path: null, found: false };
  }
  const windows = process.platform === "win32";
  // On Windows, `where name` gives a match in the current folder first. `where $PATH:name` looks
  // only in the folders of PATH, as the start of a program by its name does.
  const name = windows && !/[\\/:]/.test(input.command) ? `$PATH:${input.command}` : input.command;
  const result = await runCommand(windows ? "where" : "which", { args: [name], signal: ctx?.signal, timeout: 30_000 });
  if (!result.success) {
    return { path: null, found: false };
  }
  const path = result.stdout.trim().split(/\r?\n/)[0]?.trim() ?? "";
  return path.length > 0 ? { path, found: true } : { path: null, found: false };
}
