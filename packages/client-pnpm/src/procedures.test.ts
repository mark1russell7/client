/**
 * The procedures and options of roadmap R41: `--filter` and `--recursive`, and pnpm.exec, list,
 * why, outdated, update and pack. A fake shell.run records the argument list. One test runs the
 * real pnpm list in an empty temporary project, with no network.
 */

import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRegistry, invokePath, outputValue, type Effects, type ProcedureContext } from "@procedures/client";
import { fakeShell as sharedFakeShell } from "@procedures/shell/testing";
import { pnpmModule } from "./module.js";
import { pnpmAdd } from "./procedures/pnpm/add.js";
import { pnpmExec } from "./procedures/pnpm/exec.js";
import { pnpmInstall } from "./procedures/pnpm/install.js";
import { pnpmList } from "./procedures/pnpm/list.js";
import { pnpmOutdated } from "./procedures/pnpm/outdated.js";
import { pnpmPack } from "./procedures/pnpm/pack.js";
import { pnpmRemove } from "./procedures/pnpm/remove.js";
import { pnpmRun } from "./procedures/pnpm/run.js";
import { pnpmUpdate } from "./procedures/pnpm/update.js";
import { pnpmWhy } from "./procedures/pnpm/why.js";
import type { PnpmJsonOutput } from "./types.js";

const savedExecPath = process.env["npm_execpath"];
afterEach(() => {
  if (savedExecPath === undefined) delete process.env["npm_execpath"];
  else process.env["npm_execpath"] = savedExecPath;
});

/** A context whose shell.run gives `result` and records its input, with pnpm resolved to a fake script. */
function fakeShell(result: { exitCode: number; stdout?: string; stderr?: string } = { exitCode: 0 }) {
  const script = join(mkdtempSync(join(tmpdir(), "pnpm-")), "pnpm.cjs");
  writeFileSync(script, "");
  process.env["npm_execpath"] = script;
  const shell = sharedFakeShell(result);
  const ctx = { client: shell.client } as unknown as ProcedureContext;
  /** The arguments of pnpm in the first shell.run call (without the script of pnpm). */
  const args = (): string[] => {
    const input = shell.calls[0];
    expect(input?.command).toBe(process.execPath);
    expect(input?.args[0]).toBe(script);
    return shell.args().slice(1);
  };
  return { ctx, calls: shell.calls, args };
}

describe("--filter and --recursive", () => {
  it("go before the command of install, add, remove and run", async () => {
    const selection = { filter: ["@scope/app", "./packages/**"], recursive: true };
    const before = ["--filter=@scope/app", "--filter=./packages/**", "--recursive"];

    let shell = fakeShell();
    await pnpmInstall({ ...selection, frozen: true }, shell.ctx);
    expect(shell.args()).toEqual([...before, "install", "--frozen-lockfile"]);

    shell = fakeShell();
    await pnpmAdd({ ...selection, packages: ["zod"], dev: true }, shell.ctx);
    expect(shell.args()).toEqual([...before, "add", "zod", "--save-dev"]);

    shell = fakeShell();
    await pnpmRemove({ ...selection, packages: ["zod"] }, shell.ctx);
    expect(shell.args()).toEqual([...before, "remove", "zod"]);

    shell = fakeShell();
    await pnpmRun({ ...selection, script: "build", args: ["--watch"] }, shell.ctx);
    expect(shell.args()).toEqual([...before, "run", "build", "--", "--watch"]);
  });

  it("keep a selector that starts with - or ! as the value of --filter", async () => {
    const shell = fakeShell();
    await pnpmRun({ script: "test", filter: ["!@scope/docs", "-x"] }, shell.ctx);
    expect(shell.args()).toEqual(["--filter=!@scope/docs", "--filter=-x", "run", "test"]);
  });

  it("change nothing without a selection", async () => {
    const shell = fakeShell();
    await pnpmInstall({}, shell.ctx);
    expect(shell.args()).toEqual(["install"]);
  });
});

describe("pnpm.exec", () => {
  it("ends the options of pnpm with --, and passes each argument as it is", async () => {
    const shell = fakeShell({ exitCode: 0, stdout: "ok\n" });
    const result = await pnpmExec({ command: "tsc", args: ["--noEmit", "a & b"], filter: ["app"] }, shell.ctx);
    expect(shell.args()).toEqual(["--filter=app", "exec", "--", "tsc", "--noEmit", "a & b"]);
    expect(result).toMatchObject({ success: true, stdout: "ok\n" });
  });

  it("refuses a command that starts with -", async () => {
    const shell = fakeShell();
    await expect(pnpmExec({ command: "--shell-mode" }, shell.ctx)).rejects.toThrow("starts with");
    expect(shell.calls).toEqual([]);
  });
});

