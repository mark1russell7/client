/**
 * read.json procedure
 *
 * Read and parse JSON file
 */

import type { ReadJsonInput, ReadJsonOutput } from "../../types.js";
import { read } from "./read.js";

/**
 * Read and parse JSON file
 */
export async function readJson(input: ReadJsonInput): Promise<ReadJsonOutput> {
  const { path, maxBytes } = input;
  const {
    content,
    stats
  } = await read({ path, encoding: "utf8", maxBytes });
  const data = JSON.parse(content);
  return { path, data, stats };
}
