/**
 * `mark --fs-root <folder>` (roadmap R33): the registry of mark confines each path of the `fs.*`
 * procedures to the root, also the nested `fs.*` calls of the other procedures (`lib.scan`).
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
    const refused = await outputValue(
      await invokePath<{ packages: Record<string, unknown>; warnings: Array<{ issue: string }> }>(["lib", "scan"], { rootPath: outside }, { registry }),
    );
    expect(refused.packages).toEqual({});
    expect(refused.warnings[0]?.issue).toContain("outside the root");
  });

  it("keeps the procedures of the registry without a root", async () => {
    const [plain, rooted] = await Promise.all([loadEcosystemRegistry(false, false), loadEcosystemRegistry(false, false, { fsRoot: root })]);
    const keys = (procedures: ReadonlyArray<{ path: readonly string[] }>) => procedures.map((procedure) => procedure.path.join(".")).sort();
    expect(keys(rooted.registry.getAll())).toEqual(keys(plain.registry.getAll()));
    expect(plain.fsRoot).toBeUndefined();
  });

  it("gives the root to the context of initCli, and refuses a root that does not exist", async () => {
    const ctx = await initCli(false, root);
    expect(ctx.fsRoot).toBe(root);
    await expect(ctx.client.call({ service: "fs", operation: "read" }, { path: join(outside, "pnpm-workspace.yaml") })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(loadEcosystemRegistry(false, false, { fsRoot: join(base, "missing") })).rejects.toThrow("does not exist");
  });
});
