/**
 * The scheduler (roadmap R46) with `fakeClock` of `@mark1russell7/service/testing`: the runs at
 * their minutes, the records, no overlap, the time limit, the capability, the program store, the
 * missed times and the stop.
 */

import { describe, expect, it } from "vitest";
import { z } from "zod";
import { fakeClock } from "@mark1russell7/service/testing";
import {
  createProcedure,
  createRegistry,
  defineModule,
  invokePath,
  outputValue,
  zodAdapter,
  type Capability,
  type ProcedureContext,
  type ProcedureRegistry,
} from "@procedures/client";
import { attachProgramStore, MemoryProgramStore, storeModule } from "@procedures/store";
import { createScheduleModule } from "./module.js";
import { Scheduler, type ScheduleRunEvent, type SchedulerOptions } from "./scheduler.js";
import { MemoryScheduleStore, type ScheduleStore } from "./store.js";
import type { Schedule, ScheduleAddInput } from "./types.js";

/** 12:00:30 UTC: the first minute comes 30 seconds after the start. */
const T0 = Date.UTC(2026, 9, 16, 12, 0, 30);

/** A gate that a test opens. */
function gate(): { promise: Promise<void>; open: () => void } {
  let open!: () => void;
  const promise = new Promise<void>((resolve) => (open = resolve));
  return { promise, open };
}

