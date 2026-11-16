/**
 * pnpm runs without a shell (deep dive WRP-5).
 */

import { describe, it, expect, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ProcedureContext } from "@procedures/client";
import { fakeShell, type FakeShellInput } from "@procedures/shell/testing";
import { pnpmAdd } from "./add.js";
import { pnpmRun } from "./run.js";
import { installedPnpmVersion, resolvePnpm } from "./shared.js";

const savedExecPath = process.env["npm_execpath"];
afterEach(() => {
  if (savedExecPath === undefined) delete process.env["npm_execpath"];
  else process.env["npm_execpath"] = savedExecPath;
});

/** A context whose shell.run records its input, with pnpm resolved to a fake script. */
function setup(): { ctx: ProcedureContext; calls: FakeShellInput[]; script: string } {
  const script = join(mkdtempSync(join(tmpdir(), "pnpm-")), "pnpm.cjs");
  writeFileSync(script, "");
  process.env["npm_execpath"] = script;
  const shell = fakeShell();
  return { ctx: { client: shell.client } as unknown as ProcedureContext, calls: shell.calls, script };
}

describe("pnpm procedures", () => {
  it("pass a hostile package name as one argument to shell.run", async () => {
    const { ctx, calls, script } = setup();
    await pnpmAdd({ packages: ["lodash & echo marker"], dev: true } as never, ctx);
    const input = calls[0]!;
    expect(input.command).toBe(process.execPath);
    expect(input.args).toEqual([script, "add", "lodash & echo marker", "--save-dev"]);
  });

  it("reject a package or a script that pnpm would read as an option", async () => {
    const { ctx, calls } = setup();
    await expect(pnpmAdd({ packages: ["--global"] } as never, ctx)).rejects.toThrow("starts with");
    await expect(pnpmRun({ script: "--help" } as never, ctx)).rejects.toThrow("starts with");
    expect(calls).toEqual([]);
  });

  it("resolve pnpm from npm_execpath", () => {
    const { script } = setup();
    expect(resolvePnpm()).toEqual({ command: process.execPath, prefix: [script] });
  });

  it("resolve pnpm from npm_execpath when it is the executable of pnpm 12", () => {
    const folder = mkdtempSync(join(tmpdir(), "pnpm-"));
    for (const name of ["pnpm.exe", "pnpm"]) {
      const executable = join(folder, name);
      writeFileSync(executable, "");
      process.env["npm_execpath"] = executable;
      expect(resolvePnpm()).toEqual({ command: executable, prefix: [] });
    }
  });
});

/** This function makes a package folder with a package.json and an empty program file, and gives the program. */
function pnpmPackage(name: string, version: string, program: string): string {
  const folder = mkdtempSync(join(tmpdir(), "pnpm-version-"));
  writeFileSync(join(folder, "package.json"), JSON.stringify({ name, version }));
  const file = join(folder, program);
  mkdirSync(join(file, ".."), { recursive: true });
  writeFileSync(file, "");
  return file;
}

describe("installedPnpmVersion", () => {
  it("reads the version of the package of pnpm.cjs, one folder above the script", () => {
    process.env["npm_execpath"] = pnpmPackage("pnpm", "10.26.0", join("bin", "pnpm.cjs"));
    expect(installedPnpmVersion()).toBe("10.26.0");
  });

  it("reads the version of the package that holds the executable of pnpm 12", () => {
    process.env["npm_execpath"] = pnpmPackage("pnpm", "12.20.0", "pnpm.exe");
    expect(installedPnpmVersion()).toBe("12.20.0");
    process.env["npm_execpath"] = pnpmPackage("@pnpm/exe.win32-x64", "12.20.1", "pnpm");
    expect(installedPnpmVersion()).toBe("12.20.1");
  });

  it("gives undefined when the package beside the program is not a pnpm package", () => {
    process.env["npm_execpath"] = pnpmPackage("corepack", "0.34.0", join("bin", "pnpm.cjs"));
    expect(installedPnpmVersion()).toBeUndefined();
  });
});
