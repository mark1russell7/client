/**
 * The atomic write of a file (roadmap O51 and O52).
 *
 * `writeFileAtomic()` writes the data to a new temporary file in the folder of the target. Then it
 * renames the temporary file over the target. Thus a reader sees the old file or the whole new
 * file, also after a crash. `writeFileAtomicSync()` does the same steps without a promise.
 */

import { randomBytes } from "node:crypto";
import {
  chmodSync,
  closeSync,
  fchmodSync,
  fsyncSync,
  openSync,
  realpathSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { chmod, open, realpath, rename, stat, unlink, type FileHandle } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { perform, runAsync, runSync } from "./steps.js";

/** The options of `writeFileAtomic()` and `writeFileAtomicSync()`. */
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
  /**
   * The function that gives the name of the temporary file. It gets the absolute path of the target,
   * after the function follows a symlink.
   *
   * The temporary file is in the folder of the target, so a name with `/` or `\` is an error. The
   * default name is `.<name>.<16 hex digits>.tmp`, where `<name>` is the first 32 characters of the
   * name of the target.
   */
  tempName?: ((target: string) => string) | undefined;
}

/** On Windows, an antivirus or an indexer that holds the target open gives these errors for a short time. */
const LOCKED = new Set(["EPERM", "EACCES", "EBUSY"]);

/** A file system that cannot flush a folder gives these errors. The write is complete without the flush. */
const NO_FOLDER_SYNC = new Set(["EINVAL", "ENOTSUP", "EISDIR", "EBADF", "EPERM", "EACCES"]);

/** The permission bits that let the group and the others read a file. */
const OTHERS_READ = 0o044;

/** A file that the steps open: a `FileHandle` for the async form, a file descriptor for the sync form. */
type Handle = FileHandle | number;

/** One operation of the file system that the steps of a write need. */
type FileOp =
  | { readonly op: "realpath"; readonly path: string }
  | { readonly op: "mode"; readonly path: string }
  | { readonly op: "create"; readonly path: string; readonly mode: number }
  | { readonly op: "openFolder"; readonly path: string }
  | { readonly op: "write"; readonly handle: Handle; readonly data: string | Uint8Array; readonly encoding: BufferEncoding }
  | { readonly op: "fchmod"; readonly handle: Handle; readonly mode: number }
  | { readonly op: "fsync"; readonly handle: Handle }
  | { readonly op: "close"; readonly handle: Handle }
  | { readonly op: "rename"; readonly from: string; readonly to: string }
  | { readonly op: "unlink"; readonly path: string }
  | { readonly op: "chmod"; readonly path: string; readonly mode: number }
  | { readonly op: "sleep"; readonly ms: number };

/** The steps of a write. Each step yields one operation, and the runner gives back its result. */
type Steps<T> = Generator<FileOp, T, unknown>;

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
function* targetOf(path: string): Steps<string> {
  const absolute = resolve(path);
  try {
    return yield* perform<FileOp, string>({ op: "realpath", path: absolute });
  } catch (error) {
    if (isMissing(error)) return absolute;
    throw error;
  }
}

/** The permission bits of the target, or undefined when the target does not exist. */
function* modeOf(target: string): Steps<number | undefined> {
  try {
    return yield* perform<FileOp, number>({ op: "mode", path: target });
  } catch (error) {
    if (isMissing(error)) return undefined;
    throw error;
  }
}

/** The `ERR_INVALID_ARG_VALUE` error of a name of a temporary file that is not in the folder of the target. */
function badTempName(name: unknown): TypeError {
  const error = new TypeError(
    `The option tempName gave ${JSON.stringify(name)}. Give the name of a new file in the folder of the target, without "/" or "\\".`,
  );
  return Object.assign(error, { code: "ERR_INVALID_ARG_VALUE" });
}

/**
 * A new path next to the target. The default name starts with a dot and ends in `.tmp`. Thus a
 * reader that looks for the extension of the target does not see it. The name keeps 32 characters
 * of the target, so it does not become too long.
 */
function tempPathOf(target: string, tempName: WriteFileAtomicOptions["tempName"]): string {
  const own = basename(target);
  if (!tempName) return join(dirname(target), `.${[...own].slice(0, 32).join("")}.${randomBytes(8).toString("hex")}.tmp`);
  const name: unknown = tempName(target);
  if (typeof name !== "string" || name === "" || name === "." || name === ".." || name === own || /[\\/]/.test(name)) {
    throw badTempName(name);
  }
  return join(dirname(target), name);
}

/**
 * The permissions of the new temporary file. When the final file hides its data from the group and
 * the others, the temporary file gets `0o600` from the start. Then no other user can read it.
 */
function createModeOf(mode: number | undefined): number {
  if (mode === undefined) return 0o666;
  return (mode & OTHERS_READ) === 0 ? 0o600 : mode;
}

/**
 * The rename, tried again with a longer wait each time until `retryMs` is over. A random part of
 * each wait keeps two writers of one target out of step.
 */
function* renameWithRetry(from: string, to: string, retryMs: number): Steps<void> {
  const deadline = Date.now() + retryMs;
  for (let step = 10; ; step = Math.min(step * 2, 100)) {
    try {
      yield { op: "rename", from, to };
      return;
    } catch (error) {
      const delay = Math.round(step * (0.5 + Math.random()));
      if (!LOCKED.has(codeOf(error)) || Date.now() + delay > deadline) throw error;
      yield { op: "sleep", ms: delay };
    }
  }
}

