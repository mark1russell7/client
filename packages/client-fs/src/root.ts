/**
 * The root of the file procedures: one folder that confines each path (roadmap R33).
 *
 * This file is the `./root` entry of the package: the rules without the procedures. Another
 * package that confines its own paths imports them, for example `@procedures/archive`.
 *
 * `createFsModule({ root })` sends each path of an input through `inRoot()`:
 * - A relative path starts at the root, not at the working folder of the process.
 * - A path outside the root gives `FORBIDDEN` with the reason `outside-root`. This includes a
 *   path that goes up with `..`, an absolute path outside the root, a path on another drive, and
 *   a symlink or a junction that leads out of the root.
 * - The check uses the real path (`fs.realpath`) of the path. For a path that does not exist, it
 *   uses the real path of the nearest existing ancestor. So a symlinked parent folder cannot
 *   lead a write or a `mkdir` out of the root.
 * - A relative target of a symlink starts at the real folder of the link, not at the text of the
 *   path. A `..` in the target follows the rule of the system (`link-target.ts`).
 * - On Windows, a network path (`\\host\share\name`) or a device path (`\\.\pipe\name`) of
 *   another share than the root is outside. The check refuses it before it opens the path, because
 *   an open of a network path connects to its host.
 * - The procedure gets the absolute path, so the paths of the output are absolute.
 *
 * On Windows, the comparison ignores the case of the letters, and `/` and `\` are the same.
 */

import { readlink, realpath } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep, win32 } from "node:path";
import { InvocationError, type ProcedurePath } from "@procedures/client";
import { isMissing, linkDestination } from "./link-target.js";

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
      return join(await realPathOf(await linkDestination(current, target), links + 1), ...rest);
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

/**
 * This function gives the share of a network or device path of Windows, in lower case. For
 * `\\host\share\x` and `\\?\UNC\host\share\x` it gives `host\share`. For `\\.\pipe\x` it gives
 * `.\pipe`. For each other path it gives undefined.
 */
function windowsShare(path: string): string | undefined {
  const normal = win32.normalize(path);
  if (!normal.startsWith("\\\\")) return undefined;
  const parts = normal.slice(2).split("\\");
  const device = parts[0] === "?" || parts[0] === ".";
  const start = device && parts[1]?.toLowerCase() === "unc" ? 2 : 0;
  return parts.slice(start, start + 2).join("\\").toLowerCase();
}

/**
 * This function tells if an absolute path is a network or device path of Windows on another share
 * than the root. An open of a network path connects to its host, so the root check refuses such
 * a path before it opens it. On other systems, the result is false.
 */
export function isOtherShare(root: ResolvedRoot, absolute: string, platform: NodeJS.Platform = process.platform): boolean {
  if (platform !== "win32") return false;
  const share = windowsShare(absolute);
  return share !== undefined && share !== windowsShare(root.folder) && share !== windowsShare(root.real);
}

/**
 * This function gives the absolute path and the real path of a root. The root must exist. The
 * error of a missing root names `owner`, for example "the archive procedures".
 */
export async function resolveRoot(root: string, owner = "the file procedures"): Promise<ResolvedRoot> {
  const folder = resolve(root);
  try {
    return { folder, real: await realpath(folder) };
  } catch (error) {
    if (!isMissing(error)) throw error;
    const missing = new Error(`The root of ${owner} does not exist: ${folder}`) as NodeJS.ErrnoException;
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
 * symlink of the path, also a symlink whose target does not exist. A network or device path of
 * another share (`isOtherShare`) is outside, and the function does not open it.
 */
export async function realPathIsInside(root: ResolvedRoot, absolute: string): Promise<boolean> {
  if (isOtherShare(root, absolute)) return false;
  return isInside(root.real, await realPathOf(absolute));
}

/**
 * This function gives the absolute path of `path` in the root. A relative path starts at `base`,
 * and the default `base` is the root. The real path decides: a path whose real path is outside the
 * real path of the root gives `FORBIDDEN` with the reason `outside-root`.
 */
export async function inRoot(root: ResolvedRoot, path: string, procedure: ProcedurePath, base: string = root.folder): Promise<string> {
  const absolute = resolve(base, path);
  // The real path of a network path opens a connection to its host, so this check comes first
  if (isOtherShare(root, absolute)) {
    throw outsideRoot(procedure, `the path ${JSON.stringify(path)} is a network or device path outside the root ${root.folder}`);
  }
  const real = await realPathOf(absolute);
  // A path counts as inside by its given form or by its real form. On Windows, the two forms of a
  // folder can differ by more than the links: a short 8.3 name (RUNNER~1) has a long real name.
  if (!isInside(root.folder, absolute) && !isInside(root.real, absolute) && !isInside(root.real, real)) {
    throw outsideRoot(procedure, `the path ${JSON.stringify(path)} is outside the root ${root.folder}`);
  }
  if (!isInside(root.real, real)) {
    throw outsideRoot(procedure, `the path ${JSON.stringify(path)} leads out of the root ${root.folder} through a symlink`);
  }
  return absolute;
}