describe("pnpm.list and pnpm.why", () => {
  it("list asks for JSON, and gives the parsed output as data", async () => {
    const shell = fakeShell({ exitCode: 0, stdout: '[{"name":"app","dependencies":{}}]\n' });
    const result = await pnpmList({ depth: 1, prod: true, packages: ["zod"], recursive: true }, shell.ctx);
    expect(shell.args()).toEqual(["--recursive", "list", "--json", "--depth", "1", "--prod", "zod"]);
    expect(result.data).toEqual([{ name: "app", dependencies: {} }]);
  });

  it("list gives no data for output that is not JSON, and reports the failure", async () => {
    const shell = fakeShell({ exitCode: 1, stdout: "ERR_PNPM_SOMETHING\n", stderr: "failed" });
    const result = await pnpmList({}, shell.ctx);
    expect(result).toMatchObject({ success: false, exitCode: 1, stderr: "failed" });
    expect(result.data).toBeUndefined();
  });

  it("why names the packages after the options, and refuses a package that starts with -", async () => {
    const shell = fakeShell({ exitCode: 0, stdout: "[]" });
    const result = await pnpmWhy({ packages: ["zod", "@types/*"], dev: true }, shell.ctx);
    expect(shell.args()).toEqual(["why", "--json", "--dev", "zod", "@types/*"]);
    expect(result.data).toEqual([]);
    await expect(pnpmWhy({ packages: ["--global"] }, fakeShell().ctx)).rejects.toThrow("starts with");
  });
});

describe("pnpm.outdated", () => {
  it("asks for JSON, and counts exit code 1 with a list as success", async () => {
    const outdated = '{"zod":{"current":"4.0.0","latest":"4.6.5","wanted":"4.6.5"}}';
    const shell = fakeShell({ exitCode: 1, stdout: outdated });
    const result = await pnpmOutdated({ packages: ["zod"], prod: true }, shell.ctx);
    expect(shell.args()).toEqual(["outdated", "--format", "json", "--prod", "zod"]);
    expect(result).toMatchObject({ exitCode: 1, success: true, data: JSON.parse(outdated) });
  });

  it("reports a failure without JSON", async () => {
    const shell = fakeShell({ exitCode: 1, stdout: "", stderr: "ERR_PNPM_META_FETCH_FAIL" });
    expect(await pnpmOutdated({}, shell.ctx)).toMatchObject({ success: false, stderr: "ERR_PNPM_META_FETCH_FAIL" });
  });
});

describe("pnpm.update and pnpm.pack", () => {
  it("update passes latest, the kind and the packages", async () => {
    const shell = fakeShell();
    await pnpmUpdate({ packages: ["vitest"], latest: true, dev: true, filter: ["app"] }, shell.ctx);
    expect(shell.args()).toEqual(["--filter=app", "update", "--latest", "--dev", "vitest"]);
  });

  it("pack asks for JSON, and passes the dry run and the folder of the tarball", async () => {
    const packed = { name: "app", version: "1.0.0", filename: "app-1.0.0.tgz", files: [{ path: "package.json" }] };
    const shell = fakeShell({ exitCode: 0, stdout: JSON.stringify(packed) });
    const result = await pnpmPack({ dryRun: true, destination: "-out" }, shell.ctx);
    expect(shell.args()).toEqual(["pack", "--json", "--dry-run", "--pack-destination=-out"]);
    expect(result.data).toEqual(packed);
  });
});

describe("the module", () => {
  const READS: Effects = { reads: ["fs"], writes: [] };
  const INSTALLS: Effects = { reads: ["fs", "network"], writes: ["fs", "process"] };

  it("declares the effects of each procedure", () => {
    const declared = Object.fromEntries(pnpmModule.procedures.map((procedure) => [procedure.path.join("."), procedure.metadata.effects]));
    expect(declared).toEqual({
      "pnpm.install": INSTALLS,
      "pnpm.add": INSTALLS,
      "pnpm.remove": INSTALLS,
      "pnpm.link": INSTALLS,
      "pnpm.run": { reads: ["fs"], writes: ["process"] },
      "pnpm.store.path": READS,
      "pnpm.exec": { reads: ["fs"], writes: ["process"] },
      "pnpm.list": READS,
      "pnpm.why": READS,
      "pnpm.outdated": { reads: ["fs", "network"], writes: [] },
      "pnpm.update": INSTALLS,
      "pnpm.pack": { reads: ["fs"], writes: ["fs", "process"] },
    });
  });

  it("validates the input of a call", async () => {
    const registry = createRegistry(pnpmModule);
    await expect(invokePath(["pnpm", "why"], { packages: [] }, { registry })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(invokePath(["pnpm", "list"], { depth: -1 }, { registry })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(invokePath(["pnpm", "run"], { script: "x", filter: "app" }, { registry })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("runs the real pnpm list in an empty project", async () => {
    const project = mkdtempSync(join(tmpdir(), "pnpm-list-"));
    try {
      writeFileSync(join(project, "package.json"), JSON.stringify({ name: "empty-project", version: "1.0.0" }));
      const registry = createRegistry(pnpmModule);
      const result = await outputValue(await invokePath<PnpmJsonOutput>(["pnpm", "list"], { cwd: project, timeout: 60_000 }, { registry }), ["pnpm", "list"]);
      expect(result.success, result.stderr).toBe(true);
      expect(result.data).toEqual([expect.objectContaining({ name: "empty-project", version: "1.0.0" })]);
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  }, 90_000);
});
