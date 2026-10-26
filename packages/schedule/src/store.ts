/**
 * The stores of the schedules: in memory, or in one JSON file.
 *
 * A host gives one store to the module of the procedures (`createScheduleModule({ store })`) and
 * the same store to its `Scheduler`. `update()` changes one schedule in one step, so the record of
 * a run does not lose a change of `schedule.add` that came at the same time.
 *
 * Two processes can share the file of a `FileScheduleStore`: a lock file next to it keeps their
 * changes apart (see the comment of the class).
 */

import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomBytes } from "node:crypto";
import { writeFileAtomic } from "@procedures/fs/files";
import { checkTimeZone } from "./cron.js";
import { ScheduleError } from "./errors.js";
import type { Schedule } from "./types.js";

/** A store of schedules. Each method gives a Promise: a caller cannot tell a local store from a remote one. */
export interface ScheduleStore {
  /** The kind of the backend: "memory", "file" or another name. */
  readonly kind: string;
  get(id: string): Promise<Schedule | undefined>;
  /** The schedules, sorted by name. */
  list(): Promise<Schedule[]>;
  /** Write a schedule. A schedule of the same name is replaced. */
  put(schedule: Schedule): Promise<void>;
  /** Delete a schedule. True when it existed. */
  delete(id: string): Promise<boolean>;
  /**
   * Change one schedule in one step. `change` gets a copy and gives the new schedule, or
   * undefined for no change. The result is the stored schedule, or undefined when none exists.
   */
  update(id: string, change: (schedule: Schedule) => Schedule | undefined): Promise<Schedule | undefined>;
}

const byId = (a: Schedule, b: Schedule): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

const isCount = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

/** True for `utc`, `local` and an IANA name that `Intl` knows. */
function isTimeZone(timeZone: string): boolean {
  try {
    checkTimeZone(timeZone);
    return true;
  } catch {
    return false;
  }
}

/** The schedule of a record that came from a file: its shape is not trusted. */
export function checkSchedule(value: unknown): Schedule {
  const record = value as Partial<Schedule> | null;
  if (record === null || typeof record !== "object") throw new ScheduleError("BAD_STORE", "A stored schedule must be an object");
  if (typeof record.id !== "string" || record.id === "") throw new ScheduleError("BAD_STORE", "A stored schedule needs an id");
  if (typeof record.cron !== "string" || typeof record.program !== "string" || record.program === "") {
    throw new ScheduleError("BAD_STORE", `The schedule ${record.id} needs a cron expression and a program`);
  }
  if (typeof record.timeZone !== "string" || !isTimeZone(record.timeZone)) {
    throw new ScheduleError("BAD_STORE", `The schedule ${record.id} needs the time zone utc, local or an IANA name that Intl knows`);
  }
  if (typeof record.createdAt !== "number" || !Number.isFinite(record.createdAt)) throw new ScheduleError("BAD_STORE", `The schedule ${record.id} needs createdAt`);
  if (!isCount(record.runs) || !isCount(record.failures) || !isCount(record.skipped)) throw new ScheduleError("BAD_STORE", `The schedule ${record.id} needs the counts of its runs`);
  return record as Schedule;
}

/** A store in memory: for tests, and for a host that keeps its schedules only while it runs. */
export class MemoryScheduleStore implements ScheduleStore {
  readonly kind = "memory";
  private readonly schedules = new Map<string, Schedule>();

  async get(id: string): Promise<Schedule | undefined> {
    const schedule = this.schedules.get(id);
    return schedule ? structuredClone(schedule) : undefined;
  }

  async list(): Promise<Schedule[]> {
    return [...this.schedules.values()].map((schedule) => structuredClone(schedule)).sort(byId);
  }

  async put(schedule: Schedule): Promise<void> {
    const checked = checkSchedule(structuredClone(schedule));
    this.schedules.set(checked.id, checked);
  }

  async delete(id: string): Promise<boolean> {
    return this.schedules.delete(id);
  }

  async update(id: string, change: (schedule: Schedule) => Schedule | undefined): Promise<Schedule | undefined> {
    const current = this.schedules.get(id);
    if (current === undefined) return undefined;
    const next = change(structuredClone(current));
    if (next === undefined) return structuredClone(current);
    const checked = checkSchedule(structuredClone(next));
    if (checked.id !== id) throw new ScheduleError("BAD_STORE", "An update cannot change the id of a schedule");
    this.schedules.set(id, checked);
    return structuredClone(checked);
  }
}

