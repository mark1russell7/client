/**
 * Find the `claude` program of Claude Code.
 */

import { existsSync } from "node:fs";
import { posix, win32 } from "node:path";

/** The environment variable that names the `claude` program. It comes before the search. */
export const CLAUDE_ENV = "CLAUDE_BIN";

/** The options of `findClaude`. Each one has a default from the host. */
export interface FindClaudeOptions {
  /** The `claude` program. When it is set, the search does not occur. */
  readonly executable?: string | undefined;
  /** The environment (default: `process.env`). */
  readonly env?: Readonly<Record<string, string | undefined>> | undefined;
  /** The operating system (default: `process.platform`). */
  readonly platform?: NodeJS.Platform | undefined;
  /** The function that tells if a file exists (default: `existsSync`). */
  readonly exists?: ((path: string) => boolean) | undefined;
}

/**
 * This function gives the paths that the search examines, in order: the folders of the `PATH`,
 * then the install folders of the native installer. On Windows, it looks only for `claude.exe`,
 * because a batch file (`claude.cmd`) does not start without a shell.
 */
export function claudeCandidates(platform: NodeJS.Platform, env: Readonly<Record<string, string | undefined>>): string[] {
  const windows = platform === "win32";
  const path = windows ? win32 : posix;
  const name = windows ? "claude.exe" : "claude";
  const pathValue = windows ? (env["Path"] ?? env["PATH"]) : env["PATH"];
  const folders = (pathValue ?? "").split(windows ? ";" : ":").filter((folder) => folder.length > 0);
  const home = windows ? (env["USERPROFILE"] ?? env["HOME"]) : env["HOME"];
  const installed = home !== undefined ? [path.join(home, ".local", "bin", name), path.join(home, ".claude", "local", name)] : [];
  return [...folders.map((folder) => path.join(folder, name)), ...installed];
}

/**
 * This function finds the `claude` program. The order is `executable`, then `CLAUDE_BIN`, then
 * the `PATH` and the install folders. It gives `undefined` when it finds none.
 */
export function findClaude(options: FindClaudeOptions = {}): string | undefined {
  if (options.executable !== undefined && options.executable.length > 0) return options.executable;
  const env = options.env ?? process.env;
  const override = env[CLAUDE_ENV];
  if (override !== undefined && override.length > 0) return override;
  const exists = options.exists ?? existsSync;
  return claudeCandidates(options.platform ?? process.platform, env).find((candidate) => exists(candidate));
}
