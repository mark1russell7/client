/**
 * The lookup of the program of a CLI tool. On Windows, a package manager is often a `.cmd` file,
 * and Node runs a `.cmd` file only through a shell. So a tool finds the real program: an
 * executable, or the script that the `.cmd` file starts, run with Node.
 */

import { existsSync } from "node:fs";
import { delimiter } from "node:path";

/** The program and the first arguments that start a CLI tool without a shell. */
export interface CliProgram {
  /** The program that `shell.run` starts */
  command: string;
  /** The arguments before the arguments of the command (for example the script of the tool) */
  prefix: string[];
}

/** This function gives the program that runs a JavaScript script with the Node of this process. */
export function nodeScript(script: string): CliProgram {
  return { command: process.execPath, prefix: [script] };
}

/**
 * This function gives the program of `npm_execpath`, when the package manager that runs this
 * process matches. A `script` match runs with Node, and an `executable` match runs directly.
 * The file must exist.
 */
export function execPathProgram(match: { script?: RegExp | undefined; executable?: RegExp | undefined }): CliProgram | undefined {
  const execPath = process.env["npm_execpath"];
  if (!execPath || !existsSync(execPath)) return undefined;
  if (match.script?.test(execPath)) return nodeScript(execPath);
  if (match.executable?.test(execPath)) return { command: execPath, prefix: [] };
  return undefined;
}

/**
 * This function gives the first program that `find` gives for a folder of PATH, in the order of
 * PATH. It skips empty entries, and it gives undefined when no folder has the program.
 */
export function findInPath(find: (dir: string) => CliProgram | undefined, path: string = process.env["PATH"] ?? ""): CliProgram | undefined {
  for (const dir of path.split(delimiter)) {
    if (!dir) continue;
    const program = find(dir);
    if (program !== undefined) return program;
  }
  return undefined;
}
