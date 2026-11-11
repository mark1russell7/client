/**
 * The destination of a symlink: the path that a relative target of a link leads to, as the system
 * resolves it. The root check (`root.ts`) uses it for a link whose target does not exist, because
 * a write follows such a link and makes its target.
 *
 * The two systems use different rules for a `..` in a relative target:
 * - POSIX follows the folders: `..` goes up from the real folder that the names before it lead to.
 *   So in the target `a/../x`, where `a` is a link to a folder, `..` is the parent of the target of
 *   `a`.
 * - Windows reads the target as text: it joins the real folder of the link and the target, and a
 *   `..` removes the name before it. So `a\..\x` is `x` in the folder of the link.
 *
 * A test of `root.test.ts` writes through a table of links with `node:fs` on each system and
 * compares the file that the system makes with the result of this function.
 */

import { realpath } from "node:fs/promises";
import { dirname, join, parse, resolve, sep } from "node:path";

/** True for the error of a path that does not exist. */
export function isMissing(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return code === "ENOENT" || code === "ENOTDIR";
}

/** The real path of a path, or the path itself when it does not exist. */
async function realOrSame(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch (error) {
    if (isMissing(error)) return path;
    throw error;
  }
}

/**
 * How a system reads a relative target of a symlink: `folders` follows the real folders of the
 * names (POSIX), `text` removes a name before `..` as text (Windows).
 */
export type LinkRule = "folders" | "text";

/** The rule of the system of this process. */
export const SYSTEM_LINK_RULE: LinkRule = process.platform === "win32" ? "text" : "folders";

/**
 * This function gives the path that the target of a symlink leads to. A relative target starts at
 * the real folder of the link, not at the text of the path: an earlier link to a folder changes
 * the folder of the link. With the rule `folders`, each name of the target before its last name
 * goes to its real path, so a `..` after a link goes up from the target of that link. With the
 * rule `text`, the target joins the real folder of the link as text.
 */
export async function linkDestination(link: string, target: string, rule: LinkRule = SYSTEM_LINK_RULE): Promise<string> {
  // The folder of the link exists: the system read the link in it
  const folder = await realpath(dirname(link));
  if (rule === "text") return resolve(folder, target);
  const { root } = parse(target);
  let current = root === "" ? folder : resolve(folder, root);
  const names = target
    .slice(root.length)
    .split(sep === "\\" ? /[\\/]/ : "/")
    .filter((name) => name !== "" && name !== ".");
  for (const [index, name] of names.entries()) {
    if (name === "..") {
      current = dirname(current);
    } else {
      current = join(current, name);
      if (index < names.length - 1) current = await realOrSame(current);
    }
  }
  return current;
}
