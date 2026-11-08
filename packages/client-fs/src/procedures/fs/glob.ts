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

import { glob as nodeGlob } from "node:fs/promises";
import { posix, relative as relativePath, resolve } from "node:path";
import { findEntries, matchesGlob, toPosix } from "@mark1russell7/files";
import type { GlobInput, GlobOutput } from "../../types.js";

/** This function tells if an ignore pattern matches `path`, with the rules of `node:fs` glob. */
function ignored(path: string, ignore: readonly string[]): boolean {
  return ignore.some((pattern) => posix.matchesGlob(path, pattern));
}

/**
 * This function gives all the matches of `pattern` under `root`, dot entries included. The walk is
 * `findEntries` of `@mark1russell7/files` with `dot: true`. It enters `node_modules` and `.git`, and it
 * does not enter an ignored folder. Thus `a/**` also matches the folder `a`, as the `node:fs` glob does.
 * `findEntries` does not apply the ignore patterns to a pattern with no glob character, so this
 * function applies them to each match again.
 */
function walkWithDots(root: string, pattern: string, ignore: readonly string[]): string[] {
  const isIgnored = (path: string): boolean => ignore.some((glob) => matchesGlob(path, glob, { dot: true }));
  // A folder is ignored when each path inside it is ignored: "a/" matches "a/**" and "a/*".
  const folderIgnored = (path: string): boolean => isIgnored(path) || isIgnored(`${path}/`);
  const insideIgnored = (names: readonly string[]): boolean =>
    names.slice(0, -1).some((_, index) => folderIgnored(names.slice(0, index + 1).join("/")));
  return findEntries({ root, include: [pattern], ignore, skip: [], dot: true }).flatMap((entry) => {
    const path = toPosix(relativePath(root, entry.path));
    const ownIgnored = entry.kind === "directory" ? folderIgnored(path) : isIgnored(path);
    return path === "" || ownIgnored || insideIgnored(path.split("/")) ? [] : [path];
  });
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
    relative = walkWithDots(root, toPosix(pattern), ignore);
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
