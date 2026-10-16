/**
 * The root of the file procedures: one folder that confines each path (roadmap R33).
 *
 * `createFsModule({ root })` sends each path of an input through `inRoot()`:
 * - A relative path starts at the root, not at the working folder of the process.
 * - A path outside the root gives `FORBIDDEN` with the reason `outside-root`. This includes a
 *   path that goes up with `..`, an absolute path outside the root, a path on another drive, and
 *   a symlink or a junction that leads out of the root.
 * - The check uses the real path (`fs.realpath`) of the path. For a path that does not exist, it
 *   uses the real path of the nearest existing ancestor. So a symlinked parent folder cannot
 *   lead a write or a `mkdir` out of the root.
 * - The procedure gets the absolute path, so the paths of the output are absolute.
 *
 * On Windows, the comparison ignores the case of the letters, and `/` and `\` are the same.
 */

import { readlink, realpath } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { InvocationError, type ProcedurePath } from "@procedures/client";

/** The reason of the `FORBIDDEN` error for a path outside the root. */
export const OUTSIDE_ROOT = "outside-root";

/** The maximum number of symlinks that one check follows. After it, the check fails with `ELOOP`. */
const MAX_LINKS = 40;

/**
 * This function tells if `path` is `folder` or a path in `folder`. The two paths are absolute.
 * On Windows, the case of the letters is not significant.
 */
export function isInside(folder: string, path: string): boolean {
  const rel = relative(folder, path);
  return rel === "" || (!isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${sep}`));
}

/** True for the error of a path that does not exist. */
function isMissing(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return code === "ENOENT" || code === "ENOTDIR";
}

/** The target of a symlink, or undefined when the path is not a symlink or does not exist. */
async function linkTarget(path: string): Promise<string | undefined> {
  try {
    return await readlink(path);
  } catch (error) {
    // EINVAL: the path is not a symlink
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EINVAL" || isMissing(error)) return undefined;
    throw error;
  }
}

/**
 * This function gives the real path of an absolute path. For a path that does not exist, it
 * gives the real path of the nearest existing ancestor and the rest of the path. A symlink whose
 * target does not exist leads to its target, because a write follows it.
 */
export async function realPathOf(path: string, links = 0): Promise<string> {
  const rest: string[] = [];
  let current = path;
  for (;;) {
    try {
      return join(await realpath(current), ...rest);
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
    const target = await linkTarget(current);
    if (target !== undefined) {
      if (links >= MAX_LINKS) {
        const loop = new Error(`Too many symlinks in the path ${path}`) as NodeJS.ErrnoException;
        loop.code = "ELOOP";
        throw loop;
      }
      return join(await realPathOf(resolve(dirname(current), target), links + 1), ...rest);
    }
    const parent = dirname(current);
    // No ancestor exists, for example a drive that is not there
    if (parent === current) return join(current, ...rest);
    rest.unshift(basename(current));
    current = parent;
  }
}

/** A root: the absolute path that the host gave, and its real path. */
export interface ResolvedRoot {
  folder: string;
  real: string;
}

/** This function gives the absolute path and the real path of a root. The root must exist. */
export async function resolveRoot(root: string): Promise<ResolvedRoot> {
  const folder = resolve(root);
  try {
    return { folder, real: await realpath(folder) };
  } catch (error) {
    if (!isMissing(error)) throw error;
    const missing = new Error(`The root of the file procedures does not exist: ${folder}`) as NodeJS.ErrnoException;
    missing.code = "ENOENT";
    throw missing;
  }
}

/** The `FORBIDDEN` error for a path outside the root. */
export function outsideRoot(procedure: ProcedurePath, message: string): InvocationError {
  return new InvocationError("FORBIDDEN", `${procedure.join(".")}: ${message}`, procedure, OUTSIDE_ROOT);
}

/** True for the `FORBIDDEN` error of a path outside the root. */
export function isOutsideRoot(error: unknown): boolean {
  return error instanceof InvocationError && error.code === "FORBIDDEN" && error.reason === OUTSIDE_ROOT;
}

/**
 * This function tells if the real path of an absolute path is in the root. It follows each
 * symlink of the path, also a symlink whose target does not exist.
 */
export async function realPathIsInside(root: ResolvedRoot, absolute: string): Promise<boolean> {
  return isInside(root.real, await realPathOf(absolute));
}

/**
 * This function gives the absolute path of `path` in the root. A relative path starts at the
 * root. A path outside the root gives `FORBIDDEN` with the reason `outside-root`.
 */
export async function inRoot(root: ResolvedRoot, path: string, procedure: ProcedurePath): Promise<string> {
  const absolute = resolve(root.folder, path);
  if (!isInside(root.folder, absolute) && !isInside(root.real, absolute)) {
    throw outsideRoot(procedure, `the path ${JSON.stringify(path)} is outside the root ${root.folder}`);
  }
  if (!(await realPathIsInside(root, absolute))) {
    throw outsideRoot(procedure, `the path ${JSON.stringify(path)} leads out of the root ${root.folder} through a symlink`);
  }
  return absolute;
}
