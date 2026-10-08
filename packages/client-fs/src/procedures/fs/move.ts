/**
 * move procedure
 *
 * Move or rename file/directory
 */

import { cp, rename } from "node:fs/promises";
import type { MoveInput, MoveOutput } from "../../types.js";
import { stat } from "./stat.js";
import { rm } from "./rm.js";

/**
 * Move or rename file/directory
 */
export async function move(input: MoveInput): Promise<MoveOutput> {
  const { src, dest, overwrite } = input;

  if (!overwrite) {
    try {
      await stat({path : dest});
      throw new Error(`Destination already exists: ${dest}`);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
  }

  try {
    await rename(src, dest);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EXDEV") {
      // Cross-device move: copy then delete the source. When not overwriting,
      // use errorOnExist so an already-present destination throws instead of
      // being silently skipped by `cp` — otherwise the subsequent removal of
      // `src` would lose the files that were never copied over.
      await cp(src, dest, {
        recursive: true,
        force: overwrite,
        errorOnExist: !overwrite,
      });
      await rm({ path: src, recursive: true, force: false });
    } else {
      throw err;
    }
  }

  return { src, dest };
}
