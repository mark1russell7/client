/**
 * readdir procedure
 *
 * Read directory contents
 */

import { readdir as fsReaddir } from "node:fs/promises";
import { join } from "node:path";
import { type ReaddirInput, type ReaddirOutput, type ReaddirEntry, FileType } from "../../types.js";
import { stat } from "./stat.js";

/**
 * Read directory contents
 */
export async function readdir(input: ReaddirInput): Promise<ReaddirOutput> {
  const { path, recursive, includeStats } = input;
  const entries: ReaddirEntry[] = [];

  async function readDir(dir: string): Promise<void> {
    const items = await fsReaddir(dir, { withFileTypes: true });
    for (const item of items) {
      const fullPath = join(dir, item.name);

      let type: FileType = FileType.Other;
      if (item.isFile()) type = FileType.File;
      else if (item.isDirectory()) type = FileType.Directory;

      const entry: ReaddirEntry = { name: item.name, path: fullPath, type };

      if (includeStats) {
        entry.stats = await stat({path : fullPath});
      }

      entries.push(entry);

      if (recursive && item.isDirectory()) {
        await readDir(fullPath);
      }
    }
  }

  await readDir(path);
  return { path, entries };
}
