/**
 * The edit of a file, one at a time for each path (roadmap O51). An edit reads the file, changes
 * the text and writes it with `writeFileAtomic()`, while it holds the lock of the path.
 */

import { readFile, realpath } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { writeFileAtomic, type WriteFileAtomicOptions } from "./atomic.js";
import { KeyedLock } from "./lock.js";

/** The options of `editFile()`. */
export interface EditFileOptions extends WriteFileAtomicOptions {
  /** The text that the transform gets when the file does not exist. Without it, the transform gets `undefined`. */
  initial?: string | undefined;
  /** The abort of this signal stops the wait for the lock of the path. */
  signal?: AbortSignal | undefined;
}

/** The result of `editFile()`. */
export interface EditFileResult {
  /** True when the function wrote the file. */
  readonly changed: boolean;
  /** The text of the file after the edit, or `undefined` when the file does not exist. */
  readonly content: string | undefined;
}

/** The function that changes the text. It gives the new text, or `undefined` to write nothing. */
export type EditTransform<Current> = (current: Current) => string | undefined | PromiseLike<string | undefined>;

let pathLock: KeyedLock | undefined;

/**
 * The key of the lock of a path. The key is absolute, with the real path of the folder. On Windows,
 * the case of the letters is not significant. The function does not follow a symlink of the file.
 */
async function lockKeyOf(absolute: string): Promise<string> {
  let folder = dirname(absolute);
  try {
    folder = await realpath(folder);
  } catch {
    // A folder that does not exist keeps its path. The write then fails.
  }
  const key = join(folder, basename(absolute));
  return process.platform === "win32" ? key.toLowerCase() : key;
}

/** The text of the file, or `undefined` when the file does not exist. Another error is an error. */
async function readOrUndefined(path: string, encoding: BufferEncoding): Promise<string | undefined> {
  try {
    return await readFile(path, { encoding });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

/**
 * This function changes a file with `transform`, one edit at a time for each path in the process.
 *
 * - The function reads the file. A missing file gives `options.initial`, or `undefined`.
 * - Then it waits for `transform` and writes its text with `writeFileAtomic()`.
 * - A transform that gives the same text, or `undefined`, writes nothing.
 * - Two paths of the same file share the lock, also when the case of the letters is not the same on Windows.
 *
 * The lock is in the process. It does not stop another process. The options of `writeFileAtomic()` apply to the write.
 */
export function editFile(
  path: string,
  transform: EditTransform<string>,
  options: EditFileOptions & { initial: string },
): Promise<EditFileResult>;
export function editFile(
  path: string,
  transform: EditTransform<string | undefined>,
  options?: EditFileOptions,
): Promise<EditFileResult>;
export async function editFile(
  path: string,
  transform: EditTransform<string> | EditTransform<string | undefined>,
  options: EditFileOptions = {},
): Promise<EditFileResult> {
  // The overloads give a transform of `string` only with `initial`, so the current text is a string then
  const change = transform as EditTransform<string | undefined>;
  const { initial, signal, ...write } = options;
  const target = resolve(path);
  pathLock ??= new KeyedLock();
  const release = await pathLock.acquire(await lockKeyOf(target), { signal });
  try {
    const encoding = write.encoding ?? "utf8";
    const current = await readOrUndefined(target, encoding);
    const next = await change(current ?? initial);
    if (next === undefined || next === current) return { changed: false, content: current };
    await writeFileAtomic(target, next, { ...write, encoding });
    return { changed: true, content: next };
  } finally {
    release();
  }
}
