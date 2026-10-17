/**
 * archive.create procedure
 *
 * Make a tar.gz, tar or zip archive of a folder or of files. The procedure writes a temporary
 * file next to the archive, and renames it at the end: a failed call leaves no part of an
 * archive. The walk does not follow a symbolic link: the archive gets the link.
 *
 * With the root of the module, the archive, the source, `cwd` and the folder of each file must be
 * in the root. A link in the input goes into the archive as a link: the walk does not read its target.
 */

import { randomBytes } from "node:crypto";
import { mkdir, open, readFile, rename, rm, stat } from "node:fs/promises";
import { dirname } from "node:path";
import { ArchiveError } from "../../errors.js";
import { DEFAULT_ARCHIVE_SETTINGS, formatOfName, type ArchiveSettings } from "../../format.js";
import { entryParts } from "../../paths.js";
import { placesOf, type Places } from "../../root.js";
import { createTar } from "../../tar.js";
import { folderNames, under, walk } from "../../walk.js";
import { writeZip, type ZipWriteEntry } from "../../zip.js";
import type { ArchiveCreateInput, ArchiveCreateOutput } from "../../types.js";

/** The base folder and the names of the input. Exactly one of `source` and `files`. */
async function inputNames(input: ArchiveCreateInput, places: Places): Promise<{ base: string; names: string[] }> {
  if ((input.source === undefined) === (input.files === undefined)) {
    throw new ArchiveError("UNSAFE_PATH", "archive.create needs exactly one of source and files");
  }
  if (input.source !== undefined) {
    const base = await places.place(input.source);
    const stats = await stat(base).catch(() => undefined);
    if (!stats?.isDirectory()) throw new ArchiveError("UNSAFE_PATH", `The source ${base} is not a folder`);
    return { base, names: await folderNames(base) };
  }
  const base = await places.place(input.cwd ?? (places.root === undefined ? process.cwd() : "."));
  const names = (input.files ?? []).map((name) => {
    const parts = entryParts(name);
    if (parts.length === 0) throw new ArchiveError("UNSAFE_PATH", `The file ${JSON.stringify(name)} names the base folder: give source for a whole folder`, name);
    return parts.join("/");
  });
  // The walk reads through the folders of a name: they must be in the root
  if (places.root !== undefined) for (const name of names) await places.place(dirname(under(base, name)));
  return { base, names };
}

/**
 * Make a tar.gz or zip archive of a folder or of files
 */
export async function archiveCreate(input: ArchiveCreateInput, settings: ArchiveSettings = DEFAULT_ARCHIVE_SETTINGS): Promise<ArchiveCreateOutput> {
  const places = await placesOf(settings.root, ["archive", "create"]);
  const output = await places.place(input.output);
  const format = formatOfName(input.output, input.format);
  const existing = await stat(output).catch(() => undefined);
  if (existing?.isDirectory()) throw new ArchiveError("EXISTS", `${output} is a folder`);
  if (existing !== undefined && input.overwrite !== true) throw new ArchiveError("EXISTS", `${output} exists: give overwrite: true to replace it`);

  const { base, names } = await inputNames(input, places);
  const temporary = `${output}.${randomBytes(6).toString("hex")}.tmp`;
  const entries = await walk(base, names, { ...settings, exclude: new Set([output, temporary]) });

  await mkdir(dirname(output), { recursive: true });
  try {
    if (format === "zip") {
      const items: ZipWriteEntry[] = entries.map((entry) => ({
        name: entry.name,
        kind: entry.kind,
        mode: entry.mode,
        mtime: entry.mtime,
        data: entry.kind === "file" ? () => readFile(entry.path) : entry.kind === "symlink" ? Buffer.from(entry.linkTarget ?? "", "utf8") : undefined,
      }));
      const handle = await open(temporary, "wx");
      try {
        await writeZip(handle, items);
      } finally {
        await handle.close();
      }
    } else {
      await createTar(
        temporary,
        base,
        entries.map((entry) => entry.name),
        format === "tar.gz",
      );
    }
    await rename(temporary, output);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
  return { path: output, format, entries: entries.length, bytes: (await stat(output)).size };
}
