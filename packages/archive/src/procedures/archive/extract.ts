/**
 * archive.extract procedure
 *
 * Extract a tar.gz, tar or zip archive into a folder. The procedure examines all the entries
 * before it writes a file (`planExtract()`): an entry with `..` or an absolute path, a symbolic
 * link out of the target, an entry through a link, a special file, an existing file without
 * `overwrite`, or an archive over the limits changes nothing.
 *
 * A damaged entry (its size or its CRC-32) stops the extract, and the files before it stay.
 *
 * With the root of the module, the archive and the target must be in the root. The checks of the
 * entries keep each entry in the target, so the extract stays in the root.
 */

import { lstat, mkdir, realpath, rm, symlink, unlink, utimes } from "node:fs/promises";
import { dirname, join } from "node:path";
import { DEFAULT_ARCHIVE_SETTINGS, formatOfFile, type ArchiveSettings } from "../../format.js";
import { planExtract, type PlannedEntry, type RawEntry } from "../../paths.js";
import { isInside, outsideRoot, placesOf } from "../../root.js";
import { extractTar, readTarEntries } from "../../tar.js";
import { extractZipFile, readZipDirectory, readZipLink, type ZipEntry } from "../../zip.js";
import type { ArchiveExtractInput, ArchiveExtractOutput } from "../../types.js";

/** This function removes an old file or link at a path, so a new write does not follow it. */
async function clear(path: string): Promise<void> {
  const found = await lstat(path).catch(() => undefined);
  if (found !== undefined && !found.isDirectory()) await unlink(path);
}

/** This function writes the checked entries of a zip, in the order of the archive. */
async function writeZipEntries(archive: string, target: string, planned: readonly PlannedEntry[], zipEntries: readonly ZipEntry[]): Promise<void> {
  for (const entry of planned) {
    const destination = join(target, ...entry.parts);
    if (entry.kind === "directory") {
      await mkdir(destination, { recursive: true });
      continue;
    }
    await mkdir(dirname(destination), { recursive: true });
    await clear(destination);
    if (entry.kind === "symlink") {
      await symlink(entry.linkTarget ?? "", destination);
      continue;
    }
    const zipEntry = zipEntries[entry.index!]!;
    try {
      await extractZipFile(archive, zipEntry, destination, zipEntry.mode === undefined ? undefined : zipEntry.mode & 0o777);
    } catch (error) {
      // A damaged entry leaves no part of its file
      await rm(destination, { force: true });
      throw error;
    }
    await utimes(destination, zipEntry.mtime, zipEntry.mtime);
  }
}

/** The counts of the output. */
function countsOf(planned: readonly PlannedEntry[]): Pick<ArchiveExtractOutput, "files" | "directories" | "links" | "bytes"> {
  let files = 0;
  let directories = 0;
  let links = 0;
  let bytes = 0;
  for (const entry of planned) {
    if (entry.kind === "file") {
      files++;
      bytes += entry.size;
    } else if (entry.kind === "directory") {
      directories++;
    } else {
      links++;
    }
  }
  return { files, directories, links, bytes };
}

/**
 * Extract a tar.gz or zip archive into a folder, with a check of each path
 */
export async function archiveExtract(input: ArchiveExtractInput, settings: ArchiveSettings = DEFAULT_ARCHIVE_SETTINGS): Promise<ArchiveExtractOutput> {
  const places = await placesOf(settings.root, ["archive", "extract"]);
  const archive = await places.place(input.archive);
  const folder = await places.place(input.target);
  const format = await formatOfFile(archive, input.format);
  const overwrite = input.overwrite === true;

  // The entries, before a write
  let raw: RawEntry[];
  let zipEntries: ZipEntry[] = [];
  if (format === "zip") {
    zipEntries = await readZipDirectory(archive, settings.maxEntries);
    raw = [];
    for (const [index, entry] of zipEntries.entries()) {
      raw.push({ name: entry.name, kind: entry.kind, size: entry.size, index, ...(entry.kind === "symlink" ? { linkTarget: await readZipLink(archive, entry) } : {}) });
    }
  } else {
    raw = (await readTarEntries(archive, settings)).map((entry) => ({ name: entry.name, kind: entry.kind, size: entry.size, linkTarget: entry.linkTarget }));
  }

  await mkdir(folder, { recursive: true });
  const target = await realpath(folder);
  // A link that came after the check of the root does not lead the extract out of it
  if (places.root !== undefined && !isInside(places.root.real, target)) {
    throw outsideRoot(["archive", "extract"], `the target ${JSON.stringify(input.target)} leads out of the root ${places.root.folder}`);
  }
  const planned = planExtract(raw, target, { overwrite, maxBytes: settings.maxBytes, maxEntries: settings.maxEntries });

  if (format === "zip") {
    await writeZipEntries(archive, target, planned, zipEntries);
  } else if (planned.length > 0) {
    await extractTar(archive, target, new Set(planned.map((entry) => entry.name)));
  }
  return { target, format, ...countsOf(planned) };
}
