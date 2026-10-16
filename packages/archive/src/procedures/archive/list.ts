/**
 * archive.list procedure
 *
 * The entries of a tar.gz, tar or zip archive: the path, the kind, the size, the mode, the time
 * and the target of a link. The list reads the archive and writes nothing.
 */

import { resolve } from "node:path";
import { DEFAULT_ARCHIVE_SETTINGS, formatOfFile, type ArchiveSettings } from "../../format.js";
import { readTarEntries } from "../../tar.js";
import { readZipDirectory, readZipLink } from "../../zip.js";
import type { ArchiveEntry, ArchiveFormat, ArchiveListInput, ArchiveListOutput } from "../../types.js";

/** The entries of an archive of a known format. `extract` uses them too. */
export async function readEntries(path: string, format: ArchiveFormat, settings: ArchiveSettings): Promise<ArchiveEntry[]> {
  if (format === "zip") {
    const entries = await readZipDirectory(path, settings.maxEntries);
    const result: ArchiveEntry[] = [];
    for (const entry of entries) {
      result.push({
        path: entry.name,
        kind: entry.kind,
        size: entry.size,
        ...(entry.mode !== undefined ? { mode: entry.mode } : {}),
        mtime: entry.mtime.toISOString(),
        ...(entry.kind === "symlink" ? { linkTarget: await readZipLink(path, entry) } : {}),
      });
    }
    return result;
  }
  const entries = await readTarEntries(path, settings);
  return entries.map((entry) => ({
    path: entry.name,
    kind: entry.kind,
    size: entry.size,
    ...(entry.mode !== undefined ? { mode: entry.mode & 0o7777 } : {}),
    ...(entry.mtime !== undefined ? { mtime: entry.mtime.toISOString() } : {}),
    ...(entry.linkTarget !== undefined ? { linkTarget: entry.linkTarget } : {}),
  }));
}

/**
 * The entries of a tar.gz or zip archive
 */
export async function archiveList(input: ArchiveListInput, settings: ArchiveSettings = DEFAULT_ARCHIVE_SETTINGS): Promise<ArchiveListOutput> {
  const path = resolve(input.archive);
  const format = await formatOfFile(path, input.format);
  const entries = await readEntries(path, format, { ...settings, maxBytes: Number.MAX_SAFE_INTEGER });
  return { format, entries, bytes: entries.reduce((sum, entry) => sum + (entry.kind === "file" ? entry.size : 0), 0) };
}
