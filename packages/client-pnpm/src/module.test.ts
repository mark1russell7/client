/**
 * Each procedure of the module through a registry with the fake shell of `@procedures/shell/testing`,
 * the lookup of pnpm on each platform, and `pnpm.store.path` with a fake `execSync`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { createRegistry, invokePath, outputValue, type ProcedurePath } from "@procedures/client";
import { fakeShell, type FakeShell } from "@procedures/shell/testing";

const execSync = vi.hoisted(() => vi.fn());
vi.mock("node:child_process", async (importOriginal) => ({ ...(await importOriginal<object>()), execSync }));

const { pnpmModule, registerPnpmProcedures } = await import("./module.js");
const { resolvePnpm } = await import("./procedures/pnpm/shared.js");

const saved = { execPath: process.env["npm_execpath"], path: process.env["PATH"] };
const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
const savedEnv = ["LOCALAPPDATA", "APPDATA", "USERPROFILE", "HOME", "XDG_DATA_HOME"].map((name) => [name, process.env[name]] as const);

function restore(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

afterEach(() => {
  restore("npm_execpath", saved.execPath);
  restore("PATH", saved.path);
  for (const [name, value] of savedEnv) restore(name, value);
  Object.defineProperty(process, "platform", platform);
  execSync.mockReset();
});

function setPlatform(value: string): void {
  Object.defineProperty(process, "platform", { ...platform, value });
}

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "pnpm-module-"));
}

describe("the procedures of the module", () => {
  let shell: FakeShell;
  let script: string;

  beforeEach(() => {
    script = join(tempDir(), "pnpm.cjs");
    writeFileSync(script, "");
    process.env["npm_execpath"] = script;
    shell = fakeShell({ stdout: "[]" });
  });

  async function call(path: ProcedurePath, input: unknown): Promise<string[]> {
    const registry = createRegistry(shell.module, pnpmModule);
    await outputValue(await invokePath(path, input, { registry }));
    const index = shell.calls.length - 1;
    expect(shell.calls[index]?.args[0]).toBe(script);
    return shell.args(index).slice(1);
  }

  it("give the argument list of each command", async () => {
    expect(await call(["pnpm", "install"], { packages: ["zod"], dev: true })).toEqual(["install", "zod", "--save-dev"]);
    expect(await call(["pnpm", "add"], { packages: ["zod"], global: true })).toEqual(["add", "zod", "--global"]);
    expect(await call(["pnpm", "remove"], { packages: ["zod"], global: true })).toEqual(["remove", "zod", "--global"]);
    expect(await call(["pnpm", "link"], { path: "../lib", global: true })).toEqual(["link", "../lib", "--global"]);
    expect(await call(["pnpm", "link"], {})).toEqual(["link"]);
    expect(await call(["pnpm", "run"], { script: "build" })).toContain("build");
    expect(await call(["pnpm", "exec"], { command: "tsc" })).toEqual(["exec", "--", "tsc"]);
    expect(await call(["pnpm", "list"], {})).toContain("list");
    expect(await call(["pnpm", "why"], { packages: ["zod"] })).toContain("why");
    expect(await call(["pnpm", "outdated"], { prod: true, dev: true, packages: ["zod"] })).toEqual([
      "outdated",
      "--format",
      "json",
      "--prod",
      "--dev",
      "zod",
    ]);
    expect(await call(["pnpm", "update"], { latest: true, prod: true, dev: true, packages: ["zod"] })).toEqual([
      "update",
      "--latest",
      "--prod",
      "--dev",
      "zod",
    ]);
    expect(await call(["pnpm", "pack"], { dryRun: true, destination: "-out" })).toEqual(["pack", "--json", "--dry-run", "--pack-destination=-out"]);
  });

  it("refuse a link path that starts with -", async () => {
    const registry = createRegistry(shell.module, pnpmModule);
    const result = invokePath(["pnpm", "link"], { path: "--dir=/" }, { registry }).then((output) => outputValue(output));
    await expect(result).rejects.toThrow('starts with "-"');
    expect(shell.calls).toEqual([]);
  });

  it("register in a registry", async () => {
    const registry = createRegistry();
    registerPnpmProcedures(registry);
    expect(registry.has(["pnpm", "link"])).toBe(true);
    expect(registry.has(["shell", "run"])).toBe(true);
  });
});

describe("resolvePnpm", () => {
  beforeEach(() => {
    delete process.env["npm_execpath"];
  });

  it("takes pnpm from npm_execpath: its script or its executable", () => {
    const dir = tempDir();
    const exe = join(dir, "pnpm.exe");
    writeFileSync(exe, "");
    process.env["npm_execpath"] = exe;
    expect(resolvePnpm()).toEqual({ command: exe, prefix: [] });
  });

  it("gives pnpm on the PATH outside Windows", () => {
    setPlatform("linux");
    expect(resolvePnpm()).toEqual({ command: "pnpm", prefix: [] });
  });

  it("finds pnpm.exe or the pnpm script on the PATH on Windows, and fails when there is none", () => {
    setPlatform("win32");
    const empty = tempDir();
    const withExe = tempDir();
    writeFileSync(join(withExe, "pnpm.exe"), "");
    const withScript = tempDir();
    mkdirSync(join(withScript, "node_modules", "pnpm", "bin"), { recursive: true });
    writeFileSync(join(withScript, "node_modules", "pnpm", "bin", "pnpm.cjs"), "");

    process.env["PATH"] = [empty, withExe].join(delimiter);
    expect(resolvePnpm()).toEqual({ command: join(withExe, "pnpm.exe"), prefix: [] });
    process.env["PATH"] = [empty, withScript].join(delimiter);
    expect(resolvePnpm()).toEqual({ command: process.execPath, prefix: [join(withScript, "node_modules", "pnpm", "bin", "pnpm.cjs")] });
    process.env["PATH"] = empty;
    expect(() => resolvePnpm()).toThrow("pnpm was not found");
  });
});

describe("pnpm.store.path", () => {
  const registry = createRegistry(pnpmModule);

  async function storePath(input: object = {}): Promise<{ path: string; exists: boolean; platform: string }> {
    return (await outputValue(await invokePath(["pnpm", "store", "path"], input, { registry }))) as { path: string; exists: boolean; platform: string };
  }

  it("gives the path that pnpm prints", async () => {
    const dir = tempDir();
    execSync.mockReturnValue(`${dir}\n`);
    expect(await storePath({ cwd: dir })).toMatchObject({ path: dir, exists: true });
    expect(execSync).toHaveBeenCalledWith("pnpm store path", { cwd: dir, encoding: "utf8" });
  });

  it("gives the default of Windows when pnpm does not run", async () => {
    execSync.mockImplementation(() => {
      throw new Error("pnpm is not installed");
    });
    setPlatform("win32");
    const local = tempDir();
    const roaming = tempDir();
    process.env["LOCALAPPDATA"] = local;
    process.env["APPDATA"] = roaming;
    expect((await storePath()).path).toBe(`${local}\\pnpm\\store\\v3`);
    mkdirSync(`${roaming}\\pnpm\\store\\v3`, { recursive: true });
    expect(await storePath()).toMatchObject({ path: `${roaming}\\pnpm\\store\\v3`, exists: true, platform: "win32" });
    mkdirSync(`${local}\\pnpm\\store\\v3`, { recursive: true });
    expect((await storePath()).path).toBe(`${local}\\pnpm\\store\\v3`);
    delete process.env["LOCALAPPDATA"];
    delete process.env["APPDATA"];
    process.env["USERPROFILE"] = local;
    expect((await storePath()).path).toBe(`${local}\\AppData\\Local\\pnpm\\store\\v3`);
  });

  it("gives the default of macOS and Linux when pnpm does not run", async () => {
    execSync.mockImplementation(() => {
      throw new Error("pnpm is not installed");
    });
    setPlatform("linux");
    const home = tempDir();
    process.env["HOME"] = home;
    delete process.env["XDG_DATA_HOME"];
    expect((await storePath()).path).toBe(`${home}/.local/share/pnpm/store/v3`);
    mkdirSync(`${home}/.pnpm-store/v3`, { recursive: true });
    expect((await storePath()).path).toBe(`${home}/.pnpm-store/v3`);
    process.env["XDG_DATA_HOME"] = join(home, "data");
    mkdirSync(`${join(home, "data")}/pnpm/store/v3`, { recursive: true });
    expect(await storePath()).toMatchObject({ path: `${join(home, "data")}/pnpm/store/v3`, exists: true, platform: "linux" });
  });
});
