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
import { matchesGlob, toPosix } from "@mark1russell7/files";
import type { GlobInput, GlobOutput } from "../../types.js";

/** This function tells if an ignore pattern matches `path`, with the rules of `node:fs` glob. */
function ignored(path: string, ignore: readonly string[]): boolean {
  return ignore.some((pattern) => posix.matchesGlob(path, pattern));
}

/**
 * This function gives all the matches of `pattern` under `root`, dot entries included. The match of
 * a path is `matchesGlob` of `@mark1russell7/files` with `dot: true`. Thus `a/**` also matches the
 * folder `a`, as the `node:fs` glob does when `dot` is false.
 */
async function walkWithDots(root: string, pattern: string, ignore: readonly string[]): Promise<string[]> {
  const match = (path: string, glob: string): boolean => matchesGlob(path, glob, { dot: true });
  const isIgnored = (path: string): boolean => ignore.some((glob) => match(path, glob));
  // The walk does not enter a folder when each path inside it is ignored: "a/" matches "a/**" and "a/*".
  const folderIgnored = (path: string): boolean => isIgnored(path) || isIgnored(`${path}/`);
  const matches: string[] = [];

  async function visit(relative: string): Promise<void> {
    const entries = await readdir(relative ? resolve(root, relative) : root, { withFileTypes: true });
    for (const entry of entries) {
      const path = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (folderIgnored(path)) continue;
        if (match(path, pattern)) matches.push(path);
        await visit(path);
      } else if (match(path, pattern) && !isIgnored(path)) {
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
