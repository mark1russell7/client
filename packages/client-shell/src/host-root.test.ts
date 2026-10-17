/**
 * The shell procedures under the root of a host (roadmap R33). `shell.run` and `shell.stream`
 * start the program of their input, so a root refuses a call of a client. The nested call of a
 * confined procedure that names `shell.run` runs, with a working folder in the root.
 * `shell.exec` and `shell.which` are refused. The program of the tests is Node itself.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createRegistry,
  defineModule,
  defineProcedure,
  invokePath,
  outputSchema,
  outputValue,
  type ProcedureContext,
  type ProcedureRegistry,
} from "@procedures/client";
import { confineToRoot, rootDecisionOf } from "@procedures/fs/module";
import { shellModule } from "./module.js";
import type { ShellRunOutput } from "./types.js";

/** A program that writes its working folder. */
const PRINT_CWD = { command: process.execPath, args: ["-e", "process.stdout.write(process.cwd())"] };

/** A confined procedure that runs the program in its working folder through shell.run. */
const tool = defineProcedure({
  path: ["test", "tool"],
  input: outputSchema<{ cwd?: string }>(),
  output: outputSchema<ShellRunOutput>(),
  metadata: { calls: ["shell.run"], effects: { reads: ["fs"], writes: [] }, fsRoot: { cwd: "cwd" } },
  handler: (input: { cwd?: string }, ctx: ProcedureContext) => ctx.client.call<unknown, ShellRunOutput>(["shell", "run"], { ...PRINT_CWD, cwd: input.cwd }),
});

let base: string;
let root: string;
let registry: ProcedureRegistry;

async function call<T>(key: string, input: unknown, at: ProcedureRegistry = registry): Promise<T> {
  return outputValue(await invokePath<T>(key.split("."), input, { registry: at }));
}

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), "shell-host-root-"));
  root = join(base, "root");
  mkdirSync(join(root, "sub"), { recursive: true });
  registry = createRegistry(shellModule, defineModule("test", [tool]));
  confineToRoot(registry, root);
});

afterEach(() => {
  rmSync(base, { recursive: true, force: true });
});

describe("the shell procedures under the root of a host", () => {
  it("are program procedures or refused", () => {
    expect(Object.fromEntries(shellModule.procedures.map((procedure) => [procedure.path.join("."), rootDecisionOf(procedure).kind]))).toEqual({
      "shell.run": "program",
      "shell.exec": "refused",
      "shell.which": "refused",
      "shell.stream": "program",
    });
  });

  it("refuse a call of a client", async () => {
    for (const key of ["shell.run", "shell.stream", "shell.exec", "shell.which"]) {
      await expect(call(key, { command: process.execPath, args: ["--version"] }), key).rejects.toMatchObject({ code: "FORBIDDEN", reason: "outside-root" });
    }
  });

  it("run the nested call of a confined procedure that names shell.run, in a folder of the root", async () => {
    const inRoot = await call<ShellRunOutput>("test.tool", {});
    expect(inRoot.exitCode).toBe(0);
    expect(realpathSync(inRoot.stdout)).toBe(realpathSync(root));
    const inSub = await call<ShellRunOutput>("test.tool", { cwd: "sub" });
    expect(realpathSync(inSub.stdout)).toBe(realpathSync(join(root, "sub")));
    await expect(call("test.tool", { cwd: base })).rejects.toMatchObject({ code: "FORBIDDEN", reason: "outside-root" });
  });

  it("run a call of a client without a root", async () => {
    const plain = createRegistry(shellModule);
    const result = await call<ShellRunOutput>("shell.run", { ...PRINT_CWD, cwd: base }, plain);
    expect(realpathSync(result.stdout)).toBe(realpathSync(base));
  });
});