interface ScheduleFile {
  schemaVersion: 1;
  schedules: Record<string, Schedule>;
}

/** True when Windows holds a file for a moment. */
function isContention(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException).code;
  return process.platform === "win32" && (code === "EPERM" || code === "EACCES" || code === "EBUSY");
}

const pause = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** This function starts `operation` again while Windows holds the file for a moment: at most 20 times. */
async function retried<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= 20 || !isContention(error)) throw error;
      await pause(10 * attempt);
    }
  }
}

/** This function removes a file. A file that does not exist is not an error. */
const removeFile = (path: string): Promise<void> => retried(() => rm(path, { force: true }));

/** The default age of a stale lock file: 30 seconds. */
export const DEFAULT_LOCK_STALE_MS = 30_000;

/** The options of a `FileScheduleStore`. */
export interface FileScheduleStoreOptions {
  /**
   * The age in milliseconds after which a lock file is stale: its process stopped, and another
   * store takes it over. The default is 30 seconds. A change holds the lock for one read and one write.
   */
  readonly staleMs?: number | undefined;
}

/**
 * A store in one JSON file: `{ "schemaVersion": 1, "schedules": { "<id>": <Schedule> } }`. Each
 * operation reads the file again. A write goes through a temporary file and a rename, so a reader
 * does not see a part of a write. The changes of this process go one at a time.
 *
 * Two processes can share the file. Each change holds a lock file next to it (`lockPath`):
 * - The store makes the lock file with the flag `wx`. Only one process can make it.
 * - Under the lock, the store reads the file again, changes it, writes it, and then removes the lock.
 * - A lock file older than `staleMs` (default 30 seconds) is stale, and the store takes it over.
 * - A store that waits for twice `staleMs` gives up with `LOCKED`.
 * - The store removes only its own lock: the lock file holds a token of the store.
 */
export class FileScheduleStore implements ScheduleStore {
  readonly kind = "file";
  /** The lock file: the path of the store with `.lock`. */
  readonly lockPath: string;
  private readonly staleMs: number;
  private queue: Promise<unknown> = Promise.resolve();

  /**
   * @param path - The JSON file. The store makes it, and its folder, at the first write.
   * @param options - The age of a stale lock file.
   */
  constructor(
    readonly path: string,
    options: FileScheduleStoreOptions = {},
  ) {
    this.lockPath = `${path}.lock`;
    this.staleMs = options.staleMs ?? DEFAULT_LOCK_STALE_MS;
    if (!(this.staleMs > 0) || !Number.isFinite(this.staleMs)) throw new TypeError("FileScheduleStore: staleMs must be a number above 0");
  }

  async get(id: string): Promise<Schedule | undefined> {
    return (await this.read()).schedules[id];
  }

  async list(): Promise<Schedule[]> {
    return Object.values((await this.read()).schedules).sort(byId);
  }

  async put(schedule: Schedule): Promise<void> {
    const checked = checkSchedule(structuredClone(schedule));
    await this.change((file) => {
      file.schedules[checked.id] = checked;
      return true;
    });
  }

  async delete(id: string): Promise<boolean> {
    let deleted = false;
    await this.change((file) => {
      deleted = Object.hasOwn(file.schedules, id);
      if (deleted) delete file.schedules[id];
      return deleted;
    });
    return deleted;
  }

  async update(id: string, change: (schedule: Schedule) => Schedule | undefined): Promise<Schedule | undefined> {
    let result: Schedule | undefined;
    await this.change((file) => {
      const current = file.schedules[id];
      if (current === undefined) return false;
      const next = change(structuredClone(current));
      if (next === undefined) {
        result = current;
        return false;
      }
      const checked = checkSchedule(structuredClone(next));
      if (checked.id !== id) throw new ScheduleError("BAD_STORE", "An update cannot change the id of a schedule");
      file.schedules[id] = checked;
      result = checked;
      return true;
    });
    return result;
  }

