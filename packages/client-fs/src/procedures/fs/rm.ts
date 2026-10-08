/**
 * rm procedure
 *
 * Remove file or directory
 */

import { rm as fsRm } from "node:fs/promises";
import type { RmInput, RmOutput } from "../../types.js";

/**
 * Remove file or directory
 */
export async function rm(input: RmInput): Promise<RmOutput> {
  const { path, recursive, force } = input;
  // Always call with force:false so Node reports a missing path via ENOENT
  // (letting us distinguish "removed" from "didn't exist"). Node's `force`
  // option only suppresses ENOENT anyway, so replicating it here keeps the
  // exact same behavior while still surfacing EPERM/ENOTEMPTY/EBUSY/etc.
  try {
    await fsRm(path, { recursive, force: false });
    return { path, removed: true };
  } catch (err) {
    // With force:true a non-existent path is not an error — report it as
    // "nothing removed". Every other error (permissions, non-empty, busy) must
    // propagate rather than being silently swallowed.
    if (force && (err as NodeJS.ErrnoException).code === "ENOENT") {
      return { path, removed: false };
    }
    throw err;
  }
}
