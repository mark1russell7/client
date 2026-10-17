/**
 * The archive procedures under the root of a host (roadmap R33): `confineToRoot()` of
 * `@procedures/fs` reads `metadata.fsRoot` of each procedure. The root examines the archive, the
 * source, the base folder, each file and the target. `root.test.ts` tests the root of the module
 * (`createArchiveModule({ root })`), which has the same rules.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRegistry, invokePath, outputValue, type ProcedureRegistry } from "@procedures/client";
import { confineToRoot, rootDecisionOf } from "@procedures/fs/module";
import { archiveModule } from "./module.js";
import { OUTSIDE_ROOT } from "./root.js";
import type { ArchiveCreateOutput, ArchiveExtractOutput, ArchiveListOutput } from "./types.js";

let base: string;
let root: string;
let outside: string;
let registry: ProcedureRegistry;

async function call<T>(key: string, input: unknown, at: ProcedureRegistry = registry): Promise<T> {
  const path = key.split(".");
  return outputValue(await invokePath<T>(path, input, { registry: at }), path);
}

async function refused(key: string, input: unknown): Promise<void> {
  await expect(call(key, input), `${key} ${JSON.stringify(input)}`).rejects.toMatchObject({ code: "FORBIDDEN", reason: OUTSIDE_ROOT });
}

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), "archive-host-root-"));
  root = join(base, "root");
  outside = join(base, "outside");
  mkdirSync(join(root, "sub"), { recursive: true });
  mkdirSync(join(outside, "folder"), { recursive: true });
  writeFileSync(join(root, "sub", "a.txt"), "alpha");
  writeFileSync(join(outside, "folder", "secret.txt"), "secret");
  registry = createRegistry(archiveModule);
  confineToRoot(registry, root);
});

afterEach(() => {
  rmSync(base, { recursive: true, force: true });
});

describe("the archive procedures under the root of a host", () => {
  it("are confined procedures", () => {
    expect(archiveModule.procedures.map((procedure) => [procedure.path.join("."), rootDecisionOf(procedure).kind])).toEqual([
      ["archive.create", "confined"],
      ["archive.extract", "confined"],
      ["archive.list", "confined"],
    ]);
  });

  it("make, list and extract an archive in the root, with relative paths that start at the root", async () => {
    const made = await call<ArchiveCreateOutput>("archive.create", { output: "out.zip", source: "sub" });
    expect(made.path).toBe(join(root, "out.zip"));
    const files = await call<ArchiveCreateOutput>("archive.create", { output: "files.tar.gz", cwd: "sub", files: ["a.txt"] });
    expect(files.entries).toBe(1);
    const listed = await call<ArchiveListOutput>("archive.list", { archive: "out.zip" });
    expect(listed.entries.map((entry) => entry.path)).toEqual(["a.txt"]);
    const extracted = await call<ArchiveExtractOutput>("archive.extract", { archive: "files.tar.gz", target: "x" });
    expect(extracted.target).toBe(join(root, "x"));
    expect(existsSync(join(root, "x", "a.txt"))).toBe(true);
  });

  it("refuse each path outside the root, and write nothing outside", async () => {
    const before = readdirSync(outside).sort();
    await refused("archive.create", { output: join(outside, "out.zip"), source: "sub" });
    await refused("archive.create", { output: "out.zip", source: join(outside, "folder") });
    await refused("archive.create", { output: "out.zip", cwd: "../outside/folder", files: ["secret.txt"] });
    await refused("archive.create", { output: "out.zip", cwd: "sub", files: ["../../outside/folder/secret.txt"] });
    await refused("archive.list", { archive: join(outside, "x.zip") });
    await refused("archive.extract", { archive: "in.zip", target: join(outside, "x") });
    expect(readdirSync(outside).sort()).toEqual(before);
    expect(existsSync(join(root, "out.zip"))).toBe(false);
  });

  it("refuse a file through a linked folder that leads out of the root", async () => {
    symlinkSync(join(outside, "folder"), join(root, "link"), process.platform === "win32" ? "junction" : "dir");
    await refused("archive.create", { output: "out.zip", files: ["link/secret.txt"] });
    await refused("archive.create", { output: "out.zip", source: "link" });
  });

  it("work on each path without a root", async () => {
    const plain = createRegistry(archiveModule);
    const made = await call<ArchiveCreateOutput>("archive.create", { output: join(outside, "out.zip"), source: join(outside, "folder") }, plain);
    expect(made.path).toBe(join(outside, "out.zip"));
    expect((await call<ArchiveListOutput>("archive.list", { archive: made.path }, plain)).entries).toHaveLength(1);
  });
});