/** A few turns of the event loop: the runs go on between the steps of the clock. */
async function until(condition: () => boolean | Promise<boolean>, turns = 200): Promise<void> {
  for (let turn = 0; turn < turns; turn++) {
    if (await condition()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  throw new Error("The condition did not come true");
}

const ok = zodAdapter<{ ok: boolean }>(z.object({ ok: z.boolean() }));

/** A registry with the schedule procedures, the program store procedures and three test procedures, and a scheduler on a fake clock. */
async function harness(options: Partial<SchedulerOptions> = {}, store: ScheduleStore = new MemoryScheduleStore()) {
  const clock = fakeClock();
  const now = () => T0 + clock.now();
  const calls: unknown[] = [];
  let blocked = 0;
  let current = gate();
  const test = defineModule("test", [
    createProcedure()
      .path(["test", "record"])
      .input(zodAdapter<{ value?: unknown }>(z.object({ value: z.unknown().optional() })))
      .output(ok)
      .meta({ effects: { reads: [], writes: ["test"] } })
      .handler(async (input: { value?: unknown }) => {
        calls.push(input.value);
        return { ok: true };
      })
      .build(),
    createProcedure()
      .path(["test", "block"])
      .input(zodAdapter<{ obey?: boolean }>(z.object({ obey: z.boolean().optional() })))
      .output(ok)
      .meta({ effects: { reads: [], writes: [] } })
      .handler(async (input: { obey?: boolean }, ctx: ProcedureContext) => {
        blocked++;
        if (input.obey) {
          await new Promise<void>((resolve, reject) => {
            ctx.signal?.addEventListener("abort", () => reject(new Error("stopped")), { once: true });
            void current.promise.then(resolve);
          });
        } else {
          await current.promise;
        }
        return { ok: true };
      })
      .build(),
    createProcedure()
      .path(["test", "fail"])
      .input(zodAdapter<Record<string, never>>(z.object({})))
      .output(ok)
      .meta({ effects: { reads: [], writes: [] } })
      .handler(async () => {
        throw Object.assign(new Error("boom"), { code: "BOOM" });
      })
      .build(),
  ]);
  const registry: ProcedureRegistry = createRegistry(createScheduleModule({ store, now }), storeModule, test);
  const call = async <T>(key: string, input: unknown, capability?: Capability): Promise<T> => {
    const path = key.split(".");
    return outputValue(await invokePath<T>(path, input, { registry, ...(capability ? { capability } : {}) }), path);
  };
  const define = (key: string, aggregation: unknown) => call("procedure.define", { path: key.split("."), aggregation });
  await define("jobs.ping", { $proc: ["test", "record"], input: { value: { $ref: "input.n" } } });
  await define("jobs.block", { $proc: ["test", "block"], input: { obey: { $ref: "input.obey" } } });
  await define("jobs.fail", { $proc: ["test", "fail"], input: {} });
  const events: ScheduleRunEvent[] = [];
  const scheduler = new Scheduler({ registry, store, clock, now, onRun: (event) => events.push(event), ...options });
  const add = (input: ScheduleAddInput, capability?: Capability) => call("schedule.add", { timeZone: "utc", ...input }, capability);
  const get = async (id: string): Promise<Schedule> => (await store.get(id))!;
  return {
    clock,
    now,
    calls,
    events,
    registry,
    store,
    scheduler,
    call,
    add,
    get,
    blocked: () => blocked,
    open: () => current.open(),
    reset: () => (current = gate()),
    /** The clock moves, and the examination that its timer started ends. */
    step: async (ms: number) => {
      await clock.advance(ms);
      await scheduler.tick();
    },
  };
}

describe("the scheduler", () => {
  it("starts a program at each time of its expression, and records each run", async () => {
    const h = await harness();
    await h.add({ cron: "* * * * *", program: "jobs.ping", input: { n: 7 } });
    await h.scheduler.start();
    expect(h.scheduler.started).toBe(true);
    expect(h.calls).toEqual([]);
    await h.step(29_999);
    await h.scheduler.settled();
    expect(h.calls).toEqual([]);
    await h.step(1);
    await h.scheduler.settled();
    expect(h.calls).toEqual([7]);
    await h.step(60_000);
    await h.scheduler.settled();
    expect(h.calls).toEqual([7, 7]);
    const schedule = await h.get("jobs.ping");
    expect(schedule).toMatchObject({ runs: 2, failures: 0, skipped: 0, lastRun: { startedAt: Date.UTC(2026, 9, 16, 12, 2), durationMs: 0, outcome: "success" } });
    expect(h.events.map((event) => [event.id, event.outcome, new Date(event.startedAt).toISOString()])).toEqual([
      ["jobs.ping", "success", "2026-10-16T12:01:00.000Z"],
      ["jobs.ping", "success", "2026-10-16T12:02:00.000Z"],
    ]);
    await h.scheduler.stop();
    expect(h.scheduler.started).toBe(false);
  });

  it("starts each schedule only at its own minutes", async () => {
    const h = await harness();
    await h.add({ id: "five", cron: "*/5 * * * *", program: "jobs.ping", input: { n: 5 } });
    await h.add({ id: "two", cron: "*/2 * * * *", program: "jobs.ping", input: { n: 2 } });
    await h.scheduler.start();
    for (let minute = 1; minute <= 10; minute++) {
      await h.step(minute === 1 ? 30_000 : 60_000);
      await h.scheduler.settled();
    }
    expect(h.events.map((event) => `${new Date(event.startedAt).getUTCMinutes()}:${event.id}`)).toEqual(["2:two", "4:two", "5:five", "6:two", "8:two", "10:five", "10:two"]);
  });

  it("does not start a second run of a schedule during a run: the time counts as skipped", async () => {
    const h = await harness();
    await h.add({ cron: "* * * * *", program: "jobs.block" });
    await h.scheduler.start();
    await h.step(30_000);
    await until(() => h.blocked() === 1);
    expect(h.scheduler.active).toEqual(["jobs.block"]);
    await h.step(60_000);
    await until(async () => (await h.get("jobs.block")).skipped === 1);
    expect(h.blocked()).toBe(1);
    h.open();
    await h.scheduler.settled();
    expect(await h.get("jobs.block")).toMatchObject({ runs: 1, skipped: 1, lastRun: { outcome: "success", durationMs: 60_000 } });
    await h.step(60_000);
    await h.scheduler.settled();
    expect(h.blocked()).toBe(2);
    expect(h.events.map((event) => event.outcome)).toEqual(["skipped", "success", "success"]);
  });

  it("aborts a run at its time limit and records TIMEOUT; the schedule stays busy until the handler ends", async () => {
    const h = await harness({ runTimeoutMs: 30_000 });
    await h.add({ cron: "* * * * *", program: "jobs.block", input: { obey: false } });
    await h.scheduler.start();
    await h.step(30_000);
    await until(() => h.blocked() === 1);
    await h.step(30_000);
    // The handler does not obey the abort: the run goes on, and the next minute is skipped
    expect(h.scheduler.active).toEqual(["jobs.block"]);
    await h.step(30_000);
    await until(async () => (await h.get("jobs.block")).skipped === 1);
    h.open();
    await h.scheduler.settled();
    const schedule = await h.get("jobs.block");
    expect(schedule).toMatchObject({ runs: 1, failures: 1, lastRun: { outcome: "failure", durationMs: 60_000, error: { code: "TIMEOUT" } } });
  });

  it("ends a run that obeys the abort at the time limit", async () => {
    const h = await harness({ runTimeoutMs: 10_000 });
    await h.add({ cron: "* * * * *", program: "jobs.block", input: { obey: true } });
    await h.scheduler.start();
    await h.step(30_000);
    await until(() => h.blocked() === 1);
    await h.step(10_000);
    await h.scheduler.settled();
    expect(h.scheduler.active).toEqual([]);
    const schedule = await h.get("jobs.block");
    expect(schedule.lastRun).toMatchObject({ outcome: "failure", durationMs: 10_000, error: { code: "TIMEOUT", message: expect.stringContaining("stopped") } });
  });

  it("records a failure with the code and the message of the error", async () => {
    const h = await harness();
    await h.add({ cron: "* * * * *", program: "jobs.fail" });
    await h.scheduler.start();
    await h.step(30_000);
    await h.scheduler.settled();
    expect(await h.get("jobs.fail")).toMatchObject({ runs: 1, failures: 1, lastRun: { outcome: "failure", error: { code: "BOOM", message: "boom" } } });
    expect(h.events[0]).toMatchObject({ outcome: "failure", error: { code: "BOOM" } });
  });
});

describe("the capability of a run", () => {
  const host: Capability = { effects: { reads: "any", writes: ["test", "fs", "schedules", "registry"] } };

  it("is the capability of the host, narrowed by the capability of the caller that added the schedule", async () => {
    const h = await harness({ capability: host });
    // This caller can change the schedules, not the "test" resource
    await h.add({ id: "narrow", cron: "* * * * *", program: "jobs.ping", input: { n: 1 } }, { effects: { reads: "any", writes: ["fs", "schedules"] } });
    await h.add({ id: "wide", cron: "* * * * *", program: "jobs.ping", input: { n: 2 } });
    expect((await h.get("narrow")).capability).toEqual({ effects: { reads: "any", writes: ["fs", "schedules"] } });
    expect((await h.get("wide")).capability).toBeUndefined();
    await h.scheduler.start();
    await h.step(30_000);
    await h.scheduler.settled();
    expect(h.calls).toEqual([2]);
    expect(await h.get("narrow")).toMatchObject({ failures: 1, lastRun: { outcome: "failure", error: { code: "FORBIDDEN" } } });
    expect(await h.get("wide")).toMatchObject({ failures: 0, lastRun: { outcome: "success" } });
  });

  it("is never wider than the capability of the host", async () => {
    const h = await harness({ capability: { effects: { writes: [] } } });
    await h.add({ cron: "* * * * *", program: "jobs.ping", input: { n: 1 } });
    await h.scheduler.start();
    await h.step(30_000);
    await h.scheduler.settled();
    expect(h.calls).toEqual([]);
    expect(await h.get("jobs.ping")).toMatchObject({ lastRun: { outcome: "failure", error: { code: "FORBIDDEN" } } });
  });

  it("comes from the policy of the host, with its expose rule for the calls of the program", async () => {
    const { hostPolicy } = await import("@procedures/client");
    const h = await harness({ policy: hostPolicy({ expose: ["test.block"] }) });
    await h.add({ cron: "* * * * *", program: "jobs.ping", input: { n: 1 } });
    await h.scheduler.start();
    await h.step(30_000);
    await h.scheduler.settled();
    expect(h.calls).toEqual([]);
    expect(await h.get("jobs.ping")).toMatchObject({ lastRun: { outcome: "failure", error: { code: "NOT_EXPOSED" } } });
  });
});

describe("the programs", () => {
  it("loads a program of the program store that the registry does not have, then starts it", async () => {
    const h = await harness();
    const programs = new MemoryProgramStore();
    attachProgramStore(h.registry, programs);
    await programs.put({ key: "stored.job", path: ["stored", "job"], program: { $proc: ["test", "record"], input: { value: "from the store" } }, storedAt: 0 });
    await h.add({ cron: "* * * * *", program: "stored.job" });
    expect(h.registry.get(["stored", "job"])).toBeUndefined();
    await h.scheduler.start();
    await h.step(30_000);
    await h.scheduler.settled();
    expect(h.calls).toEqual(["from the store"]);
    expect(h.registry.get(["stored", "job"])).toBeDefined();
  });

  it("records NOT_A_PROGRAM for a procedure of code and NOT_FOUND for a missing program", async () => {
    const h = await harness();
    const base: Schedule = { id: "x", cron: "* * * * *", program: "test.record", timeZone: "utc", createdAt: T0, runs: 0, failures: 0, skipped: 0 };
    await h.store.put(base);
    await h.store.put({ ...base, id: "y", program: "nothing.here" });
    await h.scheduler.start();
    await h.step(30_000);
    await h.scheduler.settled();
    expect(h.calls).toEqual([]);
    expect((await h.get("x")).lastRun?.error?.code).toBe("NOT_A_PROGRAM");
    expect((await h.get("y")).lastRun?.error?.code).toBe("NOT_FOUND");
  });
});

describe("the times", () => {
  it("counts a schedule that a procedure adds or removes at the next minute", async () => {
    const h = await harness();
    await h.scheduler.start();
    await h.step(30_000);
    await h.clock.advance(20_000);
    // Added at 12:01:20: its first time is 12:02
    await h.add({ cron: "* * * * *", program: "jobs.ping", input: { n: 1 } });
    await h.add({ id: "gone", cron: "* * * * *", program: "jobs.ping", input: { n: 2 } });
    await h.call("schedule.remove", { id: "gone" });
    await h.step(40_000);
    await h.scheduler.settled();
    expect(h.calls).toEqual([1]);
    expect(h.events.map((event) => new Date(event.startedAt).toISOString())).toEqual(["2026-10-16T12:02:00.000Z"]);
  });

  it("does not run the times that it missed while it was stopped", async () => {
    const h = await harness();
    await h.add({ cron: "* * * * *", program: "jobs.ping", input: { n: 1 } });
    await h.scheduler.start();
    await h.step(30_000);
    await h.scheduler.settled();
    await h.scheduler.stop();
    // Stopped from 12:01 to 12:06:10: the times 12:02 to 12:06 do not run
    await h.clock.advance(5 * 60_000 + 10_000);
    expect(h.calls).toEqual([1]);
    await h.scheduler.start();
    await h.scheduler.settled();
    expect(h.calls).toEqual([1]);
    await h.step(50_000);
    await h.scheduler.settled();
    expect(h.calls).toEqual([1, 1]);
    expect(h.events.map((event) => new Date(event.startedAt).toISOString())).toEqual(["2026-10-16T12:01:00.000Z", "2026-10-16T12:07:00.000Z"]);
  });

  it("starts one run for the times of a blocked minute, not one for each time", async () => {
    const h = await harness();
    await h.add({ cron: "* * * * *", program: "jobs.ping", input: { n: 1 } });
    await h.scheduler.start();
    h.clock.block(3 * 60_000);
    await h.step(0);
    await h.scheduler.settled();
    expect(h.calls).toEqual([1]);
    await h.step(60_000);
    await h.scheduler.settled();
    expect(h.calls).toEqual([1, 1]);
  });

  it("keeps the record of an old run away from a schedule that replaced it", async () => {
    const h = await harness();
    await h.add({ cron: "* * * * *", program: "jobs.block" });
    await h.scheduler.start();
    await h.step(30_000);
    await until(() => h.blocked() === 1);
    await h.add({ cron: "0 0 * * *", program: "jobs.block", replace: true });
    h.open();
    await h.scheduler.settled();
    expect(await h.get("jobs.block")).toMatchObject({ cron: "0 0 * * *", runs: 0 });
  });
});

describe("the control of the scheduler", () => {
  it("stops: the timer ends and a run gets the abort", async () => {
    const h = await harness();
    await h.add({ cron: "* * * * *", program: "jobs.block", input: { obey: true } });
    await h.scheduler.start();
    await h.step(30_000);
    await until(() => h.blocked() === 1);
    await h.scheduler.stop();
    expect(h.scheduler.active).toEqual([]);
    expect((await h.get("jobs.block")).lastRun).toMatchObject({ outcome: "failure", error: { message: expect.stringContaining("stopped") } });
    expect(h.clock.pending).toBe(0);
    await h.step(5 * 60_000);
    expect(h.blocked()).toBe(1);
  });

  it("starts a run now, or skips it during a run, and refuses a missing schedule", async () => {
    const h = await harness();
    await h.add({ cron: "0 0 1 1 *", program: "jobs.ping", input: { n: 3 } });
    expect(await h.scheduler.runNow("jobs.ping")).toMatchObject({ outcome: "success" });
    expect(h.calls).toEqual([3]);
    await h.add({ cron: "0 0 1 1 *", program: "jobs.block" });
    const first = h.scheduler.runNow("jobs.block");
    await until(() => h.blocked() === 1);
    expect(await h.scheduler.runNow("jobs.block")).toMatchObject({ outcome: "skipped" });
    h.open();
    expect(await first).toMatchObject({ outcome: "success" });
    await expect(h.scheduler.runNow("missing")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("gives an error of the store and of onRun to onError, and keeps its timer", async () => {
    const errors: unknown[] = [];
    const broken = new MemoryScheduleStore();
    broken.list = async () => {
      throw new Error("disk gone");
    };
    const h = await harness({ onError: (error) => errors.push(error) }, broken);
    await h.scheduler.start();
    expect(errors).toHaveLength(1);
    expect(h.clock.pending).toBe(1);
    await h.scheduler.stop();

    const loud = await harness({
      onRun: () => {
        throw new Error("onRun failed");
      },
      onError: (error) => errors.push(error),
    });
    await loud.add({ cron: "* * * * *", program: "jobs.ping", input: { n: 1 } });
    await loud.scheduler.start();
    await loud.step(30_000);
    await loud.scheduler.settled();
    expect(loud.calls).toEqual([1]);
    expect(String(errors[1])).toContain("onRun failed");
  });

  it("refuses a negative time limit, and a second start does nothing", async () => {
    expect(() => new Scheduler({ runTimeoutMs: -1 })).toThrow(/runTimeoutMs/);
    const h = await harness();
    await h.scheduler.start();
    await h.scheduler.start();
    expect(h.clock.pending).toBe(1);
  });
});
