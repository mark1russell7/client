/**
 * pnpm runs without a shell (deep dive WRP-5).
 */

import { describe, it, expect, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import type { ProcedureContext } from "@procedures/client";
import { fakeShell, type FakeShellInput } from "@procedures/shell/testing";
import { pnpmAdd } from "./add.js";
import { pnpmRun } from "./run.js";
import { installedPnpmVersion, resolvePnpm } from "./shared.js";

const savedExecPath = process.env["npm_execpath"];
const savedPath = process.env["PATH"];
const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
afterEach(() => {
  if (savedExecPath === undefined) delete process.env["npm_execpath"];
  else process.env["npm_execpath"] = savedExecPath;
  process.env["PATH"] = savedPath;
  Object.defineProperty(process, "platform", platform);
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
    const folder = mkdtempSync(join(tmpdir(), "pnpm-version-"));
    writeFileSync(join(folder, "package.json"), "{");
    process.env["npm_execpath"] = join(folder, "pnpm");
    writeFileSync(join(folder, "pnpm"), "");
    expect(installedPnpmVersion()).toBeUndefined();
  });

  it("reads the version of the target of a global shim of pnpm 12", () => {
    const target = pnpmPackage("pnpm", "12.18.0", "pnpm");
    for (const [name, encoding] of [["pnpm", "utf8"], ["pnpm.exe", "utf16le"]] as const) {
      const bin = shimFolder();
      writeFileSync(join(bin, name), "the executable of pnpm");
      writeFileSync(join(bin, ".pnpm-shim-v1-pnpm-target"), Buffer.from(target, encoding));
      process.env["npm_execpath"] = join(bin, name);
      expect(installedPnpmVersion()).toBe("12.18.0");
    }
  });

  it("reads the version of the target of a shell shim, relative to the folder of the shim", () => {
    const target = pnpmPackage("@pnpm/exe.linux-x64", "12.18.1", "pnpm");
    const bin = shimFolder();
    writeFileSync(join(bin, "pnpm"), `#!/bin/sh\nexec "$basedir/.pnpm-shim-v1" --shim pnpm "$0" -- "$@"\n# cmd-shim-target=${relative(bin, target)}\n`);
    process.env["npm_execpath"] = join(bin, "pnpm");
    expect(installedPnpmVersion()).toBe("12.18.1");
  });

  it("gives undefined for a shim with no installed program", () => {
    const sidecar = (bin: string): string => join(bin, ".pnpm-shim-v1-pnpm-target");
    const cases: ((bin: string) => void)[] = [
      (bin) => writeFileSync(sidecar(bin), "pkg:pnpm"),
      (bin) => writeFileSync(sidecar(bin), ""),
      (bin) => writeFileSync(sidecar(bin), join(bin, "missing", "pnpm")),
      (bin) => mkdirSync(sidecar(bin)),
      (bin) => writeFileSync(join(bin, "pnpm"), "#!/bin/sh\nexec pnpm\n"),
      (bin) => writeFileSync(join(bin, "pnpm"), "# cmd-shim-target=x\n".repeat(4000)),
    ];
    for (const write of cases) {
      const bin = shimFolder();
      writeFileSync(join(bin, "pnpm"), "the executable of pnpm");
      write(bin);
      process.env["npm_execpath"] = join(bin, "pnpm");
      expect(installedPnpmVersion()).toBeUndefined();
    }
  });

  it("finds a pnpm by its name in PATH, and gives undefined when PATH has no pnpm", () => {
    delete process.env["npm_execpath"];
    Object.defineProperty(process, "platform", { ...platform, value: "linux" });
    const bin = shimFolder();
    writeFileSync(join(bin, "pnpm"), "the executable of pnpm");
    writeFileSync(join(bin, ".pnpm-shim-v1-pnpm-target"), pnpmPackage("pnpm", "12.19.0", "pnpm"));
    process.env["PATH"] = bin;
    expect(installedPnpmVersion()).toBe("12.19.0");
    process.env["PATH"] = shimFolder();
    expect(installedPnpmVersion()).toBeUndefined();
  });

  it("gives undefined when resolvePnpm finds no pnpm", () => {
    delete process.env["npm_execpath"];
    Object.defineProperty(process, "platform", { ...platform, value: "win32" });
    process.env["PATH"] = shimFolder();
    expect(installedPnpmVersion()).toBeUndefined();
  });
});

/** This function makes an empty folder for the shims of a test. */
function shimFolder(): string {
  return mkdtempSync(join(tmpdir(), "pnpm-shim-"));
}
