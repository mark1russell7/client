/**
 * The repair of the end of an append-only NDJSON file after a crash (roadmap O51 and O52).
 *
 * A crash during an append can leave a part of a line at the end of the file. The next append
 * then puts its line after that part, and the file has a bad line in its middle.
 * `healNdjsonTail()` and `healNdjsonTailSync()` repair the end before the next append.
 */

import { closeSync, fstatSync, fsyncSync, ftruncateSync, openSync, readSync, writeSync } from "node:fs";
import { open, type FileHandle } from "node:fs/promises";
import { perform, runAsync, runSync } from "./steps.js";

/** What `healNdjsonTail()` did: nothing, a cut of a partial last line, or a newline after a complete last record. */
export type NdjsonTailAction = "none" | "truncated" | "newline";

/** The result of `healNdjsonTail()` and `healNdjsonTailSync()`. */
export interface NdjsonTailResult {
  /** The change to the file. */
  readonly action: NdjsonTailAction;
  /** The number of bytes that the function removed or added. It is 0 for `none`. */
  readonly bytes: number;
  /** The size of the file after the repair. It is 0 for a file that does not exist. */
  readonly size: number;
  /**
   * The last complete line after the repair, without its `\n` or `\r\n`, and without a byte order
   * mark. It is `undefined` when the file has no complete line.
   *
   * The result has this field only with the option `lastLine: true`.
   */
  readonly lastLine?: string | undefined;
}

/** The options of `healNdjsonTail()` and `healNdjsonTailSync()`. */
export interface HealNdjsonTailOptions {
  /**
   * The maximum length in bytes of the last line. The default is 16 MiB. `Infinity` turns the limit off.
   *
   * A longer last line is a `RangeError` with the code `ERR_NDJSON_LINE_TOO_LONG`, and the file
   * does not change. The function keeps no more than this number of bytes in memory.
   */
  maxLineBytes?: number | undefined;
  /** With `false`, the function does not flush a change to the disk. The default is `true`. */
  fsync?: boolean | undefined;
  /**
   * With `true`, the result has `lastLine`, the last complete line after the repair. The default is `false`.
   *
   * The function then also reads the last line of a file that ends in a newline, up to `maxLineBytes`.
   */
  lastLine?: boolean | undefined;
}

/** The code of the error of a last line that is longer than `maxLineBytes`. */
export const NDJSON_LINE_TOO_LONG = "ERR_NDJSON_LINE_TOO_LONG";

const NEWLINE = 0x0a;
const CARRIAGE_RETURN = 0x0d;
const CHUNK_BYTES = 64 * 1024;
const DEFAULT_MAX_LINE_BYTES = 16 * 1024 * 1024;
const BOM = [0xef, 0xbb, 0xbf] as const;

/** One operation of the file system on the open file. */
type TailOp =
  | { readonly op: "size" }
  | { readonly op: "read"; readonly position: number; readonly length: number }
  | { readonly op: "newline"; readonly position: number }
  | { readonly op: "truncate"; readonly length: number }
  | { readonly op: "sync" };

/** The steps of a repair. Each step yields one operation, and the runner gives back its result. */
type Steps<T> = Generator<TailOp, T, unknown>;

/** A line of the file: the position of its first byte, and its bytes without the newline. */
interface Line {
  readonly start: number;
  readonly bytes: Buffer;
}

/** The bytes of the file from `position`, `length` bytes or fewer. */
function read(position: number, length: number): Steps<Buffer> {
  return perform<TailOp, Buffer>({ op: "read", position, length });
}

/**
 * The `RangeError` of a last line that is longer than `maxLineBytes`. It tells the length, the
 * limit and the option. It has the fields `code`, `path`, `lineBytes` and `maxLineBytes`.
 */
