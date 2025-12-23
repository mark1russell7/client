/**
 * rm procedure
 *
 * Remove file or directory
 */

import { rm as fsRm } from "node:fs/promises";
import type { RmInput, RmOutput } from "../../types.js";
import { stat } from "./stat.js";

/**
 * Remove file or directory
 */
export async function rm(input: RmInput): Promise<RmOutput> {
  const { path, recursive, force } = input;
  try {
    await stat(input);
    await fsRm(path, { recursive, force });
    return { path, removed: true };
  } catch (err) {
    if (force) {
      return { path, removed: false };
    }
    throw err;
  }
}