  /** The content of the file. A missing file is an empty store. */
  private async read(): Promise<ScheduleFile> {
    let text: string;
    try {
      text = await retried(() => readFile(this.path, "utf8"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { schemaVersion: 1, schedules: {} };
      throw error;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new ScheduleError("BAD_STORE", `The schedule file ${this.path} is not JSON. The store does not write over it.`);
    }
    const file = parsed as Partial<ScheduleFile> | null;
    if (file === null || typeof file !== "object" || file.schemaVersion !== 1 || file.schedules === null || typeof file.schedules !== "object") {
      throw new ScheduleError("BAD_STORE", `The schedule file ${this.path} does not have schemaVersion 1 and schedules`);
    }
    const schedules: Record<string, Schedule> = {};
    for (const [id, value] of Object.entries(file.schedules)) {
      const schedule = checkSchedule(value);
      if (schedule.id !== id) throw new ScheduleError("BAD_STORE", `The schedule file ${this.path} has the schedule ${schedule.id} under the key ${id}`);
      schedules[id] = schedule;
    }
    return { schemaVersion: 1, schedules };
  }

  /**
   * One change of the file, after the changes before it, under the lock file. The read under the
   * lock gets the changes of the other processes. `edit` gives false for no change.
   */
  private change(edit: (file: ScheduleFile) => boolean): Promise<void> {
    const run = this.queue.then(async () => {
      const token = await this.lock();
      try {
        const file = await this.read();
        if (!edit(file)) return;
        await this.write(file);
      } finally {
        await this.unlock(token);
      }
    });
    // A failed change does not stop the next one
    this.queue = run.catch(() => undefined);
    return run;
  }

  /** This method writes the file through a temporary file and a rename. */
  private async write(file: ScheduleFile): Promise<void> {
    // writeFileAtomic flushes the file, tries the rename again on Windows and removes the temporary file after a failure
    await writeFileAtomic(this.path, JSON.stringify(file, null, 2) + "\n", { encoding: "utf8" });
  }

  /**
   * This method makes the lock file and gives its token. It waits while another store holds the
   * lock, and it takes over a stale lock. After twice `staleMs`, it throws `LOCKED`.
   */
  private async lock(): Promise<string> {
    const token = `${process.pid}:${randomBytes(8).toString("hex")}`;
    const deadline = Date.now() + 2 * this.staleMs;
    for (let attempt = 0; ; attempt++) {
      try {
        await writeFile(this.lockPath, token, { encoding: "utf8", flag: "wx" });
        return token;
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "ENOENT" && attempt === 0) {
          // The folder of the store does not exist yet
          await mkdir(dirname(this.lockPath), { recursive: true });
          continue;
        }
        if (code !== "EEXIST" && !isContention(error)) throw error;
      }
      if (await this.breakStale()) continue;
      if (Date.now() >= deadline) {
        throw new ScheduleError("LOCKED", `The lock file ${this.lockPath} stays held: another process holds it for more than ${2 * this.staleMs} ms`);
      }
      // A short wait with a random part: two waiting processes do not try again at the same time
      await pause(Math.min(50, 2 + attempt) + Math.random() * 5);
    }
  }

  /** This method removes the lock file when it holds the token of this store. A lock that another store took over stays. */
  private async unlock(token: string): Promise<void> {
    let content: string;
    try {
      content = await retried(() => readFile(this.lockPath, "utf8"));
    } catch {
      return;
    }
    if (content === token) await removeFile(this.lockPath);
  }

  /** True when the file exists and its last change is older than `staleMs`. */
  private async isStale(path: string): Promise<boolean> {
    try {
      return Date.now() - (await stat(path)).mtimeMs > this.staleMs;
    } catch {
      return false;
    }
  }

  /**
   * This method removes a stale lock file, and gives true then. A second lock file (`.lock.break`)
   * lets one store at a time examine and remove a stale lock. A second store thus finds the new
   * lock of the first store, not the stale lock, and does not remove it.
   */
  private async breakStale(): Promise<boolean> {
    if (!(await this.isStale(this.lockPath))) return false;
    const breaker = `${this.lockPath}.break`;
    try {
      await writeFile(breaker, String(process.pid), { encoding: "utf8", flag: "wx" });
    } catch {
      // Another store examines the lock now. The breaker of a process that stopped is stale too.
      if (await this.isStale(breaker)) await removeFile(breaker).catch(() => undefined);
      return false;
    }
    try {
      // The examination again, under the breaker: another store can have taken over the lock
      if (!(await this.isStale(this.lockPath))) return false;
      await removeFile(this.lockPath);
      return true;
    } finally {
      await removeFile(breaker).catch(() => undefined);
    }
  }
}

/** The store of the default module and of a `Scheduler` without a store: in memory, one for the process. */
export const defaultScheduleStore: ScheduleStore = new MemoryScheduleStore();
