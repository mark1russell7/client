/**
 * The procedures of the program store under the root of a host (roadmap R33, tracker item O36).
 * No input names a file: the store of the host holds the programs, also a file store outside the
 * root. So the root confines `procedure.store`, `procedure.load` and `procedure.sync` with no path
 * to examine. A loaded program is data-driven, and its nested calls get their own rules. Without
 * a root, nothing changes.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { allCoreProcedures, invokePath, metaProcedures, outputValue, ProcedureRegistry } from "@procedures/client";
import { confineToRoot, rootDecisionOf } from "@procedures/fs/module";
import { programStoreProcedures } from "./program-store/procedures.js";
import { attachProgramStore } from "./program-store/attach.js";
import { FileProgramStore } from "./program-store/file.js";

let base: string;
let root: string;

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), "store-host-root-"));
  root = join(base, "root");
  mkdirSync(root);
});

afterEach(() => {
  rmSync(base, { recursive: true, force: true });
});

/** A registry with the core, the meta-procedures and the store procedures, and a file store of the host outside the root. */
function startProcess(withRoot: boolean): ProcedureRegistry {
  const registry = new ProcedureRegistry();
  for (const procedure of [...allCoreProcedures, ...metaProcedures, ...programStoreProcedures]) registry.register(procedure);
  attachProgramStore(registry, new FileProgramStore(join(base, "host", "programs.json")));
  if (withRoot) confineToRoot(registry, root);
  return registry;
}

describe("the program store procedures under the root of a host", () => {
  it("confine store, load and sync with no path input, and leave remote as it is", () => {
    const kinds = Object.fromEntries(programStoreProcedures.map((procedure) => [procedure.path.join("."), rootDecisionOf(procedure).kind]));
    expect(kinds).toEqual({ "procedure.store": "confined", "procedure.load": "confined", "procedure.sync": "confined", "procedure.remote": "unchanged" });
    for (const procedure of programStoreProcedures.filter((p) => p.path[1] !== "remote")) expect(procedure.metadata.fsRoot).toEqual({});
  });

  it("store a program and load it again in the store of the host, with a root and without one", async () => {
    for (const withRoot of [true, false]) {
      const first = startProcess(withRoot);
      const call = async <T>(registry: ProcedureRegistry, key: string, input: unknown): Promise<T> =>
        outputValue(await invokePath<T>(key.split("."), input, { registry }));
      await call(first, "procedure.define", { path: ["math", "addTen"], aggregation: { $proc: ["client", "add"], input: { a: { $ref: "input.x" }, b: 10 } } });
      expect(await call(first, "procedure.store", { path: "math.addTen" })).toMatchObject({ stored: true });
      expect(existsSync(join(base, "host", "programs.json"))).toBe(true);
      const second = startProcess(withRoot);
      expect(await call(second, "procedure.load", { all: true })).toMatchObject({ loaded: 1 });
      expect(await call(second, "math.addTen", { x: 5 })).toBe(15);
      rmSync(join(base, "host"), { recursive: true, force: true });
    }
  });
});
