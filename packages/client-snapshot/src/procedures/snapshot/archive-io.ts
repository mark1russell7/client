/**
 * File access for snapshot archives without the whole archive in memory.
 *
 * Before, create and restore read each archive into memory (for the checksum and the upload).
 * An archive over 2 GiB failed, and the peak was about 2.3 times the archive (deep dive DATA-19).
 */

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import type { FileHandle } from "node:fs/promises";

/** The SHA-256 of a file, read as a stream. */
export async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk as Buffer);
  }
  return hash.digest("hex");
}

/** The bytes of a file from `offset`, at most `size`. */
export async function readPart(file: FileHandle, offset: number, size: number): Promise<Buffer> {
  const buffer = Buffer.alloc(size);
  let filled = 0;
  while (filled < size) {
    const { bytesRead } = await file.read(buffer, filled, size - filled, offset + filled);
    if (bytesRead === 0) break;
    filled += bytesRead;
  }
  return buffer.subarray(0, filled);
}
