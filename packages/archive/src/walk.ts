/**
 * The walk of `archive.create`: each file, folder and symbolic link under the inputs, in a fixed
 * order. The walk does not follow a link: the archive gets the link itself.
 */

import { lstat, readdir, readlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { ArchiveError } from "./errors.js";

/** One path for the archive. */
export interface WalkEntry {
  /** The name in the archive: relative, with `/`. */
  readonly name: string;
  /** The absolute path on the disk. */
  readonly path: string;
  readonly kind: "file" | "directory" | "symlink";
  readonly size: number;
  readonly mode: number;
  readonly mtime: Date;
  readonly linkTarget?: string | undefined;
}

/** The limits and the paths to leave out (the new archive and its temporary file). */
export interface WalkOptions {
  readonly maxEntries: number;
  readonly maxBytes: number;
  readonly exclude: ReadonlySet<string>;
}

const byName = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** This function walks the names (relative to `base`) and gives each entry for the archive. */
export async function walk(base: string, names: readonly string[], options: WalkOptions): Promise<WalkEntry[]> {
  const entries: WalkEntry[] = [];
  const seen = new Set<string>();
  let bytes = 0;

  const visit = async (name: string): Promise<void> => {
    const path = resolve(base, ...name.split("/"));
    if (options.exclude.has(path) || seen.has(name)) return;
    seen.add(name);
    let stats;
    try {
      stats = await lstat(path);
    } catch {
      throw new ArchiveError("UNSAFE_PATH", `${path} does not exist`, name);
    }
    if (entries.length >= options.maxEntries) throw new ArchiveError("TOO_LARGE", `The archive gets more entries than the limit of ${options.maxEntries}`, name);
    const common = { name, path, size: 0, mode: stats.mode & 0o7777, mtime: stats.mtime };
    if (stats.isSymbolicLink()) {
      entries.push({ ...common, kind: "symlink", linkTarget: await readlink(path) });
    } else if (stats.isDirectory()) {
      entries.push({ ...common, kind: "directory" });
      const children = (await readdir(path)).sort(byName);
      for (const child of children) await visit(`${name}/${child}`);
    } else if (stats.isFile()) {
      bytes += stats.size;
      if (bytes > options.maxBytes) throw new ArchiveError("TOO_LARGE", `The files have more than ${options.maxBytes} bytes`, name);
      entries.push({ ...common, kind: "file", size: stats.size });
    } else {
      throw new ArchiveError("UNSUPPORTED_ENTRY", `${path} is a special file (a socket, a device or a FIFO)`, name);
    }
  };

  for (const name of names) await visit(name);
  return entries;
}

/** The names of the content of a folder, sorted. */
export async function folderNames(folder: string): Promise<string[]> {
  return (await readdir(folder)).sort(byName);
}

/** The absolute path of a name under a base. */
export function under(base: string, name: string): string {
  return join(base, ...name.split("/"));
}
