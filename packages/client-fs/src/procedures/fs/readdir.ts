/**
 * readdir procedure
 *
 * Read directory contents
 */

import { readdir as fsReaddir, stat } from "node:fs/promises";
import { join } from "node:path";
import type { ReaddirInput, ReaddirOutput, ReaddirEntry } from "../../types.js";

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
      let type: "file" | "directory" | "other" = "other";
      if (item.isFile()) type = "file";
      else if (item.isDirectory()) type = "directory";

      const entry: ReaddirEntry = { name: item.name, path: fullPath, type };

      if (includeStats) {
        const stats = await stat(fullPath);
        entry.stats = {
          size: stats.size,
          mtime: stats.mtime.toISOString(),
          ctime: stats.ctime.toISOString(),
        };
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
