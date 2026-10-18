/**
 * The schedule procedures under the root of a host (roadmap R33, tracker item O36). No input names
 * a file: the store of the host holds the schedules, also a file store outside the root. So the
 * root confines `schedule.add`, `schedule.list` and `schedule.remove` with no path to examine, and
 * `schedule.next` reaches no file. Without a root, nothing changes.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRegistry, invokePath, outputValue, type ProcedureRegistry } from "@procedures/client";
import { confineToRoot, rootDecisionOf } from "@procedures/fs/module";
import { createScheduleModule, scheduleModule } from "./module.js";
import { FileScheduleStore } from "./store.js";
import type { ScheduleListOutput } from "./types.js";

let base: string;
let root: string;

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), "schedule-host-root-"));
  root = join(base, "root");
  mkdirSync(root);
});

afterEach(() => {
  rmSync(base, { recursive: true, force: true });
});

/** A registry with a file store of the host outside the root, and a stored program. */
async function registryWithStore(withRoot: boolean): Promise<ProcedureRegistry> {
  const registry = createRegistry(createScheduleModule({ store: new FileScheduleStore(join(base, "host", "schedules.json")) }));
  await invokePath(["procedure", "define"], { path: ["jobs", "ping"], aggregation: { $proc: ["client", "identity"], input: { value: 1 } } }, { registry });
  if (withRoot) confineToRoot(registry, root);
  return registry;
}

describe("the schedule procedures under the root of a host", () => {
  it("are confined with no path input, except schedule.next, which reaches no file", () => {
    const kinds = Object.fromEntries(scheduleModule.procedures.filter((p) => p.path[0] === "schedule").map((p) => [p.path.join("."), rootDecisionOf(p).kind]));
    expect(kinds).toEqual({ "schedule.add": "confined", "schedule.list": "confined", "schedule.remove": "confined", "schedule.next": "unchanged" });
    for (const procedure of scheduleModule.procedures.filter((p) => p.path[0] === "schedule" && p.path[1] !== "next")) {
      expect(procedure.metadata.fsRoot).toEqual({});
    }
  });

  it("add, list and remove a schedule in the store of the host, with a root and without one", async () => {
    for (const withRoot of [true, false]) {
      const registry = await registryWithStore(withRoot);
      const call = async <T>(key: string, input: unknown): Promise<T> => outputValue(await invokePath<T>(key.split("."), input, { registry }));
      await call("schedule.add", { cron: "@hourly", program: "jobs.ping", replace: true });
      expect((await call<ScheduleListOutput>("schedule.list", {})).schedules.map((schedule) => schedule.id)).toEqual(["jobs.ping"]);
      expect(await call("schedule.remove", { id: "jobs.ping" })).toEqual({ removed: true });
      expect(existsSync(join(base, "host", "schedules.json"))).toBe(true);
    }
  });
});
