/**
 * The repair of the end of an append-only NDJSON file after a crash (roadmap O51).
 *
 * A crash during an append can leave a part of a line at the end of the file. The next append
 * then puts its line after that part, and the file has a bad line in its middle.
 * `healNdjsonTail()` repairs the end before the next append.
 */

import { open, type FileHandle } from "node:fs/promises";

/** What `healNdjsonTail()` did: nothing, a cut of a partial last line, or a newline after a complete last record. */
export type NdjsonTailAction = "none" | "truncated" | "newline";

/** The result of `healNdjsonTail()`. */
export interface NdjsonTailResult {
  /** The change to the file. */
  readonly action: NdjsonTailAction;
  /** The number of bytes that the function removed or added. It is 0 for `none`. */
  readonly bytes: number;
  /** The size of the file after the repair. It is 0 for a file that does not exist. */
  readonly size: number;
}

/** The options of `healNdjsonTail()`. */
export interface HealNdjsonTailOptions {
  /**
   * The maximum length in bytes of the last line. The function reads no more than this number of
   * bytes from the end. A longer last line is an error. The default is 16 MiB.
   */
  maxLineBytes?: number | undefined;
  /** With `false`, the function does not flush a change to the disk. The default is `true`. */
  fsync?: boolean | undefined;
}

const NEWLINE = 0x0a;
const NEWLINE_BYTES = Uint8Array.of(NEWLINE);
const CHUNK_BYTES = 64 * 1024;
const DEFAULT_MAX_LINE_BYTES = 16 * 1024 * 1024;
const BOM = [0xef, 0xbb, 0xbf] as const;

/**
 * The bytes of the file from `position`, `length` bytes or fewer. A read of a local file gives all
 * the bytes up to the end of the file.
 */
async function readAt(handle: FileHandle, position: number, length: number): Promise<Buffer> {
  const buffer = Buffer.alloc(length);
  const { bytesRead } = await handle.read(buffer, 0, length, position);
  return buffer.subarray(0, bytesRead);
}

/**
 * True when the bytes hold one complete JSON value. No part of an object or of an array is valid
 * JSON, so the function cannot keep a part of such a record.
 */
function isCompleteJson(bytes: Buffer, atStart: boolean): boolean {
  const text = atStart && BOM.every((byte, index) => bytes[index] === byte) ? bytes.subarray(BOM.length) : bytes;
  try {
    JSON.parse(text.toString("utf8"));
    return true;
  } catch {
    return false;
  }
}

/**
 * This function repairs the end of an append-only NDJSON file after a crash. Then the file ends in a newline, or it is empty.
 *
 * - A missing file, an empty file and a file that ends in a newline get no change.
 * - A last line that is not valid JSON is a part of a record. The function cuts it off with `ftruncate`.
 * - A last line that is valid JSON is a complete record without its newline. The function adds the newline.
 * - The function reads only the last line, from the end of the file. It does not read the whole file.
 *
 * The records must be objects or arrays. A part of a number or of a literal can be valid JSON too.
 * The function does not lock the file. Start it before an append, in the same lock as the append.
 */
export async function healNdjsonTail(path: string, options: HealNdjsonTailOptions = {}): Promise<NdjsonTailResult> {
  const maxLineBytes = options.maxLineBytes ?? DEFAULT_MAX_LINE_BYTES;
  let handle: FileHandle;
  try {
    handle = await open(path, "r+");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { action: "none", bytes: 0, size: 0 };
    throw error;
  }
  try {
    const { size } = await handle.stat();
    if (size === 0) return { action: "none", bytes: 0, size };
    const [last] = await readAt(handle, size - 1, 1);
    if (last === NEWLINE) return { action: "none", bytes: 0, size };

    // Back from the end, one chunk at a time, to the newline before the last line
    const lowest = Math.max(0, size - maxLineBytes - 1);
    const parts: Buffer[] = [];
    let lineStart = -1;
    for (let end = size; end > lowest && lineStart === -1; ) {
      const start = Math.max(lowest, end - CHUNK_BYTES);
      const chunk = await readAt(handle, start, end - start);
      const at = chunk.lastIndexOf(NEWLINE);
      if (at === -1) {
        parts.unshift(chunk);
      } else {
        parts.unshift(chunk.subarray(at + 1));
        lineStart = start + at + 1;
      }
      end = start;
    }
    if (lineStart === -1) {
      if (lowest > 0) throw new RangeError(`The last line of ${path} is longer than ${maxLineBytes} bytes (maxLineBytes)`);
      lineStart = 0;
    }

    const flush = options.fsync ?? true;
    if (isCompleteJson(Buffer.concat(parts), lineStart === 0)) {
      await handle.write(NEWLINE_BYTES, 0, 1, size);
      if (flush) await handle.sync();
      return { action: "newline", bytes: 1, size: size + 1 };
    }
    await handle.truncate(lineStart);
    if (flush) await handle.sync();
    return { action: "truncated", bytes: size - lineStart, size: lineStart };
  } finally {
    await handle.close();
  }
}
