/**
 * The file of a program: the one place that answers which file a command starts.
 *
 * On Windows, Node (libuv) looks for a program name with no folder first in the working folder of
 * the child, and only then in the folders of `PATH`. So "run `git` in this cloned repository"
 * started a `git.exe` from the top folder of the repository. The helpers give `spawn` the
 * absolute path from `startFile()`, which searches only the folders of `PATH`. The functions take
 * the operating system, the environment and the file test as inputs, so each system tests them.
 */

import { statSync } from "node:fs";
import { win32 } from "node:path";

/** The options of `programPath`. Each one has a default from the host, so the tests can set it. */
export interface ProgramPathOptions {
  /** The operating system (default: `process.platform`). */
  platform?: NodeJS.Platform | undefined;
  /** The environment of the host, for a child environment with no `PATH` (default: `process.env`). */
  hostEnv?: Readonly<Record<string, string | undefined>> | undefined;
  /** The function that tells if a path is a file (default: `fs.statSync`). */
  isFile?: ((path: string) => boolean) | undefined;
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/** True for a path with a drive and a separator (`C:\x`), or a UNC path (`\\server\share`). */
function fullyQualified(path: string): boolean {
  return /^(?:[a-zA-Z]:[\\/]|[\\/]{2}[^\\/])/.test(path);
}

/**
 * The value of `PATH` in an environment that Node gives to a child on Windows. The names of the
 * variables have no fixed case there. Node keeps the first name in sorted order (`PATH` before
 * `Path`), and leaves out a variable with no value.
 */
export function windowsPathValue(env: Readonly<Record<string, string | undefined>>): string | undefined {
  const key = Object.keys(env).sort().find((name) => name.toUpperCase() === "PATH");
  return key === undefined ? undefined : env[key];
}

/**
 * The folders of a `PATH` value on Windows, in order, as libuv reads them: a `;` separates two
 * folders, and quotes around a folder are not part of it. The list leaves out an empty folder and
 * a folder that is not fully qualified, because both lead to the working folder.
 */
export function windowsPathFolders(value: string): string[] {
  const folders: string[] = [];
  let start = 0;
  while (start <= value.length) {
    const quote = value[start];
    let from = start;
    if (quote === '"' || quote === "'") {
      const end = value.indexOf(quote, start + 1);
      from = end === -1 ? value.length : end;
    }
    const semicolon = value.indexOf(";", from);
    const end = semicolon === -1 ? value.length : semicolon;
    const folder = value.slice(start, end).replace(/^["']/, "").replace(/["']$/, "");
    if (fullyQualified(folder)) folders.push(folder);
    start = end + 1;
  }
  return folders;
}

/** True when a command has a folder part, for example `.\x`, `bin/x` or `C:x`. */
function hasFolder(command: string): boolean {
  return /[\\/:]/.test(command);
}

/**
 * This function gives the file that `command` starts, for `spawn`:
 * - On POSIX, and for a command with a folder part, it gives `command`. The system finds it as before.
 * - On Windows, for a name with no folder, it gives the absolute path of the first match in the
 *   folders of the `PATH` of `env`, the environment of the child. It never looks in the working
 *   folder. It tries the names that libuv tries: the exact name when it has an extension, then
 *   the name with `.com`, then the name with `.exe`.
 * - It gives `undefined` when no folder of `PATH` has the program.
 *
 * When `env` has no `PATH`, libuv uses the `PATH` of the host. This function does the same.
 */
export function programPath(
  command: string,
  env: Readonly<Record<string, string | undefined>>,
  options: ProgramPathOptions = {},
): string | undefined {
  if ((options.platform ?? process.platform) !== "win32") return command;
  // An empty name stays as it is: spawn gives its own error for it
  if (command === "" || hasFolder(command)) return command;
  if (command === ".") return undefined;
  const dot = command.indexOf(".");
  const names = [...(dot !== -1 && dot < command.length - 1 ? [command] : []), `${command}.com`, `${command}.exe`];
  const value = windowsPathValue(env) ?? windowsPathValue(options.hostEnv ?? process.env) ?? "";
  const test = options.isFile ?? isFile;
  for (const folder of windowsPathFolders(value)) {
    for (const name of names) {
      const path = win32.join(folder, name);
      if (test(path)) return path;
    }
  }
  return undefined;
}

/**
 * A folder name that no file system of Windows allows: NTFS refuses `<` and `>` in a name. A path
 * through it does not exist, so a start of it fails with ENOENT and searches no other folder.
 */
const NO_FOLDER = "<not in PATH>";

/**
 * This function gives the file that `startChild` gives to `spawn`. It is the result of
 * `programPath()` when there is one. When no folder of `PATH` has the program, it gives a fully
 * qualified path that does not exist, in the system folder. So the start fails with ENOENT, as for
 * a missing program, and the system does not look in the working folder.
 */
export function startFile(
  command: string,
  env: Readonly<Record<string, string | undefined>>,
  options: ProgramPathOptions = {},
): string {
  // No join: a join would remove a name such as `..`, and the path would be a folder that exists
  return programPath(command, env, options) ?? `${systemProgram(NO_FOLDER, options.hostEnv ?? process.env)}\\${command}`;
}

/** The part of an error of Node that names the file of a start. */
interface StartError {
  message: string;
  stack?: string | undefined;
  syscall?: string | undefined;
  path?: string | undefined;
}

/**
 * When `file` is not `command`, this function changes each start error of `child` to name
 * `command`, as Node names it for a start by name: the `message` (`spawn git ENOENT`), the
 * `stack`, the `syscall` and the `path`. So the error of a call is the same as before the lookup.
 * A child with no other listener of `error` still throws the error, as Node does.
 */
export function nameStartErrors(child: NodeJS.EventEmitter, command: string, file: string): void {
  if (file === command) return;
  const fileCall = `spawn ${file}`;
  const commandCall = `spawn ${command}`;
  child.prependListener("error", (error: StartError) => {
    if (error.syscall === fileCall) {
      error.syscall = commandCall;
      if (error.path === file) error.path = command;
      if (error.message.startsWith(fileCall)) error.message = commandCall + error.message.slice(fileCall.length);
      if (error.stack !== undefined) error.stack = error.stack.replace(fileCall, commandCall);
    }
    if (child.listenerCount("error") === 1) throw error;
  });
}

/**
 * The program and the arguments of `shell.which` for a command. On Windows, `where name` gives a
 * match in the working folder first. `where $PATH:name` looks only in the folders of `PATH`, as a
 * start of a program by its name does. A command with a folder part goes to `where` as it is.
 */
export function whichCall(command: string, platform: NodeJS.Platform = process.platform): { program: string; args: string[] } {
  if (platform !== "win32") return { program: "which", args: [command] };
  return { program: "where", args: [hasFolder(command) ? command : `$PATH:${command}`] };
}

/**
 * The path of a program of the system folder of Windows, for example `taskkill.exe`. The folder
 * comes from `SystemRoot`, then `windir`, then `C:\Windows`. A value that is not fully qualified
 * is not used.
 */
export function systemProgram(name: string, env: Readonly<Record<string, string | undefined>> = process.env): string {
  const root = [env["SystemRoot"], env["windir"]].find((value): value is string => value !== undefined && fullyQualified(value));
  return win32.join(root ?? "C:\\Windows", "System32", name);
}
