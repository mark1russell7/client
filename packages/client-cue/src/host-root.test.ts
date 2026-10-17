/**
 * The cue procedures under the root of a host (roadmap R33): the folder of the project must be in
 * the root, and without `cwd` it is the root. The files of the project go through the confined
 * `fs.*`. The files of the installed cue package are read directly, so the tools work in a root.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRegistry, invokePath, outputValue, type ProcedureRegistry } from "@procedures/client";
import { confineToRoot, rootDecisionOf } from "@procedures/fs/module";
import { cueModule } from "./module.js";
import { installedFileExists, loadFeatures, packageRoot } from "./shared.js";
import type { CueGenerateOutput, CueInitOutput, CueValidateOutput } from "./types.js";

let base: string;
let root: string;
let outside: string;
let registry: ProcedureRegistry;

async function call<T>(key: string, input: unknown, at: ProcedureRegistry = registry): Promise<T> {
  return outputValue(await invokePath<T>(key.split("."), input, { registry: at }));
}

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), "cue-host-root-"));
  root = join(base, "root");
  outside = join(base, "outside");
  mkdirSync(join(root, "project"), { recursive: true });
  mkdirSync(outside);
  registry = createRegistry(cueModule);
  confineToRoot(registry, root);
});

afterEach(() => {
  rmSync(base, { recursive: true, force: true });
});

describe("the cue procedures under the root of a host", () => {
  it("are confined procedures", () => {
    expect([...new Set(cueModule.procedures.map((procedure) => rootDecisionOf(procedure).kind))]).toEqual(["confined"]);
  });

  it("work on a project in the root, with the root as the default folder", async () => {
    const init = await call<CueInitOutput>("cue.init", { cwd: "project", preset: "lib" });
    expect(init.success).toBe(true);
    expect(existsSync(join(root, "project", "dependencies.json"))).toBe(true);
    const valid = await call<CueValidateOutput>("cue.validate", { cwd: join(root, "project") });
    expect(valid.success).toBe(true);
    // Without cwd, the folder is the root, not the working folder of the process
    const empty = await call<CueValidateOutput>("cue.validate", {});
    expect(empty.errors).toEqual(["No dependencies.json found. Run cue.init first."]);
    // generate runs the cue program in the installed package, or says that cue is missing
    const generated = await call<CueGenerateOutput>("cue.generate", { cwd: "project" });
    if (!generated.success) expect(generated.error).toMatch(/CUE is not installed|cue eval failed/);
  }, 60_000);

  it("refuse a project outside the root, and write nothing there", async () => {
    for (const key of ["cue.init", "cue.add", "cue.remove", "cue.generate", "cue.validate"]) {
      await expect(call(key, { cwd: outside, feature: "node" }), key).rejects.toMatchObject({ code: "FORBIDDEN", reason: "outside-root" });
    }
    await expect(call("cue.init", { cwd: "../outside" })).rejects.toMatchObject({ code: "FORBIDDEN", reason: "outside-root" });
    expect(readdirSync(outside)).toEqual([]);
  });

  it("read the files of the installed cue package directly, not through fs.*", async () => {
    expect(await installedFileExists(join(packageRoot, "features.json"))).toBe(true);
    expect(await installedFileExists(join(packageRoot, "no-such-file.json"))).toBe(false);
    expect((await loadFeatures())?.features).toBeDefined();
    // A folder without features.json gives null, text that is not JSON throws, and a folder in
    // the place of the file throws its own error
    expect(await loadFeatures(undefined, outside)).toBeNull();
    writeFileSync(join(outside, "features.json"), "{ not json");
    await expect(loadFeatures(undefined, outside)).rejects.toThrow("is not valid JSON");
    rmSync(join(outside, "features.json"));
    mkdirSync(join(outside, "features.json"));
    await expect(loadFeatures(undefined, outside)).rejects.toMatchObject({ code: "EISDIR" });
  });

  it("work on a project outside the folder without a root", async () => {
    const init = await call<CueInitOutput>("cue.init", { cwd: outside, preset: "lib" }, createRegistry(cueModule));
    expect(init.success).toBe(true);
    expect(existsSync(join(outside, "dependencies.json"))).toBe(true);
  });
});
