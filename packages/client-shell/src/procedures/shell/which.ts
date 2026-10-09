/**
 * shell.which procedure
 *
 * Find the full path to a command.
 */

import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import type { ShellWhichInput, ShellWhichOutput } from "../../types.js";

const execFileAsync = promisify(execFileCb);

export async function shellWhich(input: ShellWhichInput): Promise<ShellWhichOutput> {
  // The name is one argument of where/which, with no shell. (Before, `where ${command}` ran in a
  // shell, so a name such as `x & calc` ran a second command: deep dive WRP-6.)
  if (input.command.startsWith("-")) {
    return { path: null, found: false };
  }
  const program = process.platform === "win32" ? "where" : "which";

  try {
    const { stdout } = await execFileAsync(program, [input.command], { windowsHide: true });
    const path = stdout.trim().split("\n")[0]?.trim() ?? null;

    return {
      path,
      found: path !== null && path.length > 0,
    };
  } catch {
    return {
      path: null,
      found: false,
    };
  }
}
