/**
 * mkdir procedure
 *
 * Create directory
 */

import { mkdir as fsMkdir, stat } from "node:fs/promises";
import type { MkdirInput, MkdirOutput } from "../../types.js";

/**
 * Create directory
 */
export async function mkdir(input: MkdirInput): Promise<MkdirOutput> {
  const { path, recursive } = input;
  try {
    await stat(path);
    return { path, created: false };
  } catch {
    await fsMkdir(path, { recursive });
    return { path, created: true };
  }
}
