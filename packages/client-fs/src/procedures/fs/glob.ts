/**
 * glob procedure
 *
 * Find files matching glob pattern
 *
 * The matches are relative to `cwd` (or absolute with `absolute: true`), with "/" separators.
 * `ignore` removes the matches of its patterns and does not enter the folders that they match.
 *
 * Before, `ignore` was stripped by the input schema, and `absolute` and `dot` had no effect:
 * `node:fs` glob has no such options (deep dive DATA-7).
 */

import { glob as nodeGlob, readdir } from "node:fs/promises";
import { posix, resolve } from "node:path";
import type { GlobInput, GlobOutput } from "../../types.js";

// A character that a file name cannot hold. It takes the place of a leading "." of a name, so
// that "*" and "**" match dot entries when `dot` is true.
const DOT = "\u0001";

/** "a\\b" (Windows) becomes "a/b". */
function toPosix(path: string): string {
  return path.split("\\").join("/");
}

/** Each name of the path that starts with "." starts with DOT instead. */
function hideDots(path: string): string {
  return path
    .split("/")
    .map((name) => (name.startsWith(".") && name !== "." && name !== ".." ? DOT + name.slice(1) : name))
    .join("/");
}

function ignored(path: string, ignore: readonly string[]): boolean {
  return ignore.some((pattern) => posix.matchesGlob(path, pattern));
}

/** A folder is not entered when each path inside it is ignored. */
function folderIgnored(path: string, ignore: readonly string[]): boolean {
  return ignored(`${path}/${DOT}`, ignore) || ignored(path, ignore);
}

/** All the matches of `pattern` under `root`, dot entries included. */
async function walkWithDots(root: string, pattern: string, ignore: readonly string[]): Promise<string[]> {
  const hiddenPattern = hideDots(pattern);
  const hiddenIgnore = ignore.map(hideDots);
  const matches: string[] = [];

  async function visit(relative: string): Promise<void> {
    const entries = await readdir(relative ? resolve(root, relative) : root, { withFileTypes: true });
    for (const entry of entries) {
      const path = relative ? `${relative}/${entry.name}` : entry.name;
      const hidden = hideDots(path);
      if (entry.isDirectory()) {
        if (folderIgnored(hidden, hiddenIgnore)) continue;
        if (posix.matchesGlob(hidden, hiddenPattern)) matches.push(path);
        await visit(path);
      } else if (posix.matchesGlob(hidden, hiddenPattern) && !ignored(hidden, hiddenIgnore)) {
        matches.push(path);
      }
    }
  }

  await visit("");
  return matches;
}

/**
 * Find files matching glob pattern
 */
export async function glob(input: GlobInput): Promise<GlobOutput> {
  const { pattern, absolute, dot } = input;
  const ignore = input.ignore ?? [];
  const root = resolve(input.cwd ?? process.cwd());

  let relative: string[];
  if (dot) {
    relative = await walkWithDots(root, toPosix(pattern), ignore);
  } else {
    relative = [];
    for await (const match of nodeGlob(pattern, { cwd: root, exclude: [...ignore] })) {
      const path = toPosix(match);
      // The exclude list of node:fs prunes folders. This check also covers the Node versions
      // that ignore it.
      if (!ignored(path, ignore)) relative.push(path);
    }
  }

  relative.sort();
  const matches = absolute ? relative.map((path) => resolve(root, path)) : relative;
  return { pattern, matches };
}
