/**
 * `procedure.new` under the root of a host (roadmap R33): the project folder (`path`) must be in
 * the root, and without it the project is the root. The files go through the confined `fs.*`.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRegistry, invokePath, outputValue, type ProcedureRegistry } from "@procedures/client";
import { confineToRoot, createFsModule, rootDecisionOf } from "@procedures/fs/module";
import { procedureModule } from "./module.js";
import type { ProcedureNewOutput } from "./types.js";

let base: string;
let root: string;
let outside: string;
let registry: ProcedureRegistry;

async function call<T>(key: string, input: unknown, at: ProcedureRegistry = registry): Promise<T> {
  return outputValue(await invokePath<T>(key.split("."), input, { registry: at }));
}

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), "procedure-host-root-"));
  root = join(base, "root");
  outside = join(base, "outside");
  mkdirSync(join(root, "pkg"), { recursive: true });
  mkdirSync(outside);
  registry = createRegistry(createFsModule(), procedureModule);
  confineToRoot(registry, root);
});

afterEach(() => {
  rmSync(base, { recursive: true, force: true });
});

describe("procedure.new under the root of a host", () => {
  it("is a confined procedure", () => {
    expect(rootDecisionOf(procedureModule.procedures.find((p) => p.path.join(".") === "procedure.new")!).kind).toBe("confined");
  });

  it("makes the files of a procedure in a project of the root", async () => {
    const made = await call<ProcedureNewOutput>("procedure.new", { name: "demo.hello", path: "pkg" });
    expect(made.errors).toEqual([]);
    expect(made.success).toBe(true);
    expect(existsSync(join(root, "pkg", "src", "procedures", "demo", "hello.ts"))).toBe(true);
  });

  it("refuses a project outside the root, and writes nothing there", async () => {
    await expect(call("procedure.new", { name: "demo.hello", path: outside })).rejects.toMatchObject({ code: "FORBIDDEN", reason: "outside-root" });
    await expect(call("procedure.new", { name: "demo.hello", path: "../outside" })).rejects.toMatchObject({ code: "FORBIDDEN", reason: "outside-root" });
    expect(readdirSync(outside)).toEqual([]);
  });

  it("makes the files in a project outside the folder without a root", async () => {
    const plain = createRegistry(createFsModule(), procedureModule);
    const made = await call<ProcedureNewOutput>("procedure.new", { name: "demo.hello", path: outside }, plain);
    expect(made.success).toBe(true);
    expect(existsSync(join(outside, "src", "procedures", "demo", "hello.ts"))).toBe(true);
  });
});
