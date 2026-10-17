/**
 * The root of the archive procedures: one folder that confines each path (roadmap R33).
 *
 * The rules are the rules of `@procedures/fs/root`, the rules of `createFsModule({ root })`:
 * - A relative path starts at the root, not at the working folder of the process.
 * - A path outside the root gives `FORBIDDEN` with the reason `outside-root`. This includes a
 *   path that goes up with `..`, an absolute path outside the root, a path on another drive, and
 *   a symlink or a junction that leads out of the root.
 * - The check uses the real path (`fs.realpath`) of the path. For a path that does not exist, it
 *   uses the real path of the nearest existing ancestor. So a symlinked parent folder cannot
 *   lead a write or a `mkdir` out of the root.
 *
 * On Windows, the comparison ignores the case of the letters, and `/` and `\` are the same. This
 * file adds only `placesOf()`, the paths of one call of an archive procedure.
 */

import { resolve } from "node:path";
import type { ProcedurePath } from "@procedures/client";
import { inRoot, resolveRoot as resolveFsRoot, type ResolvedRoot } from "@procedures/fs/root";

export { OUTSIDE_ROOT, inRoot, isInside, isOutsideRoot, outsideRoot, realPathIsInside, realPathOf, type ResolvedRoot } from "@procedures/fs/root";

/** This function gives the absolute path and the real path of a root of the archive procedures. The root must exist. */
export function resolveRoot(root: string): Promise<ResolvedRoot> {
  return resolveFsRoot(root, "the archive procedures");
}

/** The paths of one call of a procedure. */
export interface Places {
  /** The root of the call, or undefined for a module without a root. */
  readonly root: ResolvedRoot | undefined;
  /**
   * This function gives the absolute path of a path of the input. Without a root, a relative path
   * starts at the working folder. With a root, it starts at the root, and a path outside it gives
   * `FORBIDDEN` with the reason `outside-root`.
   */
  place(path: string): Promise<string>;
}

/** This function gives the paths of one call. With a root, the root must exist when the call starts. */
export async function placesOf(root: string | undefined, procedure: ProcedurePath): Promise<Places> {
  if (root === undefined) return { root: undefined, place: async (path) => resolve(path) };
  const resolved = await resolveRoot(root);
  return { root: resolved, place: (path) => inRoot(resolved, path, procedure) };
}
