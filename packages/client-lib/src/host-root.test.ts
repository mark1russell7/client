/**
 * The lib procedures under the root of a host (roadmap R33): `rootPath` must be in the root, and
 * without it the workspace is the root. The files of the workspace go through the confined
 * `fs.*`, and the nested git calls stay in the root. `lib.new` starts the cue program of the
 * workspace, so a root refuses it.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRegistry, invokePath, outputValue, type ProcedureRegistry } from "@procedures/client";
import { confineToRoot, rootDecisionOf } from "@procedures/fs/module";
import { libModule } from "./module.js";
import type { LibNewOutput, LibScanOutput } from "./types.js";

let base: string;
let root: string;
let outside: string;
let registry: ProcedureRegistry;

/** A small pnpm workspace with one package. */
function workspace(folder: string, name: string): void {
  mkdirSync(join(folder, "packages", name), { recursive: true });
  writeFileSync(join(folder, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n");
  writeFileSync(join(folder, "packages", name, "package.json"), JSON.stringify({ name }));
}

async function call<T>(key: string, input: unknown, at: ProcedureRegistry = registry): Promise<T> {
  return outputValue(await invokePath<T>(key.split("."), input, { registry: at }));
}

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), "lib-host-root-"));
  root = join(base, "root");
  outside = join(base, "outside");
  workspace(root, "inside-package");
  workspace(outside, "outside-package");
  registry = createRegistry(libModule);
  confineToRoot(registry, root);
});

afterEach(() => {
  rmSync(base, { recursive: true, force: true });
});

describe("the lib procedures under the root of a host", () => {
  it("are confined, except lib.new", () => {
    const kinds = Object.fromEntries(libModule.procedures.filter((p) => p.path[0] === "lib").map((p) => [p.path.join("."), rootDecisionOf(p).kind]));
    expect(kinds).toEqual({ "lib.scan": "confined", "lib.rename": "confined", "lib.new": "refused", "lib.audit": "confined", "lib.graph": "confined", "lib.importCycles": "confined" });
  });

  it("scan the workspace in the root, also without rootPath, with its nested git calls in the root", async () => {
    for (const input of [{ rootPath: root }, {}]) {
      const scanned = await call<LibScanOutput>("lib.scan", input);
      expect(Object.keys(scanned.packages)).toEqual(["inside-package"]);
      // Git finds no repository above the root
      expect(scanned.warnings.map((warning) => warning.issue).join(" ")).toMatch(/not a git repository/i);
    }
    // A repository in the root gives its branch
    execFileSync("git", ["init", "-q", "--initial-branch=main"], { cwd: root, stdio: "ignore" });
    const scanned = await call<LibScanOutput>("lib.scan", {});
    expect(scanned.packages["inside-package"]?.currentBranch).toBe("main");
  });

  it("refuse a workspace outside the root, and lib.new", async () => {
    await expect(call("lib.scan", { rootPath: outside })).rejects.toMatchObject({ code: "FORBIDDEN", reason: "outside-root" });
    await expect(call("lib.graph", { rootPath: "../outside" })).rejects.toMatchObject({ code: "FORBIDDEN", reason: "outside-root" });
    await expect(call("lib.importCycles", { path: outside })).rejects.toMatchObject({ code: "FORBIDDEN", reason: "outside-root" });
    await expect(call("lib.new", { name: "x", rootPath: root, dryRun: true })).rejects.toMatchObject({ code: "FORBIDDEN", reason: "outside-root" });
  });

  it("work on each workspace without a root", async () => {
    const plain = createRegistry(libModule);
    const scanned = await call<LibScanOutput>("lib.scan", { rootPath: outside }, plain);
    expect(Object.keys(scanned.packages)).toEqual(["outside-package"]);
    const preview = await call<LibNewOutput>("lib.new", { name: "x", rootPath: outside, dryRun: true }, plain);
    expect(preview.success).toBe(true);
  });
});
