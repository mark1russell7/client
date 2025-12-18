/**
 * read.json procedure
 *
 * Read and parse JSON file
 */

import { readFile } from "node:fs/promises";
import type { ReadJsonInput, ReadJsonOutput } from "../../types.js";

/**
 * Read and parse JSON file
 */
export async function readJson(input: ReadJsonInput): Promise<ReadJsonOutput> {
  const { path } = input;
  const content = await readFile(path, { encoding: "utf8" });
  const data = JSON.parse(content);
  return { path, data };
}
