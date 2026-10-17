/**
 * The schedule procedures (roadmap R46) and the stores: add, list, remove and next, the checks
 * of the program, of the expression and of the time zone, the effects, the memory and file
 * stores, and the lock file of the file store with two processes.
 */

import { afterEach, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRegistry, effectsOf, invokePath, isReadOnly, outputValue, type Capability, type ProcedureRegistry } from "@procedures/client";
import { attachProgramStore, MemoryProgramStore } from "@procedures/store";
import { createScheduleModule, registerScheduleProcedures, scheduleModule } from "./module.js";
import { FileScheduleStore, MemoryScheduleStore, checkSchedule, type ScheduleStore } from "./store.js";
import { scheduleNext } from "./procedures/schedule/next.js";
import type { Schedule, ScheduleAddOutput, ScheduleListOutput, ScheduleNextOutput, ScheduleRemoveOutput } from "./types.js";

const NOW = Date.UTC(2026, 9, 16, 12, 0, 30);

const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

async function setup(store: ScheduleStore = new MemoryScheduleStore()) {
  const registry: ProcedureRegistry = createRegistry(createScheduleModule({ store, now: () => NOW }));
  const call = async <T>(key: string, input: unknown, capability?: Capability): Promise<T> => {
    const path = key.split(".");
    return outputValue(await invokePath<T>(path, input, { registry, ...(capability ? { capability } : {}) }), path);
  };
  await call("procedure.define", { path: ["jobs", "ping"], aggregation: { $proc: ["client", "identity"], input: { value: 1 } } });
  return { registry, store, call };
}

