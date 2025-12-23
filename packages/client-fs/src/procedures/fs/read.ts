/**
 * read procedure
 *
 * Read file contents
 */

import { readFile } from "node:fs/promises";
import type { ReadInput, ReadOutput } from "../../types.js";
import { stat } from "./stat.js";

/**
 * Read file contents
 */
export async function read(input: ReadInput): Promise<ReadOutput> {
  const { path, encoding } = input;
  const content = await readFile(path, { encoding: encoding as BufferEncoding });
  const stats = await stat({path});
  return {
    content,
    path,
    stats
  };
}
