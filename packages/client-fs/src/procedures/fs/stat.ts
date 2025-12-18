/**
 * stat procedure
 *
 * Get file or directory stats
 */

import { stat as fsStat } from "node:fs/promises";
import type { StatInput, StatOutput } from "../../types.js";

/**
 * Get file or directory stats
 */
export async function stat(input: StatInput): Promise<StatOutput> {
  const { path } = input;
  const stats = await fsStat(path);

  let type: "file" | "directory" | "other" = "other";
  if (stats.isFile()) type = "file";
  else if (stats.isDirectory()) type = "directory";

  return {
    path,
    type,
    size: stats.size,
    mtime: stats.mtime.toISOString(),
    ctime: stats.ctime.toISOString(),
    atime: stats.atime.toISOString(),
    mode: stats.mode,
  };
}
