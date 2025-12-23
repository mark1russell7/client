/**
 * stat procedure
 *
 * Get file or directory stats
 */

import { stat as fsStat } from "node:fs/promises";
import { FileType, type StatInput, type StatOutput } from "../../types.js";

/**
 * Get file or directory stats
 */
export async function stat(input: StatInput): Promise<StatOutput> {
  const { path } = input;
  const stats = await fsStat(path);

  let type: FileType = FileType.Other;
  if (stats.isFile()) type = FileType.File;
  else if (stats.isDirectory()) type = FileType.Directory;

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
