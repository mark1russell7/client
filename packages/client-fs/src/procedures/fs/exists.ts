/**
 * exists procedure
 *
 * Check if file or directory exists
 */

import { stat } from "node:fs/promises";
import type { ExistsInput, ExistsOutput } from "../../types.js";

/**
 * Check if file or directory exists
 */
export async function exists(input: ExistsInput): Promise<ExistsOutput> {
  const { path } = input;
  try {
    const stats = await stat(path);
    let type: "file" | "directory" | "other" = "other";
    if (stats.isFile()) type = "file";
    else if (stats.isDirectory()) type = "directory";
    return { exists: true, path, type };
  } catch {
    return { exists: false, path };
  }
}
