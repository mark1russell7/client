/**
 * `mark --fs-root <folder>` (roadmap R33): the registry of mark confines each procedure to the
 * root (`confineToRoot()`): each path of `fs.*`, the nested `fs.*` calls of the other procedures
 * and their path inputs (`lib.scan`). It refuses the procedures that the root cannot confine.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { invokePath, outputValue } from "@procedures/client";
import { initCli } from "./cli.js";
import { loadEcosystemRegistry } from "./ecosystem.js";

let base: string;
let root: string;
let outside: string;

/** A small pnpm workspace with one package, for lib.scan. */
function workspace(folder: string, name: string): void {
  mkdirSync(join(folder, "packages", name), { recursive: true });
  writeFileSync(join(folder, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n");
  writeFileSync(join(folder, "packages", name, "package.json"), JSON.stringify({ name }));
}

beforeAll(() => {
  base = mkdtempSync(join(tmpdir(), "mark-fs-root-"));
  root = join(base, "root");
  outside = join(base, "outside");
  workspace(root, "inside-package");
  workspace(outside, "outside-package");
});

afterAll(() => {
  rmSync(base, { recursive: true, force: true });
});

describe("the registry of mark with a root", () => {
  it("accepts a path in the root, refuses a path outside it, and confines the nested calls of lib.scan", async () => {
    const { registry, fsRoot } = await loadEcosystemRegistry(false, false, { fsRoot: root });
    expect(fsRoot).toBe(root);
    const inside = await invokePath(["fs", "read.json"], { path: join(root, "packages", "inside-package", "package.json") }, { registry });
    expect(await outputValue(inside)).toMatchObject({ data: { name: "inside-package" } });
    await expect(
      invokePath(["fs", "read.json"], { path: join(outside, "packages", "outside-package", "package.json") }, { registry }),
    ).rejects.toMatchObject({ code: "FORBIDDEN", reason: "outside-root" });

    const scanned = await outputValue(await invokePath<{ packages: Record<string, unknown> }>(["lib", "scan"], { rootPath: root }, { registry }));
    expect(Object.keys(scanned.packages)).toEqual(["inside-package"]);
    // The root examines rootPath before lib.scan starts (metadata.fsRoot)
    await expect(invokePath(["lib", "scan"], { rootPath: outside }, { registry })).rejects.toMatchObject({ code: "FORBIDDEN", reason: "outside-root" });
  }, 120000);

  it("refuses the procedures that the root cannot confine, also for a path in the root", async () => {
    const { registry, refusedUnderRoot } = await loadEcosystemRegistry(false, false, { fsRoot: root });
    expect(refusedUnderRoot).toEqual(expect.arrayContaining(["pnpm.install", "docker.run", "shell.exec"]));
    // git is confined (tracker item O35): it finds no repository above the root
    expect(refusedUnderRoot).not.toContain("git.status");
    await expect(invokePath(["git", "status"], { cwd: root }, { registry })).rejects.toThrow(/not a git repository/i);
    await expect(invokePath(["git", "status"], { cwd: outside }, { registry })).rejects.toMatchObject({ code: "FORBIDDEN", reason: "outside-root" });
    for (const [path, input] of [
      [["shell", "run"], { command: process.execPath, args: ["--version"], cwd: root }],
      [["docker", "run"], { image: "alpine", volumes: [`${outside}:/host`] }],
    ] as const) {
      await expect(invokePath([...path], input, { registry }), path.join(".")).rejects.toMatchObject({ code: "FORBIDDEN", reason: "outside-root" });
    }
  }, 120000);

  it("keeps the procedures of the registry without a root", async () => {
    const [plain, rooted] = await Promise.all([loadEcosystemRegistry(false, false), loadEcosystemRegistry(false, false, { fsRoot: root })]);
    const keys = (procedures: ReadonlyArray<{ path: readonly string[] }>) => procedures.map((procedure) => procedure.path.join(".")).sort();
    expect(keys(rooted.registry.getAll())).toEqual(keys(plain.registry.getAll()));
    expect(plain.fsRoot).toBeUndefined();
  }, 120000);

  it("gives the root to the context of initCli, and refuses a root that does not exist", async () => {
    const ctx = await initCli(false, root);
    expect(ctx.fsRoot).toBe(root);
    await expect(ctx.client.call({ service: "fs", operation: "read" }, { path: join(outside, "pnpm-workspace.yaml") })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(loadEcosystemRegistry(false, false, { fsRoot: join(base, "missing") })).rejects.toThrow("does not exist");
  }, 120000);
});
