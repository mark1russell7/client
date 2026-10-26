/**
 * The pnpm procedures under the root of a host (roadmap R33): a root refuses each of them, also for
 * a working folder in the root. pnpm reads the workspace and the configuration above the working
 * folder, and the scripts of a project start programs. Without a root, they run as before. A
 * fake `shell.run` with the rules of the real one records the command: no pnpm runs.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRegistry, invokePath, outputValue, type ProcedureRegistry } from "@procedures/client";
import { confineToRoot, rootDecisionOf } from "@procedures/fs/module";
import { fakeShell, type FakeShell } from "@procedures/shell/testing";
import { pnpmModule } from "./module.js";
import type { PnpmJsonOutput } from "./types.js";

let base: string;
let root: string;
const savedExecPath = process.env["npm_execpath"];

/** The fake shell of each test: its shell.run records its input and writes JSON. */
let shell: FakeShell;

function registryOf(withRoot: boolean): ProcedureRegistry {
  const registry = createRegistry(shell.module, pnpmModule);
  if (withRoot) confineToRoot(registry, root);
  return registry;
}

async function call<T>(registry: ProcedureRegistry, key: string, input: unknown): Promise<T> {
  return outputValue(await invokePath<T>(key.split("."), input, { registry }));
}

beforeEach(() => {
  shell = fakeShell({ stdout: "[]" });
  base = mkdtempSync(join(tmpdir(), "pnpm-host-root-"));
  root = join(base, "root");
  mkdirSync(join(root, "app"), { recursive: true });
  // pnpm resolves to a script that does not run: the fake shell.run gets the command
  const script = join(base, "pnpm.cjs");
  writeFileSync(script, "");
  process.env["npm_execpath"] = script;
});

afterEach(() => {
  rmSync(base, { recursive: true, force: true });
  if (savedExecPath === undefined) delete process.env["npm_execpath"];
  else process.env["npm_execpath"] = savedExecPath;
});

describe("the pnpm procedures under the root of a host", () => {
  it("are all refused", () => {
    expect([...new Set(pnpmModule.procedures.map((procedure) => rootDecisionOf(procedure).kind))]).toEqual(["refused"]);
  });

  it("refuse a working folder in the root and one outside it, and start no pnpm", async () => {
    const registry = registryOf(true);
    for (const [key, input] of [
      ["pnpm.list", { cwd: join(root, "app") }],
      ["pnpm.list", { cwd: base }],
      ["pnpm.install", {}],
      ["pnpm.run", { script: "build", cwd: "app" }],
    ] as const) {
      await expect(call(registry, key, input), key).rejects.toMatchObject({ code: "FORBIDDEN", reason: "outside-root" });
    }
    expect(shell.calls).toEqual([]);
  });

  it("run without a root", async () => {
    const result = await call<PnpmJsonOutput>(registryOf(false), "pnpm.list", { cwd: join(root, "app") });
    expect(result).toMatchObject({ success: true, data: [] });
    expect(shell.calls).toEqual([expect.objectContaining({ cwd: join(root, "app") })]);
  });
});