function lineTooLong(path: string, lineBytes: number, maxLineBytes: number): RangeError {
  const error = new RangeError(
    `A line at the end of ${path} has ${lineBytes} bytes, more than the limit maxLineBytes (${maxLineBytes} bytes). ` +
      `Set the option maxLineBytes to ${lineBytes} or more, or to Infinity for no limit. The file did not change.`,
  );
  return Object.assign(error, { code: NDJSON_LINE_TOO_LONG, path, lineBytes, maxLineBytes });
}

/**
 * The position after the last newline of the bytes from `lowest` to `end`, or -1 without a newline.
 * The function reads back from `end`, one chunk at a time. It adds each chunk after the newline to
 * the start of `keep`, when `keep` is set.
 */
function* lineStartBack(end: number, lowest: number, keep: Buffer[] | undefined): Steps<number> {
  for (let to = end; to > lowest; ) {
    const from = Math.max(lowest, to - CHUNK_BYTES);
    const chunk = yield* read(from, to - from);
    const at = chunk.lastIndexOf(NEWLINE);
    keep?.unshift(at === -1 ? chunk : chunk.subarray(at + 1));
    if (at !== -1) return from + at + 1;
    to = from;
  }
  return -1;
}

/**
 * The line that ends at `end`, from the newline before it. The function reads no more than
 * `maxLineBytes` and one byte back from `end`. A longer line is an error.
 */
function* lineBefore(path: string, end: number, maxLineBytes: number): Steps<Line> {
  const lowest = Math.max(0, end - maxLineBytes - 1);
  const parts: Buffer[] = [];
  const start = yield* lineStartBack(end, lowest, parts);
  if (start !== -1 || lowest === 0) return { start: Math.max(start, 0), bytes: Buffer.concat(parts) };
  // Only to give the length in the error: the bytes before the window, without a copy in memory
  const found = yield* lineStartBack(lowest, 0, undefined);
  throw lineTooLong(path, end - Math.max(found, 0), maxLineBytes);
}

/** The bytes of a line without the byte order mark at the start of the file. */
function withoutBom(line: Line): Buffer {
  const { bytes } = line;
  return line.start === 0 && BOM.every((byte, index) => bytes[index] === byte) ? bytes.subarray(BOM.length) : bytes;
}

/**
 * True when the line holds one complete JSON value. No part of an object or of an array is valid
 * JSON, so the function cannot keep a part of such a record.
 */
function isCompleteJson(line: Line): boolean {
  try {
    JSON.parse(withoutBom(line).toString("utf8"));
    return true;
  } catch {
    return false;
  }
}

/** The text of a complete line for `lastLine`: without the byte order mark and without a `\r` at the end. */
function textOf(line: Line): string {
  const bytes = withoutBom(line);
  return (bytes.at(-1) === CARRIAGE_RETURN ? bytes.subarray(0, -1) : bytes).toString("utf8");
}

/** The steps of `healNdjsonTail()` and `healNdjsonTailSync()` on the open file. */
function* healSteps(path: string, options: HealNdjsonTailOptions): Steps<NdjsonTailResult> {
  const maxLineBytes = options.maxLineBytes ?? DEFAULT_MAX_LINE_BYTES;
  const flush = options.fsync ?? true;
  const wantLast = options.lastLine === true;
  // The text of the complete line that ends at the newline at `newline`
  const completeLine = function* (newline: number): Steps<{ lastLine?: string }> {
    return wantLast ? { lastLine: textOf(yield* lineBefore(path, newline, maxLineBytes)) } : {};
  };
  const noLine = wantLast ? { lastLine: undefined } : {};

  const size = yield* perform<TailOp, number>({ op: "size" });
  if (size === 0) return { action: "none", bytes: 0, size, ...noLine };
  const [last] = yield* read(size - 1, 1);
  if (last === NEWLINE) return { action: "none", bytes: 0, size, ...(yield* completeLine(size - 1)) };

  const line = yield* lineBefore(path, size, maxLineBytes);
  if (isCompleteJson(line)) {
    yield { op: "newline", position: size };
    if (flush) yield { op: "sync" };
    return { action: "newline", bytes: 1, size: size + 1, ...(wantLast ? { lastLine: textOf(line) } : {}) };
  }
  // The line before the cut is the last line after it. The function reads it first, so an error changes nothing.
  const before = line.start === 0 ? noLine : yield* completeLine(line.start - 1);
  yield { op: "truncate", length: line.start };
  if (flush) yield { op: "sync" };
  return { action: "truncated", bytes: size - line.start, size: line.start, ...before };
}

