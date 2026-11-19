/**
 * The procedure `fs.read` reads a file, or a part of a file, as text.
 *
 * - `offset` and `length` give a part of the file in bytes. Without them, the procedure reads the
 *   whole file.
 * - `maxBytes` is the largest count of bytes that the procedure loads. The default is 16 MiB. A
 *   larger part gives the error `ERR_FS_FILE_TOO_LARGE`. For a regular file, the error comes before
 *   the read. For a pipe or a file of the system with no size, it comes when the count goes over the
 *   limit.
 */

import { open, type FileHandle } from "node:fs/promises";
import type { ReadInput, ReadOutput } from "../../types.js";
import { stat } from "./stat.js";

/** The largest count of bytes that a read loads when the input gives no `maxBytes`: 16 MiB. */
const DEFAULT_MAX_BYTES = 16 * 1024 * 1024;

/** The largest piece in bytes of one read of the file. */
const CHUNK_BYTES = 1024 * 1024;

/** This function gives the error of a part over the limit `maxBytes`. */
function tooLarge(path: string, maxBytes: number): RangeError {
  const message = `fs.read: the part of ${JSON.stringify(path)} to read has more than ${String(maxBytes)} bytes, the limit maxBytes. Give a larger maxBytes, or offset and length for a smaller part.`;
  return Object.assign(new RangeError(message), { code: "ERR_FS_FILE_TOO_LARGE" });
}

/**
 * This function reads the part of an open file. With an offset of 0, it reads from the position of
 * the handle, so a pipe also works. It stops at the end of the file, at `length`, or with an error
 * when the count goes over `maxBytes`.
 */
async function readPart(handle: FileHandle, path: string, offset: number, length: number | undefined, maxBytes: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  const want = length ?? Number.POSITIVE_INFINITY;
  let total = 0;
  while (total < want) {
    const size = Math.min(CHUNK_BYTES, want - total);
    const chunk = Buffer.allocUnsafe(size);
    const { bytesRead } = await handle.read(chunk, 0, size, offset === 0 ? null : offset + total);
    if (bytesRead === 0) break;
    total += bytesRead;
    if (total > maxBytes) throw tooLarge(path, maxBytes);
    chunks.push(bytesRead === size ? chunk : chunk.subarray(0, bytesRead));
  }
  return Buffer.concat(chunks, total);
}

/**
 * This function reads a file, or the part that `offset` and `length` give, and decodes it with
 * `encoding`. It loads `maxBytes` at most, or 16 MiB when the input gives no `maxBytes`.
 */
export async function read(input: ReadInput): Promise<ReadOutput> {
  const { path, encoding, offset = 0, length, maxBytes = DEFAULT_MAX_BYTES } = input;
  if (!Buffer.isEncoding(encoding)) {
    const message = `fs.read: ${JSON.stringify(encoding)} is not an encoding of Node.js`;
    throw Object.assign(new TypeError(message), { code: "ERR_INVALID_ARG_VALUE" });
  }
  const handle = await open(path, "r");
  let bytes: Buffer;
  try {
    const info = await handle.stat();
    // The size of a regular file gives the size of the part before the read
    if (info.isFile()) {
      const part = Math.max(0, Math.min(info.size - offset, length ?? Number.POSITIVE_INFINITY));
      if (part > maxBytes) throw tooLarge(path, maxBytes);
    }
    bytes = await readPart(handle, path, offset, length, maxBytes);
  } finally {
    await handle.close();
  }
  const stats = await stat({ path });
  return {
    content: bytes.toString(encoding),
    path,
    stats,
  };
}
