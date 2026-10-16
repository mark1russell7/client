/**
 * copy procedure
 *
 * Copy file or directory
 */

import { copyFile, cp, constants, lstat } from "node:fs/promises";
import type { CopyInput, CopyOutput } from "../../types.js";

/** This function gives true when something exists at the path: a file, a folder or a link. */
async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

/**
 * Copy file or directory.
 *
 * Without `overwrite`, an existing destination is an error with the code `EEXIST`, and the copy
 * changes nothing. Before, the default copy (`recursive: true`) kept an existing file and
 * reported success (roadmap R33). With `overwrite`, the copy replaces the files at the
 * destination.
 */
export async function copy(input: CopyInput): Promise<CopyOutput> {
  const { src, dest, recursive, overwrite } = input;

  if (!overwrite && (await exists(dest))) {
    throw Object.assign(new Error(`Destination already exists: ${dest}. Set overwrite to replace it.`), {
      code: "EEXIST",
      path: dest,
    });
  }

  if (recursive) {
    // errorOnExist: a file that appears at the destination after the check is an error too
    await cp(src, dest, { recursive, force: overwrite, errorOnExist: !overwrite });
  } else {
    await copyFile(src, dest, overwrite ? 0 : constants.COPYFILE_EXCL);
  }

  return { src, dest };
}
