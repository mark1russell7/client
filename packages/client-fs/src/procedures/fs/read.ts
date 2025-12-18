/**
 * read procedure
 *
 * Read file contents
 */

import { readFile, stat } from "node:fs/promises";
import type { ReadInput, ReadOutput } from "../../types.js";

/**
 * Read file contents
 */
export async function read(input: ReadInput): Promise<ReadOutput> {
  const { path, encoding } = input;
  const content = await readFile(path, { encoding: encoding as BufferEncoding });
  const stats = await stat(path);
  return {
    content,
    path,
    size: stats.size,
  };
}
