/**
 * The format of an archive: from the name of a new archive, or from the first bytes of a file.
 * And the limits of the module.
 */

import { open } from "node:fs/promises";
import { ArchiveError } from "./errors.js";
import type { ArchiveFormat } from "./types.js";

/** The limits of the procedures of a module. */
export interface ArchiveSettings {
  /** The most bytes of the files of one archive: `extract` and `create` refuse more. */
  readonly maxBytes: number;
  /** The most entries of one archive. */
  readonly maxEntries: number;
}

/** The default most bytes: 1 GiB. */
export const DEFAULT_MAX_BYTES: number = 1024 * 1024 * 1024;
/** The default most entries. */
export const DEFAULT_MAX_ENTRIES = 100_000;

/** The settings of the default module. */
export const DEFAULT_ARCHIVE_SETTINGS: ArchiveSettings = Object.freeze({ maxBytes: DEFAULT_MAX_BYTES, maxEntries: DEFAULT_MAX_ENTRIES });

/** The format of a new archive from its name, or the format of the input. */
export function formatOfName(path: string, given: ArchiveFormat | undefined): ArchiveFormat {
  if (given !== undefined) return given;
  const name = path.toLowerCase();
  if (name.endsWith(".tar.gz") || name.endsWith(".tgz")) return "tar.gz";
  if (name.endsWith(".tar")) return "tar";
  if (name.endsWith(".zip")) return "zip";
  throw new ArchiveError("BAD_FORMAT", `The name ${path} does not tell the format: give format, or end the name with .tar.gz, .tgz, .tar or .zip`);
}

/** The format that the first bytes of a file show, or undefined. */
export async function sniffFormat(path: string): Promise<ArchiveFormat | undefined> {
  const handle = await open(path, "r");
  try {
    const head = Buffer.alloc(512);
    const { bytesRead } = await handle.read(head, 0, 512, 0);
    if (bytesRead >= 2 && head[0] === 0x1f && head[1] === 0x8b) return "tar.gz";
    if (bytesRead >= 4 && head[0] === 0x50 && head[1] === 0x4b && ((head[2] === 3 && head[3] === 4) || (head[2] === 5 && head[3] === 6))) return "zip";
    if (bytesRead >= 262 && head.toString("latin1", 257, 262) === "ustar") return "tar";
    // An empty tar: zero blocks without a header
    if (bytesRead === 512 && head.every((byte) => byte === 0)) return "tar";
    return undefined;
  } finally {
    await handle.close();
  }
}

/** The format of an existing archive: its first bytes, which must agree with the format of the input. */
export async function formatOfFile(path: string, given: ArchiveFormat | undefined): Promise<ArchiveFormat> {
  const found = await sniffFormat(path);
  if (found === undefined) {
    if (given === "tar") return "tar";
    throw new ArchiveError("BAD_FORMAT", `${path} is not a tar.gz, tar or zip archive`);
  }
  if (given !== undefined && given !== found) {
    throw new ArchiveError("BAD_FORMAT", `${path} is a ${found} archive, not a ${given} archive`);
  }
  return found;
}
