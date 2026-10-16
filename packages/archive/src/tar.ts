/**
 * Tar and tar.gz archives with `tar` (node-tar), the tar library of npm.
 *
 * - The list reads the headers with a `Parser`. It stops at the limit of entries or of bytes, so a
 *   compressed archive with a very large content stops early.
 * - The extract runs after the check of `planExtract()`. It keeps the protections of node-tar:
 *   no absolute path, no `..`, and no write through a symbolic link. Its filter lets only the
 *   checked entries through, and `strict` makes each warning an error.
 */

import { createReadStream } from "node:fs";
import { createGunzip, gzipSync } from "node:zlib";
import { open, writeFile } from "node:fs/promises";
import { create, extract, Parser, type ReadEntry } from "tar";
import { ArchiveError } from "./errors.js";
import type { ArchiveEntryKind } from "./types.js";

/** One header of a tar archive. */
export interface TarEntryInfo {
  readonly name: string;
  readonly kind: ArchiveEntryKind;
  readonly size: number;
  readonly mode: number | undefined;
  readonly mtime: Date | undefined;
  readonly linkTarget: string | undefined;
}

/** The kind of a tar entry type. */
function kindOf(type: string): ArchiveEntryKind {
  switch (type) {
    case "File":
    case "OldFile":
    case "ContiguousFile":
      return "file";
    case "Directory":
      return "directory";
    case "SymbolicLink":
      return "symlink";
    case "Link":
      return "hardlink";
    default:
      return "other";
  }
}

/** An error of node-tar as an `ArchiveError`. */
function archiveErrorOf(error: unknown): ArchiveError {
  if (error instanceof ArchiveError) return error;
  const message = error instanceof Error ? error.message : String(error);
  return new ArchiveError("BAD_ARCHIVE", `The tar archive is damaged: ${message}`);
}

/** The most zero bytes of an empty tar: an empty tar of GNU tar has 10240. */
const MAX_EMPTY_TAR_BYTES = 1024 * 1024;

/**
 * True when the content of a tar or tar.gz archive is only zero bytes: an archive without
 * entries. node-tar calls such an archive "unrecognized". The check reads at most 1 MiB.
 */
async function isEmptyTar(path: string): Promise<boolean> {
  const head = Buffer.alloc(2);
  const handle = await open(path, "r");
  try {
    await handle.read(head, 0, 2, 0);
  } finally {
    await handle.close();
  }
  const input = createReadStream(path);
  const stream = head[0] === 0x1f && head[1] === 0x8b ? input.pipe(createGunzip()) : input;
  let bytes = 0;
  try {
    for await (const chunk of stream as AsyncIterable<Buffer>) {
      bytes += chunk.length;
      if (bytes > MAX_EMPTY_TAR_BYTES || chunk.some((byte) => byte !== 0)) return false;
    }
    return bytes > 0;
  } catch {
    return false;
  } finally {
    input.destroy();
  }
}

/**
 * This function reads the headers of a tar or tar.gz archive. It throws `TOO_LARGE` at more than
 * `maxEntries` entries or more than `maxBytes` bytes of files.
 */
export async function readTarEntries(path: string, limits: { maxEntries: number; maxBytes: number }): Promise<TarEntryInfo[]> {
  try {
    return await parseTarEntries(path, limits);
  } catch (error) {
    if (error instanceof ArchiveError && error.code === "BAD_ARCHIVE" && error.message.includes("TAR_BAD_ARCHIVE") && (await isEmptyTar(path))) return [];
    throw error;
  }
}

async function parseTarEntries(path: string, limits: { maxEntries: number; maxBytes: number }): Promise<TarEntryInfo[]> {
  const entries: TarEntryInfo[] = [];
  let bytes = 0;
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const input = createReadStream(path);
    const finish = (error?: unknown): void => {
      if (settled) return;
      settled = true;
      if (error === undefined) {
        resolve();
        return;
      }
      input.destroy();
      reject(archiveErrorOf(error));
    };
    const parser = new Parser({
      strict: true,
      onReadEntry: (entry: ReadEntry) => {
        entry.resume();
        if (settled) return;
        const kind = kindOf(entry.type);
        if (kind === "file") bytes += entry.size;
        if (entries.length >= limits.maxEntries) {
          finish(new ArchiveError("TOO_LARGE", `The archive has more entries than the limit of ${limits.maxEntries}`));
          return;
        }
        if (bytes > limits.maxBytes) {
          finish(new ArchiveError("TOO_LARGE", `The files of the archive have more than ${limits.maxBytes} bytes`, entry.path));
          return;
        }
        entries.push({
          name: entry.path,
          kind,
          size: entry.size,
          mode: entry.mode,
          mtime: entry.mtime,
          linkTarget: entry.linkpath === undefined || entry.linkpath === "" ? undefined : entry.linkpath,
        });
      },
    });
    parser.on("warn", (code: string, message: string | Error) => finish(new ArchiveError("BAD_ARCHIVE", `The tar archive is damaged: ${code} ${message instanceof Error ? message.message : message}`)));
    parser.on("error", (error: unknown) => finish(error));
    parser.on("end", () => finish());
    input.on("error", (error) => finish(error));
    input.on("data", (chunk) => {
      if (settled) return;
      if (!parser.write(chunk as Buffer)) {
        input.pause();
        parser.once("drain", () => input.resume());
      }
    });
    input.on("end", () => {
      if (!settled) parser.end();
    });
  });
  return entries;
}

/**
 * This function extracts a tar or tar.gz archive into `target`, after the check. Only the names
 * of `allowed` pass the filter. A name that the check did not see is an error at the end.
 */
export async function extractTar(path: string, target: string, allowed: ReadonlySet<string>): Promise<void> {
  const refused: string[] = [];
  try {
    await extract({
      file: path,
      cwd: target,
      strict: true,
      preservePaths: false,
      preserveOwner: false,
      // Remove an old file before the new one: the write never goes through a link or into a hard link
      unlink: true,
      filter: (name: string) => {
        if (allowed.has(name)) return true;
        refused.push(name);
        return false;
      },
    });
  } catch (error) {
    throw archiveErrorOf(error);
  }
  const unexpected = refused.filter((name) => name.split(/[/\\]+/).some((part) => part !== "" && part !== "."));
  if (unexpected.length > 0) {
    throw new ArchiveError("BAD_ARCHIVE", `The archive changed during the extract: ${unexpected[0]} was not in the check`, unexpected[0]);
  }
}

/**
 * This function writes a tar or tar.gz archive of the `names` (relative to `cwd`) to `file`. The
 * names are the full list: the walk of `archive.create` gives each file and folder.
 */
export async function createTar(file: string, cwd: string, names: readonly string[], gzip: boolean): Promise<void> {
  if (names.length === 0) {
    // An empty tar: two blocks of zeros
    const empty = Buffer.alloc(1024);
    await writeFile(file, gzip ? gzipSync(empty) : empty, { flag: "wx" });
    return;
  }
  await create({ file, cwd, gzip, portable: true, follow: false, noDirRecurse: true }, [...names]);
}
