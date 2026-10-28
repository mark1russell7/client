/**
 * A program store in one JSON file.
 *
 * The file is `{ "schemaVersion": 1, "programs": { "<key>": <StoredProgram> } }`. Each operation
 * reads the file again, so two processes see the programs of each other. A write takes a lock
 * file (`<file>.lock`), reads, changes and writes the file through a temporary file and a rename,
 * so a reader never sees a part of a write and two writers do not lose each other's programs.
 * A file that is not valid JSON is an error: the store does not write over it.
 *
 * The version of a record is a counter of the file, in the optional field `counter`. Each put takes
 * the next number under the lock, and tests `expectedVersion` under the same lock. A file of an
 * older release has no counter: the highest version of its records starts the count.
 */

import { mkdir, open, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  byKey,
  checkProgramVersion,
  checkStoredProgram,
  keyMatches,
  nextCounterVersion,
  type ProgramStore,
  type ProgramWriteOptions,
  type StoredProgram,
} from "./types.js";

interface ProgramFile {
  schemaVersion: 1;
  /** The last version that a put gave. A file of an older release does not have it. */
  counter?: number;
  programs: Record<string, StoredProgram>;
}

/** A lock older than this belongs to a process that stopped: it is removed. */
const STALE_LOCK_MS = 10_000;
/** The longest wait for the lock. */
const LOCK_TIMEOUT_MS = 30_000;

/**
 * True when another process holds a file for a moment. On Windows, a file that its owner is
 * deleting or renaming cannot be opened until that completes: EPERM, EACCES or EBUSY.
 */
function isContention(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException).code;
  if (code === "EEXIST") return true;
  return process.platform === "win32" && (code === "EPERM" || code === "EACCES" || code === "EBUSY");
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The program of a key, or undefined. A key such as "constructor" is not a field of the prototype. */
function ownProgram(file: ProgramFile, key: string): StoredProgram | undefined {
  return Object.hasOwn(file.programs, key) ? file.programs[key] : undefined;
}

/**
 * This function runs a file operation again while Windows holds the file for a moment. `FileQueueStore` uses it
 * too.
 */
export async function retryOnContention<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await operation();
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (attempt >= 20 || code === "EEXIST" || !isContention(error)) throw error;
      await pause(10 * attempt);
    }
  }
}

export class FileProgramStore implements ProgramStore {
  readonly kind = "file";
  /** The writes of this process, one at a time (the lock file orders the processes). */
  private queue: Promise<unknown> = Promise.resolve();

  /** @param path - The JSON file. The store makes it, and its folder, at the first write. */
  constructor(readonly path: string) {}

  async get(key: string): Promise<StoredProgram | undefined> {
    return (await this.read()).programs[key];
  }

  async list(prefix?: string): Promise<StoredProgram[]> {
    return byKey(Object.values((await this.read()).programs).filter((p) => keyMatches(p.key, prefix)));
  }

  async put(program: StoredProgram, options?: ProgramWriteOptions): Promise<void> {
    const checked = checkStoredProgram(structuredClone(program));
    await this.change((file) => {
      checkProgramVersion(checked.key, ownProgram(file, checked.key), options);
      const version = nextCounterVersion(file.counter ?? 0, Object.values(file.programs));
      file.counter = version;
      file.programs[checked.key] = { ...checked, version };
      return true;
    });
  }

  async delete(key: string, options?: ProgramWriteOptions): Promise<boolean> {
    let deleted = false;
    await this.change((file) => {
      checkProgramVersion(key, ownProgram(file, key), options);
      deleted = Object.hasOwn(file.programs, key);
      if (deleted) delete file.programs[key];
      return deleted;
    });
    return deleted;
  }

  /** The content of the file. A missing file is an empty store. */
  private async read(): Promise<ProgramFile> {
    let text: string;
    try {
      text = await retryOnContention(() => readFile(this.path, "utf8"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { schemaVersion: 1, programs: {} };
      throw error;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error(`The program store file is not valid JSON: ${this.path}. The store does not write over it.`);
    }
    const file = parsed as Partial<ProgramFile>;
    if (file?.schemaVersion !== 1 || typeof file.programs !== "object" || file.programs === null) {
      throw new Error(`The program store file has an unknown format (schemaVersion 1 expected): ${this.path}`);
    }
    // A null-prototype object: a key such as "__proto__" stays a plain key
    const programs: Record<string, StoredProgram> = Object.create(null);
    for (const [key, value] of Object.entries(file.programs)) programs[key] = checkStoredProgram(value);
    const counter = typeof file.counter === "number" && Number.isSafeInteger(file.counter) && file.counter > 0 ? file.counter : undefined;
    return counter === undefined ? { schemaVersion: 1, programs } : { schemaVersion: 1, counter, programs };
  }

  /** Read, change and write the file under the lock. `change` gives false when nothing changed. */
  private change(change: (file: ProgramFile) => boolean): Promise<void> {
    const run = this.queue.then(() => this.withLock(async () => {
      const file = await this.read();
      if (change(file)) await this.write(file);
    }));
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async write(file: ProgramFile): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    const temporary = `${this.path}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
    try {
      await writeFile(temporary, `${JSON.stringify(file, null, 2)}\n`, "utf8");
      await retryOnContention(() => rename(temporary, this.path));
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
  }

  /**
   * The lock file holds a token of its writer. A writer removes a stale lock only when the lock
   * still holds the token that it read, and it removes its own lock only. (Before, a writer could
   * remove the fresh lock of another writer, so two writers ran at one time: audit pass 2.)
   */
  private async withLock(work: () => Promise<void>): Promise<void> {
    const lockPath = `${this.path}.lock`;
    await mkdir(dirname(this.path), { recursive: true });
    const token = `${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}`;
    const deadline = Date.now() + LOCK_TIMEOUT_MS;
    for (;;) {
      try {
        const handle = await open(lockPath, "wx");
        try {
          await handle.writeFile(token, "utf8");
        } finally {
          await handle.close();
        }
        break;
      } catch (error) {
        if (!isContention(error) || Date.now() > deadline) throw error;
        try {
          const holder = await readFile(lockPath, "utf8");
          const { mtimeMs } = await stat(lockPath);
          // The second read makes sure that the stale lock is still the lock of the same writer
          if (Date.now() - mtimeMs > STALE_LOCK_MS && (await readFile(lockPath, "utf8")) === holder) await rm(lockPath, { force: true });
        } catch {
          // The lock went away: try again
        }
        await pause(10 + Math.random() * 20);
      }
    }
    try {
      await work();
    } finally {
      await this.unlock(lockPath, token);
    }
  }

  /** This function removes the lock file when it still holds the token of this writer. */
  private async unlock(lockPath: string, token: string): Promise<void> {
    try {
      if ((await readFile(lockPath, "utf8")) === token) await rm(lockPath, { force: true });
    } catch {
      // The lock is gone already
    }
  }
}
