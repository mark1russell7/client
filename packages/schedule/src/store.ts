/**
 * The stores of the schedules: in memory, or in one JSON file.
 *
 * A host gives one store to the module of the procedures (`createScheduleModule({ store })`) and
 * the same store to its `Scheduler`. `update()` changes one schedule in one step, so the record of
 * a run does not lose a change of `schedule.add` that came at the same time.
 */

import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomBytes } from "node:crypto";
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

/** The schedule of a record that came from a file: its shape is not trusted. */
export function checkSchedule(value: unknown): Schedule {
  const record = value as Partial<Schedule> | null;
  if (record === null || typeof record !== "object") throw new ScheduleError("BAD_STORE", "A stored schedule must be an object");
  if (typeof record.id !== "string" || record.id === "") throw new ScheduleError("BAD_STORE", "A stored schedule needs an id");
  if (typeof record.cron !== "string" || typeof record.program !== "string" || record.program === "") {
    throw new ScheduleError("BAD_STORE", `The schedule ${record.id} needs a cron expression and a program`);
  }
  if (record.timeZone !== "utc" && record.timeZone !== "local") throw new ScheduleError("BAD_STORE", `The schedule ${record.id} needs the time zone utc or local`);
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

/**
 * A store in one JSON file: `{ "schemaVersion": 1, "schedules": { "<id>": <Schedule> } }`. Each
 * operation reads the file again. A write goes through a temporary file and a rename, so a reader
 * never sees a part of a write. The writes of this process go one at a time. The store is for
 * one process: two processes on one file can lose a write.
 */
export class FileScheduleStore implements ScheduleStore {
  readonly kind = "file";
  private queue: Promise<unknown> = Promise.resolve();

  /** @param path - The JSON file. The store makes it, and its folder, at the first write. */
  constructor(readonly path: string) {}

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
      text = await readFile(this.path, "utf8");
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

  /** One change of the file, after the changes before it. `edit` gives false for no change. */
  private change(edit: (file: ScheduleFile) => boolean): Promise<void> {
    const run = this.queue.then(async () => {
      const file = await this.read();
      if (!edit(file)) return;
      await mkdir(dirname(this.path), { recursive: true });
      const temporary = `${this.path}.${randomBytes(6).toString("hex")}.tmp`;
      await writeFile(temporary, JSON.stringify(file, null, 2) + "\n", "utf8");
      for (let attempt = 1; ; attempt++) {
        try {
          await rename(temporary, this.path);
          return;
        } catch (error) {
          if (attempt >= 20 || !isContention(error)) {
            await rm(temporary, { force: true });
            throw error;
          }
          await pause(10 * attempt);
        }
      }
    });
    // A failed change does not stop the next one
    this.queue = run.catch(() => undefined);
    return run;
  }
}

/** The store of the default module and of a `Scheduler` without a store: in memory, one for the process. */
export const defaultScheduleStore: ScheduleStore = new MemoryScheduleStore();
