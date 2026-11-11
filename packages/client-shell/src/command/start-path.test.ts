/**
 * On Windows, a program name with no folder starts only from a folder of `PATH`, never from the
 * working folder of the call. The tests put a decoy program in the working folder and the real
 * program in a folder of `PATH`. The two programs are copies of `whoami.exe` and `hostname.exe`
 * under one name, so the output tells which one started.
 *
 * Windows looks in the working folder first unless the host process has the variable
 * `NoDefaultCurrentDirectoryInExePath`. Each test removes that variable from the host for its
 * time, so the result does not depend on the shell that started the tests.
 *
 * The last test runs on each system: the error of a program that no folder has names the command.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { copyFileSync, mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCommand } from "./index.js";
import { shellRun } from "../procedures/shell/run.js";
import { shellWhich } from "../procedures/shell/which.js";
import { startChild } from "./spawn.js";

const WINDOWS = process.platform === "win32";
const VARIABLE = "NoDefaultCurrentDirectoryInExePath";
const SYSTEM = join(process.env["SystemRoot"] ?? "C:\\Windows", "System32");
/** The name of the test program. No real program has this name. */
const NAME = "start-path-probe";

let base: string;
/** The working folder of the call. It holds the decoy. */
let work: string;
/** The folder of `PATH` that holds the real program. */
let bin: string;
/** The value of the variable before the test, or undefined when it was not set. */
let saved: Array<[string, string | undefined]>;
/** The output of the real `hostname.exe`. */
let host: string;

/** The `PATH` of the child: the folder of the real program first, then the `PATH` of the host. */
function childPath(): Record<string, string> {
  return { PATH: `${bin};${process.env["PATH"] ?? ""}` };
}

beforeEach(async () => {
  if (!WINDOWS) return;
  saved = Object.keys(process.env)
    .filter((key) => key.toLowerCase() === VARIABLE.toLowerCase())
    .map((key) => [key, process.env[key]]);
  for (const [key] of saved) delete process.env[key];
  base = mkdtempSync(join(tmpdir(), "start-path-"));
  work = join(base, "work");
  bin = join(base, "bin");
  for (const folder of [work, bin]) mkdirSync(folder);
  host = (await runCommand(join(SYSTEM, "hostname.exe"))).stdout.trim();
});

afterEach(() => {
  if (!WINDOWS) return;
  for (const [key, value] of saved) if (value !== undefined) process.env[key] = value;
  rmSync(base, { recursive: true, force: true });
});

describe.skipIf(!WINDOWS)("a program name with no folder (Windows only: POSIX does not look in the working folder)", () => {
  beforeEach(() => {
    copyFileSync(join(SYSTEM, "whoami.exe"), join(work, `${NAME}.exe`));
  });

  it("starts the program of PATH, not the decoy of the working folder", async () => {
    copyFileSync(join(SYSTEM, "hostname.exe"), join(bin, `${NAME}.exe`));
    expect(host.length).toBeGreaterThan(0);

    const bare = await runCommand(NAME, { cwd: work, env: childPath() });
    expect(bare.error).toBeUndefined();
    expect(bare.stdout.trim()).toBe(host);

    const withExtension = await runCommand(`${NAME}.exe`, { cwd: work, env: childPath() });
    expect(withExtension.stdout.trim()).toBe(host);

    const procedure = await shellRun({ command: NAME, args: [], cwd: work, env: childPath(), encoding: "utf8" });
    expect(procedure.success).toBe(true);
    expect(procedure.stdout.trim()).toBe(host);
  });

  it("fails with ENOENT when no folder of PATH has the program, and does not start the decoy", async () => {
    const result = await runCommand(NAME, { cwd: work, env: childPath() });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/ENOENT/);
    expect(result.stdout).toBe("");

    const procedure = await shellRun({ command: NAME, args: [], cwd: work, env: childPath(), encoding: "utf8" });
    expect(procedure.success).toBe(false);
    expect(procedure.stderr).toMatch(/ENOENT/);
    expect(procedure.stdout).toBe("");
  });

  it("shell.which gives the program of PATH, not the decoy of the current folder", async () => {
    copyFileSync(join(SYSTEM, "hostname.exe"), join(bin, `${NAME}.exe`));
    const folder = process.cwd();
    const path = process.env["PATH"];
    process.env["PATH"] = childPath()["PATH"];
    process.chdir(work);
    try {
      const found = await shellWhich({ command: NAME });
      expect(found.found).toBe(true);
      // The temporary folder can have a short 8.3 name (RUNNER~1), and where gives the long name
      const real = (path: string): string => realpathSync.native(path).toLowerCase();
      expect(real(found.path ?? "")).toBe(real(join(bin, `${NAME}.exe`)));
    } finally {
      process.chdir(folder);
      if (path !== undefined) process.env["PATH"] = path;
    }
  });
});

describe("the error of a program that no folder has (each system)", () => {
  it("names the command, with the fields of a start by name", async () => {
    const name = "no-such-program-of-the-start-test";
    const child = startChild(name, { args: ["one"] }, "ignore");
    const error = await new Promise<NodeJS.ErrnoException & { spawnargs?: string[] }>((resolve) => child.once("error", resolve));
    expect(error).toMatchObject({ code: "ENOENT", syscall: `spawn ${name}`, path: name, spawnargs: ["one"], message: `spawn ${name} ENOENT` });
    expect(error.stack).toContain(`spawn ${name} ENOENT`);
  });
});
