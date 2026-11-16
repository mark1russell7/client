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
import { globToRegExp } from "@mark1russell7/files/glob";
import type { GlobInput, GlobOutput } from "../../types.js";

/** "a\\b" (Windows) becomes "a/b". */
function toPosix(path: string): string {
  return path.split("\\").join("/");
}

function ignored(path: string, ignore: readonly string[]): boolean {
  return ignore.some((pattern) => posix.matchesGlob(path, pattern));
}

/**
 * All the matches of `pattern` under `root`, dot entries included. The matcher of
 * `@mark1russell7/files` expands the brace groups, and each wildcard matches a leading ".".
 */
async function walkWithDots(root: string, pattern: string, ignore: readonly string[]): Promise<string[]> {
  const matcher = globToRegExp(pattern, { dot: true });
  const ignorers = ignore.map((entry) => globToRegExp(entry, { dot: true }));
  const isIgnored = (path: string): boolean => ignorers.some((entry) => entry.test(path));
  const matches: string[] = [];

  async function visit(relative: string): Promise<void> {
    const entries = await readdir(relative ? resolve(root, relative) : root, { withFileTypes: true });
    for (const entry of entries) {
      const path = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        // An ignore pattern that matches the folder, alone or with a "/" after it, keeps the walk out of it
        if (isIgnored(path) || isIgnored(`${path}/`)) continue;
        if (matcher.test(path)) matches.push(path);
        await visit(path);
      } else if (matcher.test(path) && !isIgnored(path)) {
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
