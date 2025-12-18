/**
 * move procedure
 *
 * Move or rename file/directory
 */

import { rename, stat, rm, cp } from "node:fs/promises";
import type { MoveInput, MoveOutput } from "../../types.js";

/**
 * Move or rename file/directory
 */
export async function move(input: MoveInput): Promise<MoveOutput> {
  const { src, dest, overwrite } = input;

  if (!overwrite) {
    try {
      await stat(dest);
      throw new Error(`Destination already exists: ${dest}`);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
  }

  try {
    await rename(src, dest);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EXDEV") {
      await cp(src, dest, { recursive: true, force: overwrite });
      await rm(src, { recursive: true });
    } else {
      throw err;
    }
  }

  return { src, dest };
}
