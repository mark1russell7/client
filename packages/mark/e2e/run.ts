/**
 * Run the built `mark` CLI as a process.
 *
 * Each run has a temporary home folder with no CLI server lockfiles, so the commands run in the
 * CLI process and never on a warm server of the user. The arguments go as argv: no shell.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** The bin of mark */
export const BIN = fileURLToPath(new URL("../dist/bin.js", import.meta.url));
/** The documented entry (`node packages/mark/dist/cli.js ...`) */
export const CLI = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
/** The node_modules folder of mark */
export const MARK_MODULES = realpathSync(fileURLToPath(new URL("../node_modules", import.meta.url)));
/** True when mark is built */
export const built = existsSync(BIN);

const HOME = mkdtempSync(join(tmpdir(), "mark-e2e-home-"));

export interface Run {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export function mark(
  args: string[],
  options: { cwd?: string; entry?: string; env?: Record<string, string> } = {}
): Run {
  const result = spawnSync(process.execPath, [options.entry ?? BIN, ...args], {
    cwd: options.cwd,
    encoding: "utf8",
    timeout: 120000,
    env: { ...process.env, HOME, USERPROFILE: HOME, FORCE_COLOR: "0", NO_COLOR: "1", ...options.env },
  });
  return { stdout: result.stdout ?? "", stderr: result.stderr ?? "", exitCode: result.status ?? 1 };
}

/** The JSON that a `--format json` command printed */
export function json<T>(run: Run): T {
  return JSON.parse(run.stdout) as T;
}

/** A directory junction (Windows) or symbolic link (elsewhere) */
export function link(target: string, path: string): void {
  mkdirSync(dirname(path), { recursive: true });
  symlinkSync(target, path, process.platform === "win32" ? "junction" : "dir");
}