/** The result for a file that does not exist. */
function missing(options: HealNdjsonTailOptions): NdjsonTailResult {
  return { action: "none", bytes: 0, size: 0, ...(options.lastLine === true ? { lastLine: undefined } : {}) };
}

/** True for the error of a file that does not exist. */
function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}

const NEWLINE_BYTES = Uint8Array.of(NEWLINE);

/** The async operations on the open file, with a `FileHandle`. */
function asyncOn(handle: FileHandle): (op: TailOp) => Promise<unknown> {
  return async (op) => {
    switch (op.op) {
      case "size":
        return (await handle.stat()).size;
      case "read": {
        const buffer = Buffer.alloc(op.length);
        const { bytesRead } = await handle.read(buffer, 0, op.length, op.position);
        return buffer.subarray(0, bytesRead);
      }
      case "newline":
        return handle.write(NEWLINE_BYTES, 0, 1, op.position);
      case "truncate":
        return handle.truncate(op.length);
      case "sync":
        return handle.sync();
    }
  };
}

/** The sync operations on the open file, with a file descriptor. */
function syncOn(fd: number): (op: TailOp) => unknown {
  return (op) => {
    switch (op.op) {
      case "size":
        return fstatSync(fd).size;
      case "read": {
        const buffer = Buffer.alloc(op.length);
        return buffer.subarray(0, readSync(fd, buffer, 0, op.length, op.position));
      }
      case "newline":
        return writeSync(fd, NEWLINE_BYTES, 0, 1, op.position);
      case "truncate":
        return ftruncateSync(fd, op.length);
      case "sync":
        return fsyncSync(fd);
    }
  };
}

/**
 * This function repairs the end of an append-only NDJSON file after a crash. Then the file ends in a newline, or it is empty.
 *
 * - A missing file, an empty file and a file that ends in a newline get no change.
 * - A last line that is not valid JSON is a part of a record. The function cuts it off with `ftruncate`.
 * - A last line that is valid JSON is a complete record without its newline. The function adds the newline.
 * - The function reads only the last line, from the end of the file. It does not read the whole file.
 * - With `options.lastLine`, the result also gives the last complete line after the repair.
 *
 * A last line that is longer than `maxLineBytes` (16 MiB by default) is a `RangeError` with the code
 * `ERR_NDJSON_LINE_TOO_LONG`. The file then does not change. Set `maxLineBytes: Infinity` for files with very long records.
 *
 * The records must be objects or arrays. A part of a number or of a literal can be valid JSON too.
 * The function does not lock the file. Start it before an append, in the same lock as the append.
 */
export async function healNdjsonTail(path: string, options: HealNdjsonTailOptions = {}): Promise<NdjsonTailResult> {
  let handle: FileHandle;
  try {
    handle = await open(path, "r+");
  } catch (error) {
    if (isMissing(error)) return missing(options);
    throw error;
  }
  try {
    return await runAsync(healSteps(path, options), asyncOn(handle));
  } finally {
    await handle.close();
  }
}

/**
 * This function is the sync form of `healNdjsonTail()`. It makes the same repairs, with the same
 * options, the same result and the same errors. It blocks the thread until the repair is complete.
 */
export function healNdjsonTailSync(path: string, options: HealNdjsonTailOptions = {}): NdjsonTailResult {
  let fd: number;
  try {
    fd = openSync(path, "r+");
  } catch (error) {
    if (isMissing(error)) return missing(options);
    throw error;
  }
  try {
    return runSync(healSteps(path, options), syncOn(fd));
  } finally {
    closeSync(fd);
  }
}
