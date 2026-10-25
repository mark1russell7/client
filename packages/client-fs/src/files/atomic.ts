/**
 * The atomic write of a file (roadmap O51).
 *
 * `writeFileAtomic()` writes the data to a new temporary file in the folder of the target. Then it
 * renames the temporary file over the target. Thus a reader sees the old file or the whole new
 * file, also after a crash.
 */

import { randomBytes } from "node:crypto";
import { chmod, open, realpath, rename, stat, unlink, type FileHandle } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

/** The options of `writeFileAtomic()`. */
export interface WriteFileAtomicOptions {
  /** The encoding of a string `data`. The default is `utf8`. */
  encoding?: BufferEncoding | undefined;
  /**
   * The permissions of the file. Without it, the file keeps the permissions of the target. A new
   * file gets `0o666` less the umask.
   */
  mode?: number | undefined;
  /** With `false`, the function does not flush the file and its folder to the disk. The default is `true`. */
  fsync?: boolean | undefined;
  /**
   * The time in milliseconds to try a rename again after `EPERM`, `EACCES` or `EBUSY`. The default
   * is 2000 on Windows and 0 on the other platforms.
   */
  renameRetryMs?: number | undefined;
}

/** On Windows, an antivirus or an indexer that holds the target open gives these errors for a short time. */
const LOCKED = new Set(["EPERM", "EACCES", "EBUSY"]);

/** A file system that cannot flush a folder gives these errors. The write is complete without the flush. */
const NO_FOLDER_SYNC = new Set(["EINVAL", "ENOTSUP", "EISDIR", "EBADF", "EPERM", "EACCES"]);

/** True on Windows. The function reads the platform at each call, so a test can change it. */
function isWindows(): boolean {
  return process.platform === "win32";
}

/** The code of a Node.js error, or an empty string. */
function codeOf(error: unknown): string {
  return (error as NodeJS.ErrnoException | undefined)?.code ?? "";
}

/** True for the error of a path that does not exist. */
function isMissing(error: unknown): boolean {
  const code = codeOf(error);
  return code === "ENOENT" || code === "ENOTDIR";
}

/** The absolute path of the file to replace. The function follows a symlink, so the link stays a link. */
async function targetOf(path: string): Promise<string> {
  const absolute = resolve(path);
  try {
    return await realpath(absolute);
  } catch (error) {
    if (isMissing(error)) return absolute;
    throw error;
  }
}

/** The permission bits of the target, or undefined when the target does not exist. */
async function modeOf(target: string): Promise<number | undefined> {
  try {
    return (await stat(target)).mode & 0o7777;
  } catch (error) {
    if (isMissing(error)) return undefined;
    throw error;
  }
}

/**
 * A new path next to the target. The name starts with a dot and ends in `.tmp`, so a reader that
 * looks for the extension of the target does not see it. The name keeps 32 characters of the
 * target, so it does not become too long.
 */
function tempPathOf(target: string): string {
  const name = [...basename(target)].slice(0, 32).join("");
  return join(dirname(target), `.${name}.${randomBytes(8).toString("hex")}.tmp`);
}

/**
 * The rename, tried again with a longer wait each time until `retryMs` is over. A random part of
 * each wait keeps two writers of one target out of step.
 */
async function renameWithRetry(from: string, to: string, retryMs: number): Promise<void> {
  const deadline = Date.now() + retryMs;
  for (let step = 10; ; step = Math.min(step * 2, 100)) {
    try {
      await rename(from, to);
      return;
    } catch (error) {
      const delay = Math.round(step * (0.5 + Math.random()));
      if (!LOCKED.has(codeOf(error)) || Date.now() + delay > deadline) throw error;
      await sleep(delay);
    }
  }
}

/** The removal of the temporary file after a failure. The original error is more important than an error here. */
async function removeTemp(temp: string): Promise<void> {
  try {
    await unlink(temp);
  } catch (error) {
    if (codeOf(error) !== "EPERM") return;
    // Windows does not remove a read-only file, so the function clears the flag and tries again
    try {
      await chmod(temp, 0o666);
      await unlink(temp);
    } catch {
      // The temporary file stays. The error of the write is the error that the caller gets.
    }
  }
}

/** The flush of the folder, so that the rename is on the disk. Windows cannot open a folder for it. */
async function syncFolder(folder: string): Promise<void> {
  if (isWindows()) return;
  let handle: FileHandle | undefined;
  try {
    handle = await open(folder, "r");
    await handle.sync();
  } catch (error) {
    if (!NO_FOLDER_SYNC.has(codeOf(error))) throw error;
  } finally {
    await handle?.close();
  }
}

/**
 * This function writes `data` to `path` in one step for each reader. A reader sees the old file or
 * the whole new file. It does not see a part of a file at any time.
 *
 * - The function writes a new temporary file in the folder of the target and flushes it to the disk.
 * - Then it renames the temporary file over the target and flushes the folder. Windows gets no flush of the folder.
 * - On Windows, an open handle of the target blocks the rename. Then the function tries the rename again for `renameRetryMs`.
 * - After a failure, the function removes the temporary file and throws the error.
 * - The file keeps the permissions of the target, unless `options.mode` is set. It does not keep the owner.
 * - When `path` is a symlink, the function replaces the target of the link.
 *
 * Two writes at the same time do not mix: the file gets the data of one of them. The folder must exist.
 */
export async function writeFileAtomic(
  path: string,
  data: string | Uint8Array,
  options: WriteFileAtomicOptions = {},
): Promise<void> {
  const target = await targetOf(path);
  const mode = options.mode ?? (await modeOf(target));
  const flush = options.fsync ?? true;
  const temp = tempPathOf(target);
  let created = false;
  let handle: FileHandle | undefined;
  try {
    handle = await open(temp, "wx", mode ?? 0o666);
    created = true;
    await handle.writeFile(data, { encoding: options.encoding ?? "utf8" });
    // The umask changes the mode of open(), so the function sets the mode again
    if (mode !== undefined) await handle.chmod(mode);
    if (flush) await handle.sync();
    await handle.close();
    handle = undefined;
    await renameWithRetry(temp, target, options.renameRetryMs ?? (isWindows() ? 2000 : 0));
  } catch (error) {
    if (handle) {
      try {
        await handle.close();
      } catch {
        // The error of the write is the error that the caller gets
      }
    }
    if (created) await removeTemp(temp);
    throw error;
  }
  if (flush) await syncFolder(dirname(target));
}