/** The removal of the temporary file after a failure. The original error is more important than an error here. */
function* removeTemp(temp: string): Steps<void> {
  try {
    yield { op: "unlink", path: temp };
  } catch (error) {
    if (codeOf(error) !== "EPERM") return;
    // Windows does not remove a read-only file, so the function clears the flag and tries again
    try {
      yield { op: "chmod", path: temp, mode: 0o666 };
      yield { op: "unlink", path: temp };
    } catch {
      // The temporary file stays. The error of the write is the error that the caller gets.
    }
  }
}

/** The flush of the folder, so that the rename is on the disk. Windows cannot open a folder for it. */
function* syncFolder(folder: string): Steps<void> {
  if (isWindows()) return;
  let handle: Handle | undefined;
  try {
    handle = yield* perform<FileOp, Handle>({ op: "openFolder", path: folder });
    yield { op: "fsync", handle };
  } catch (error) {
    if (!NO_FOLDER_SYNC.has(codeOf(error))) throw error;
  } finally {
    if (handle !== undefined) yield { op: "close", handle };
  }
}

/** The steps of `writeFileAtomic()` and `writeFileAtomicSync()`. */
function* writeSteps(path: string, data: string | Uint8Array, options: WriteFileAtomicOptions): Steps<void> {
  const target = yield* targetOf(path);
  const mode = options.mode ?? (yield* modeOf(target));
  const flush = options.fsync ?? true;
  const temp = tempPathOf(target, options.tempName);
  let created = false;
  let handle: Handle | undefined;
  try {
    handle = yield* perform<FileOp, Handle>({ op: "create", path: temp, mode: createModeOf(mode) });
    created = true;
    yield { op: "write", handle, data, encoding: options.encoding ?? "utf8" };
    // The umask changes the mode of the open, and a secret file starts at 0o600, so the function sets the final mode
    if (mode !== undefined) yield { op: "fchmod", handle, mode };
    if (flush) yield { op: "fsync", handle };
    yield { op: "close", handle };
    handle = undefined;
    yield* renameWithRetry(temp, target, options.renameRetryMs ?? (isWindows() ? 2000 : 0));
  } catch (error) {
    if (handle !== undefined) {
      try {
        yield { op: "close", handle };
      } catch {
        // The error of the write is the error that the caller gets
      }
    }
    if (created) yield* removeTemp(temp);
    throw error;
  }
  if (flush) yield* syncFolder(dirname(target));
}

/** The async operations of the file system, with `node:fs/promises`. */
async function doAsync(op: FileOp): Promise<unknown> {
  switch (op.op) {
    case "realpath":
      return realpath(op.path);
    case "mode":
      return (await stat(op.path)).mode & 0o7777;
    case "create":
      return open(op.path, "wx", op.mode);
    case "openFolder":
      return open(op.path, "r");
    case "write":
      return (op.handle as FileHandle).writeFile(op.data, { encoding: op.encoding });
    case "fchmod":
      return (op.handle as FileHandle).chmod(op.mode);
    case "fsync":
      return (op.handle as FileHandle).sync();
    case "close":
      return (op.handle as FileHandle).close();
    case "rename":
      return rename(op.from, op.to);
    case "unlink":
      return unlink(op.path);
    case "chmod":
      return chmod(op.path, op.mode);
    case "sleep":
      return sleep(op.ms);
  }
}

let sleeper: Int32Array | undefined;

/** The sync operations of the file system, with `node:fs`. A wait blocks the thread with `Atomics.wait()`. */
function doSync(op: FileOp): unknown {
  switch (op.op) {
    case "realpath":
      return realpathSync.native(op.path);
    case "mode":
      return statSync(op.path).mode & 0o7777;
    case "create":
      return openSync(op.path, "wx", op.mode);
    case "openFolder":
      return openSync(op.path, "r");
    case "write":
      return writeFileSync(op.handle as number, op.data, { encoding: op.encoding });
    case "fchmod":
      return fchmodSync(op.handle as number, op.mode);
    case "fsync":
      return fsyncSync(op.handle as number);
    case "close":
      return closeSync(op.handle as number);
    case "rename":
      return renameSync(op.from, op.to);
    case "unlink":
      return unlinkSync(op.path);
    case "chmod":
      return chmodSync(op.path, op.mode);
    case "sleep":
      sleeper ??= new Int32Array(new SharedArrayBuffer(4));
      return Atomics.wait(sleeper, 0, 0, op.ms);
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
 * - When the group and the others cannot read the final file, the temporary file gets `0o600` before the write of the data.
 * - When `path` is a symlink, the function replaces the target of the link.
 *
 * Two writes at the same time do not mix: the file gets the data of one of them. The folder must exist.
 * The name of the temporary file is `.<name>.<16 hex digits>.tmp`, unless `options.tempName` gives a name.
 */
export function writeFileAtomic(path: string, data: string | Uint8Array, options: WriteFileAtomicOptions = {}): Promise<void> {
  return runAsync(writeSteps(path, data, options), doAsync);
}

/**
 * This function is the sync form of `writeFileAtomic()`. It does the same steps, with the same
 * options and the same errors.
 *
 * - It blocks the thread until the file is in place.
 * - On Windows, a locked target can block the thread for `renameRetryMs` (2000 by default) while the function tries the rename again.
 */
export function writeFileAtomicSync(path: string, data: string | Uint8Array, options: WriteFileAtomicOptions = {}): void {
  runSync(writeSteps(path, data, options), doSync);
}
