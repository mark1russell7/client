/**
 * copy procedure
 *
 * Copy file or directory
 */

import { copyFile, cp, constants } from "node:fs/promises";
import type { CopyInput, CopyOutput } from "../../types.js";

/**
 * Copy file or directory
 */
export async function copy(input: CopyInput): Promise<CopyOutput> {
  const { src, dest, recursive, overwrite } = input;
  const flags = overwrite ? 0 : constants.COPYFILE_EXCL;

  if (recursive) {
    await cp(src, dest, { recursive, force: overwrite });
  } else {
    await copyFile(src, dest, flags);
  }

  return { src, dest };
}