describe("schedule.add", () => {
  it("adds a schedule of a stored program, with its next time", async () => {
    const { call, store } = await setup();
    const { schedule } = await call<ScheduleAddOutput>("schedule.add", { cron: "*/15 * * * *", program: "jobs.ping", input: { x: 1 }, timeZone: "utc" });
    expect(schedule).toEqual({
      id: "jobs.ping",
      cron: "*/15 * * * *",
      program: "jobs.ping",
      input: { x: 1 },
      timeZone: "utc",
      createdAt: NOW,
      runs: 0,
      failures: 0,
      skipped: 0,
      nextRunAt: "2026-10-16T12:15:00Z",
    });
    expect(await store.get("jobs.ping")).toMatchObject({ cron: "*/15 * * * *", createdAt: NOW });
  });

  it("refuses a second schedule of a name, and replaces it with replace: true", async () => {
    const { call, store } = await setup();
    await call("schedule.add", { cron: "@hourly", program: "jobs.ping" });
    await expect(call("schedule.add", { cron: "@daily", program: "jobs.ping" })).rejects.toMatchObject({ code: "EXISTS" });
    await store.update("jobs.ping", (schedule) => ({ ...schedule, runs: 5 }));
    const { schedule } = await call<ScheduleAddOutput>("schedule.add", { cron: "@daily", program: "jobs.ping", replace: true });
    expect(schedule).toMatchObject({ cron: "@daily", runs: 0, timeZone: "local" });
    await call("schedule.add", { id: "second", cron: "@daily", program: "jobs.ping" });
    expect((await store.list()).map((each) => each.id)).toEqual(["jobs.ping", "second"]);
  });

  it("refuses a procedure of code, a missing program, a bad expression and one that never comes", async () => {
    const { call, store } = await setup();
    await expect(call("schedule.add", { cron: "* * * * *", program: "procedure.define" })).rejects.toMatchObject({ code: "NOT_A_PROGRAM" });
    await expect(call("schedule.add", { cron: "* * * * *", program: "no.such" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(call("schedule.add", { cron: "* * *", program: "jobs.ping" })).rejects.toMatchObject({ code: "BAD_CRON" });
    await expect(call("schedule.add", { cron: "0 0 31 2 *", program: "jobs.ping" })).rejects.toMatchObject({ code: "BAD_CRON", message: expect.stringContaining("no time") });
    await expect(call("schedule.add", { cron: "* * * * *", program: "jobs..ping" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(call("schedule.add", { id: "a b", cron: "* * * * *", program: "jobs.ping" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(await store.list()).toEqual([]);
  });

  it("accepts a program that only the program store of the registry has", async () => {
    const { call, registry } = await setup();
    const programs = new MemoryProgramStore();
    attachProgramStore(registry, programs);
    await programs.put({ key: "stored.job", path: ["stored", "job"], program: { $proc: ["client", "identity"], input: { value: 2 } }, storedAt: 0 });
    expect((await call<ScheduleAddOutput>("schedule.add", { cron: "@daily", program: "stored.job" })).schedule.program).toBe("stored.job");
  });

  it("keeps the clearance and the permitted effects of the caller, without the deadline", async () => {
    const { call, store } = await setup();
    const capability: Capability = { clearance: "public", effects: { reads: "any", writes: ["fs", "schedules"] }, deadline: Date.now() + 60_000 };
    await call("schedule.add", { cron: "@daily", program: "jobs.ping" }, capability);
    expect((await store.get("jobs.ping"))!.capability).toEqual({ clearance: "public", effects: { reads: "any", writes: ["fs", "schedules"] } });
  });

  it("takes an IANA time zone, with the case of Intl, and refuses an unknown zone", async () => {
    const { call, store } = await setup();
    const { schedule } = await call<ScheduleAddOutput>("schedule.add", { id: "berlin", cron: "0 9 * * *", program: "jobs.ping", timeZone: "europe/berlin" });
    expect(schedule).toMatchObject({ timeZone: "Europe/Berlin", nextRunAt: "2026-10-17T09:00:00+02:00" });
    expect((await store.get("berlin"))!.timeZone).toBe("Europe/Berlin");
    await expect(call("schedule.add", { id: "mars", cron: "0 9 * * *", program: "jobs.ping", timeZone: "Mars/Olympus" })).rejects.toMatchObject({ code: "BAD_TIME_ZONE" });
    await expect(call("schedule.add", { id: "offset", cron: "0 9 * * *", program: "jobs.ping", timeZone: "+05:30" })).rejects.toMatchObject({ code: "BAD_TIME_ZONE" });
    expect((await store.list()).map((each) => each.id)).toEqual(["berlin"]);
  });

  it("is refused to a caller that cannot change the schedules", async () => {
    const { call, store } = await setup();
    await expect(call("schedule.add", { cron: "@daily", program: "jobs.ping" }, { effects: { writes: [] } })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await store.list()).toEqual([]);
  });
});

describe("schedule.list and schedule.remove", () => {
  it("lists the schedules sorted, with the next time, and filters by program", async () => {
    const { call } = await setup();
    await call("procedure.define", { path: ["jobs", "other"], aggregation: { $proc: ["client", "identity"], input: { value: 2 } } });
    await call("schedule.add", { id: "b", cron: "0 9 * * *", program: "jobs.ping", timeZone: "utc" });
    await call("schedule.add", { id: "a", cron: "30 * * * *", program: "jobs.other", timeZone: "utc" });
    const all = await call<ScheduleListOutput>("schedule.list", {});
    expect(all.schedules.map((each) => [each.id, each.nextRunAt])).toEqual([
      ["a", "2026-10-16T12:30:00Z"],
      ["b", "2026-10-17T09:00:00Z"],
    ]);
    expect((await call<ScheduleListOutput>("schedule.list", { program: "jobs.ping" })).schedules.map((each) => each.id)).toEqual(["b"]);
  });

  it("gives nextRunAt null for an expression that a store has but that is not correct", async () => {
    const { call, store } = await setup();
    await store.put({ id: "broken", cron: "nonsense", program: "jobs.ping", timeZone: "utc", createdAt: NOW, runs: 0, failures: 0, skipped: 0 });
    expect((await call<ScheduleListOutput>("schedule.list", {})).schedules[0]!.nextRunAt).toBeNull();
  });

  it("removes a schedule, and a second remove gives false", async () => {
    const { call } = await setup();
    await call("schedule.add", { cron: "@daily", program: "jobs.ping" });
    expect(await call<ScheduleRemoveOutput>("schedule.remove", { id: "jobs.ping" })).toEqual({ removed: true });
    expect(await call<ScheduleRemoveOutput>("schedule.remove", { id: "jobs.ping" })).toEqual({ removed: false });
  });
});

describe("schedule.next", () => {
  it("gives the next times after a time, in the time zone of the input", async () => {
    const { call } = await setup();
    const result = await call<ScheduleNextOutput>("schedule.next", { cron: "0 9 * * mon-fri", after: "2026-10-16T10:00:00Z", count: 3, timeZone: "utc" });
    expect(result.times).toEqual(["2026-10-19T09:00:00Z", "2026-10-20T09:00:00Z", "2026-10-21T09:00:00Z"]);
    expect((await call<ScheduleNextOutput>("schedule.next", { cron: "@hourly", timeZone: "utc" })).times).toEqual([
      "2026-10-16T13:00:00Z",
      "2026-10-16T14:00:00Z",
      "2026-10-16T15:00:00Z",
      "2026-10-16T16:00:00Z",
      "2026-10-16T17:00:00Z",
    ]);
  });

  it("gives the times in an IANA time zone, across a change of daylight saving time", async () => {
    const { call } = await setup();
    const adelaide = await call<ScheduleNextOutput>("schedule.next", { cron: "30 2 * * *", after: "2026-10-03T00:00:00Z", count: 2, timeZone: "Australia/Adelaide" });
    expect(adelaide.times).toEqual(["2026-10-04T03:00:00+10:30", "2026-10-05T02:30:00+10:30"]);
    const kolkata = await call<ScheduleNextOutput>("schedule.next", { cron: "0 9 * * *", count: 1, timeZone: "Asia/Kolkata" });
    expect(kolkata.times).toEqual(["2026-10-17T09:00:00+05:30"]);
    await expect(call("schedule.next", { cron: "0 9 * * *", timeZone: "Nowhere/Land" })).rejects.toMatchObject({ code: "BAD_TIME_ZONE" });
  });

  it("gives local the zone of the option timeZone of the module", async () => {
    const store = new MemoryScheduleStore();
    const registry = createRegistry(createScheduleModule({ store, now: () => NOW, timeZone: "Asia/Kolkata" }));
    await outputValue(await invokePath(["procedure", "define"], { path: ["j", "k"], aggregation: { $proc: ["client", "identity"], input: { value: 1 } } }, { registry }));
    const next = await outputValue(await invokePath<ScheduleNextOutput>(["schedule", "next"], { cron: "0 9 * * *", count: 1 }, { registry }));
    expect(next.times).toEqual(["2026-10-17T09:00:00+05:30"]);
    const added = await outputValue(await invokePath<ScheduleAddOutput>(["schedule", "add"], { cron: "0 9 * * *", program: "j.k" }, { registry }));
    expect(added.schedule).toMatchObject({ timeZone: "local", nextRunAt: "2026-10-17T09:00:00+05:30" });
    const listed = await outputValue(await invokePath<ScheduleListOutput>(["schedule", "list"], {}, { registry }));
    expect(listed.schedules[0]!.nextRunAt).toBe("2026-10-17T09:00:00+05:30");
    expect(() => createScheduleModule({ timeZone: "Nowhere/Land" })).toThrow(expect.objectContaining({ code: "BAD_TIME_ZONE" }));
  });

  it("refuses a bad expression, a bad time and more than 100 times", async () => {
    const { call } = await setup();
    await expect(call("schedule.next", { cron: "61 * * * *" })).rejects.toMatchObject({ code: "BAD_CRON" });
    await expect(call("schedule.next", { cron: "* * * * *", after: "yesterday" })).rejects.toMatchObject({ code: "BAD_CRON" });
    await expect(call("schedule.next", { cron: "* * * * *", count: 101 })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("uses the clock of the process by default", async () => {
    const before = Date.now();
    const { times } = await scheduleNext({ cron: "* * * * *", count: 1, timeZone: "utc" });
    expect(Date.parse(times[0]!)).toBeGreaterThan(before);
  });
});

describe("the module", () => {
  it("declares the effects of each procedure", () => {
    const effects = Object.fromEntries(scheduleModule.procedures.map((procedure) => [procedure.path.join("."), effectsOf(procedure)]));
    expect(effects).toEqual({
      "schedule.add": { reads: ["fs", "programs", "registry", "schedules"], writes: ["fs", "schedules"] },
      "schedule.list": { reads: ["fs", "schedules"], writes: [] },
      "schedule.remove": { reads: ["fs", "schedules"], writes: ["fs", "schedules"], destructive: true, idempotent: true },
      "schedule.next": { reads: [], writes: [] },
    });
    expect(isReadOnly(effects["schedule.next"])).toBe(true);
    expect(createScheduleModule()).toBe(scheduleModule);
  });

  it("registers the procedures with the store of the options", async () => {
    const registry = createRegistry();
    const store = new MemoryScheduleStore();
    registerScheduleProcedures(registry, { store });
    await outputValue(await invokePath(["procedure", "define"], { path: ["j", "k"], aggregation: { $proc: ["client", "identity"], input: { value: 1 } } }, { registry }));
    await outputValue(await invokePath(["schedule", "add"], { cron: "@daily", program: "j.k" }, { registry }));
    expect((await store.list()).map((each) => each.id)).toEqual(["j.k"]);
  });
});

const schedule = (id: string, extra: Partial<Schedule> = {}): Schedule => ({ id, cron: "@daily", program: "jobs.ping", timeZone: "utc", createdAt: NOW, runs: 0, failures: 0, skipped: 0, ...extra });

describe.each([
  ["memory", () => new MemoryScheduleStore()],
  [
    "file",
    () => {
      const folder = mkdtempSync(join(tmpdir(), "schedule-store-"));
      folders.push(folder);
      return new FileScheduleStore(join(folder, "nested", "schedules.json"));
    },
  ],
] as const)("the %s store", (_kind, make) => {
  it("puts, gets, lists sorted, updates and deletes", async () => {
    const store = make();
    expect(await store.list()).toEqual([]);
    await store.put(schedule("b"));
    await store.put(schedule("a"));
    expect((await store.list()).map((each) => each.id)).toEqual(["a", "b"]);
    expect(await store.update("a", (each) => ({ ...each, runs: 2 }))).toMatchObject({ runs: 2 });
    expect(await store.update("a", () => undefined)).toMatchObject({ runs: 2 });
    expect(await store.update("missing", (each) => each)).toBeUndefined();
    await expect(store.update("a", (each) => ({ ...each, id: "c" }))).rejects.toMatchObject({ code: "BAD_STORE" });
    expect(await store.get("a")).toMatchObject({ runs: 2 });
    expect(await store.delete("a")).toBe(true);
    expect(await store.delete("a")).toBe(false);
    expect(await store.get("a")).toBeUndefined();
  });

  it("loses no update when many come at the same time", async () => {
    const store = make();
    await store.put(schedule("count"));
    await Promise.all(Array.from({ length: 25 }, () => store.update("count", (each) => ({ ...each, runs: each.runs + 1 }))));
    expect((await store.get("count"))!.runs).toBe(25);
  });

  it("refuses a schedule of a bad shape", async () => {
    const store = make();
    await expect(store.put({ ...schedule("x"), timeZone: "mars" })).rejects.toMatchObject({ code: "BAD_STORE" });
    await expect(store.put({ ...schedule("x"), timeZone: 5 as never })).rejects.toMatchObject({ code: "BAD_STORE" });
    await expect(store.put({ ...schedule("x"), runs: -1 })).rejects.toMatchObject({ code: "BAD_STORE" });
    await store.put({ ...schedule("x"), timeZone: "America/New_York" });
    expect((await store.get("x"))!.timeZone).toBe("America/New_York");
  });
});

describe("the file store", () => {
  it("keeps the schedules in a JSON file that a new store reads again", async () => {
    const folder = mkdtempSync(join(tmpdir(), "schedule-file-"));
    folders.push(folder);
    const path = join(folder, "schedules.json");
    await new FileScheduleStore(path).put(schedule("kept"));
    expect(JSON.parse(readFileSync(path, "utf8"))).toMatchObject({ schemaVersion: 1, schedules: { kept: { id: "kept" } } });
    expect(await new FileScheduleStore(path).get("kept")).toMatchObject({ id: "kept" });
  });

  it("refuses a file that is not JSON, or that has another form, and does not write over it", async () => {
    const folder = mkdtempSync(join(tmpdir(), "schedule-file-"));
    folders.push(folder);
    const path = join(folder, "schedules.json");
    writeFileSync(path, "{ not json");
    const store = new FileScheduleStore(path);
    await expect(store.list()).rejects.toMatchObject({ code: "BAD_STORE" });
    await expect(store.put(schedule("x"))).rejects.toMatchObject({ code: "BAD_STORE" });
    expect(readFileSync(path, "utf8")).toBe("{ not json");
    writeFileSync(path, JSON.stringify({ schemaVersion: 1, schedules: { a: schedule("b") } }));
    await expect(store.list()).rejects.toMatchObject({ code: "BAD_STORE" });
    writeFileSync(path, JSON.stringify({ schemaVersion: 2 }));
    await expect(store.get("a")).rejects.toMatchObject({ code: "BAD_STORE" });
  });

  it("checkSchedule refuses a record without its fields", () => {
    expect(() => checkSchedule(null)).toThrow(/object/);
    expect(() => checkSchedule({ id: "" })).toThrow(/id/);
    expect(() => checkSchedule({ id: "a", cron: "@daily" })).toThrow(/program/);
    expect(() => checkSchedule({ ...schedule("a"), createdAt: "now" })).toThrow(/createdAt/);
  });
});

/** The loader of tsx: a child process imports `store.ts` with it. */
const TSX = pathToFileURL(createRequire(import.meta.url).resolve("tsx")).href;
const STORE_MODULE = pathToFileURL(fileURLToPath(new URL("./store.ts", import.meta.url))).href;

/** A child process: it waits for the file `go`, then writes `count` schedules with its prefix to the store file. */
const CHILD = `
const { existsSync } = await import("node:fs");
const { FileScheduleStore } = await import(process.env.STORE_MODULE);
const store = new FileScheduleStore(process.env.STORE_FILE);
console.log("ready");
while (!existsSync(process.env.STORE_GO)) await new Promise((resolve) => setTimeout(resolve, 5));
for (let index = 0; index < Number(process.env.STORE_COUNT); index++) {
  await store.put({ id: process.env.STORE_PREFIX + "-" + index, cron: "@daily", program: "jobs.ping", timeZone: "utc", createdAt: index, runs: 0, failures: 0, skipped: 0 });
}
console.log("done");
`;

/** This function starts a child process that writes schedules. `ready` comes when it waits for `go`, `exit` with its end. */
function writer(file: string, go: string, prefix: string, count: number): { ready: Promise<void>; exit: Promise<void> } {
  const child = spawn(process.execPath, ["--import", TSX, "--input-type=module", "-e", CHILD], {
    env: { ...process.env, STORE_MODULE, STORE_FILE: file, STORE_GO: go, STORE_PREFIX: prefix, STORE_COUNT: String(count) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stderr.on("data", (chunk: Buffer) => (stderr += String(chunk)));
  const exit = new Promise<void>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => (code === 0 && stdout.includes("done") ? resolve() : reject(new Error(`The writer ${prefix} ended with ${code}: ${stderr}`))));
  });
  const ready = new Promise<void>((resolve, reject) => {
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += String(chunk);
      if (stdout.includes("ready")) resolve();
    });
    exit.catch(reject);
  });
  return { ready, exit };
}

describe("the lock of the file store", () => {
  const files = (): { folder: string; path: string; lock: string } => {
    const folder = mkdtempSync(join(tmpdir(), "schedule-lock-"));
    folders.push(folder);
    const path = join(folder, "schedules.json");
    return { folder, path, lock: `${path}.lock` };
  };
  /** A time in the past: a lock file with it is stale. */
  const old = (seconds: number): Date => new Date(Date.now() - seconds * 1000);

  it("keeps the writes of two processes on one file: 50 schedules each, 100 in the file", { timeout: 120_000 }, async () => {
    const { folder, path, lock } = files();
    const go = join(folder, "go");
    const a = writer(path, go, "a", 50);
    const b = writer(path, go, "b", 50);
    await Promise.all([a.ready, b.ready]);
    writeFileSync(go, "");
    await Promise.all([a.exit, b.exit]);
    const stored = await new FileScheduleStore(path).list();
    expect(stored).toHaveLength(100);
    expect(stored.filter((each) => each.id.startsWith("a-"))).toHaveLength(50);
    expect(stored.filter((each) => each.id.startsWith("b-"))).toHaveLength(50);
    expect(existsSync(lock)).toBe(false);
    expect(readdirSync(folder).sort()).toEqual(["go", "schedules.json"]);
  });

  it("holds the lock for each change, and removes it after", async () => {
    const { path, lock } = files();
    const store = new FileScheduleStore(path);
    expect(store.lockPath).toBe(lock);
    let held = false;
    await store.put(schedule("a"));
    await store.update("a", (each) => {
      held = existsSync(lock);
      return { ...each, runs: 1 };
    });
    expect(held).toBe(true);
    expect(existsSync(lock)).toBe(false);
    expect(await store.delete("a")).toBe(true);
    expect(existsSync(lock)).toBe(false);
  });

  it("reads the file again under the lock: a change of another store stays", async () => {
    const { path } = files();
    const first = new FileScheduleStore(path);
    const second = new FileScheduleStore(path);
    await first.put(schedule("a"));
    await second.put(schedule("b"));
    await first.update("a", (each) => ({ ...each, runs: 3 }));
    expect((await second.list()).map((each) => [each.id, each.runs])).toEqual([
      ["a", 3],
      ["b", 0],
    ]);
  });

  it("waits while another store holds the lock, then writes", async () => {
    const { path, lock } = files();
    writeFileSync(lock, "another store");
    const store = new FileScheduleStore(path);
    let done = false;
    const put = store.put(schedule("a")).then(() => (done = true));
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(done).toBe(false);
    expect(existsSync(path)).toBe(false);
    rmSync(lock);
    await put;
    expect(await store.get("a")).toMatchObject({ id: "a" });
    expect(existsSync(lock)).toBe(false);
  });

  it("takes over a stale lock, older than staleMs", async () => {
    const { path, lock } = files();
    writeFileSync(lock, "a process that stopped");
    utimesSync(lock, old(60), old(60));
    const store = new FileScheduleStore(path);
    await store.put(schedule("a"));
    expect(await store.get("a")).toMatchObject({ id: "a" });
    expect(existsSync(lock)).toBe(false);
    // A short limit: a lock of 2 seconds is stale
    writeFileSync(lock, "a process that stopped");
    utimesSync(lock, old(2), old(2));
    await new FileScheduleStore(path, { staleMs: 1000 }).put(schedule("b"));
    expect((await store.list()).map((each) => each.id)).toEqual(["a", "b"]);
  });

  it("removes a stale breaker of a process that stopped during a takeover", async () => {
    const { path, lock } = files();
    writeFileSync(lock, "stale");
    writeFileSync(`${lock}.break`, "stale");
    utimesSync(lock, old(60), old(60));
    utimesSync(`${lock}.break`, old(60), old(60));
    await new FileScheduleStore(path).put(schedule("a"));
    expect(existsSync(lock)).toBe(false);
    expect(existsSync(`${lock}.break`)).toBe(false);
  });

  it("gives up with LOCKED after twice staleMs, and keeps a lock that is not stale", async () => {
    const { path, lock } = files();
    writeFileSync(lock, "a lock from the future");
    // A lock with a time in the future never gets stale
    const future = new Date(Date.now() + 3_600_000);
    utimesSync(lock, future, future);
    const store = new FileScheduleStore(path, { staleMs: 50 });
    await expect(store.put(schedule("a"))).rejects.toMatchObject({ code: "LOCKED" });
    expect(readFileSync(lock, "utf8")).toBe("a lock from the future");
    expect(existsSync(path)).toBe(false);
  });

  it("removes the lock after an error, and the next change works", async () => {
    const { path, lock } = files();
    const store = new FileScheduleStore(path);
    await store.put(schedule("a"));
    await expect(
      store.update("a", () => {
        throw new Error("the change failed");
      }),
    ).rejects.toThrow("the change failed");
    expect(existsSync(lock)).toBe(false);
    await expect(store.update("a", (each) => ({ ...each, cron: 5 as never }))).rejects.toMatchObject({ code: "BAD_STORE" });
    expect(existsSync(lock)).toBe(false);
    writeFileSync(path, "{ not json");
    await expect(store.put(schedule("b"))).rejects.toMatchObject({ code: "BAD_STORE" });
    expect(existsSync(lock)).toBe(false);
    writeFileSync(path, JSON.stringify({ schemaVersion: 1, schedules: {} }));
    await store.put(schedule("b"));
    expect((await store.list()).map((each) => each.id)).toEqual(["b"]);
  });

  it("does not remove a lock that another store took over", async () => {
    const { path, lock } = files();
    const store = new FileScheduleStore(path);
    await store.put(schedule("a"));
    await store.update("a", (each) => {
      // Another store took the lock over during the change
      writeFileSync(lock, "the token of another store");
      return { ...each, runs: 1 };
    });
    expect(readFileSync(lock, "utf8")).toBe("the token of another store");
  });

  it("refuses a staleMs that is not above 0", () => {
    expect(() => new FileScheduleStore("x.json", { staleMs: 0 })).toThrow(TypeError);
    expect(() => new FileScheduleStore("x.json", { staleMs: Number.NaN })).toThrow(TypeError);
    expect(() => new FileScheduleStore("x.json", { staleMs: Number.POSITIVE_INFINITY })).toThrow(TypeError);
  });
});
