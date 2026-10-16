/**
 * A program store in one JSON file.
 *
 * The file is `{ "schemaVersion": 1, "programs": { "<key>": <StoredProgram> } }`. Each operation
 * reads the file again, so two processes see the programs of each other. A write takes a lock
 * file (`<file>.lock`), reads, changes and writes the file through a temporary file and a rename,
 * so a reader never sees a part of a write and two writers do not lose each other's programs.
 * A file that is not valid JSON is an error: the store does not write over it.
 */

import { mkdir, open, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { byKey, checkStoredProgram, keyMatches, type ProgramStore, type StoredProgram } from "./types.js";

interface ProgramFile {
  schemaVersion: 1;
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

  async put(program: StoredProgram): Promise<void> {
    const checked = checkStoredProgram(structuredClone(program));
    await this.change((file) => {
      file.programs[checked.key] = checked;
      return true;
    });
  }

  async delete(key: string): Promise<boolean> {
    let deleted = false;
    await this.change((file) => {
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
    return { schemaVersion: 1, programs };
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

  private async withLock(work: () => Promise<void>): Promise<void> {
    const lockPath = `${this.path}.lock`;
    await mkdir(dirname(this.path), { recursive: true });
    const deadline = Date.now() + LOCK_TIMEOUT_MS;
    for (;;) {
      try {
        const handle = await open(lockPath, "wx");
        await handle.close();
        break;
      } catch (error) {
        if (!isContention(error) || Date.now() > deadline) throw error;
        try {
          const { mtimeMs } = await stat(lockPath);
          if (Date.now() - mtimeMs > STALE_LOCK_MS) await rm(lockPath, { force: true });
        } catch {
          // The lock went away: try again
        }
        await pause(10 + Math.random() * 20);
      }
    }
    try {
      await work();
    } finally {
      await rm(lockPath, { force: true });
    }
  }
}
