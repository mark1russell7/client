/**
 * `lib new` and `procedure new` make code that compiles (deep dive CLI-13).
 *
 * The test makes a temporary workspace, runs the real lib.new (with the real cue-config) and
 * procedure.new through a context that serves fs.* and shell.run from the disk, then runs tsc
 * on the new package with the strict options of the workspace.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ProcedureContext } from "@mark1russell7/client";
import { libNew } from "@mark1russell7/client-lib";
import { procedureNew } from "@mark1russell7/client-procedure";

const markModules = realpathSync(fileURLToPath(new URL("../node_modules", import.meta.url)));

type Handler = (input: Record<string, unknown>) => unknown;

/** A context whose client serves the procedures that the scaffolders call, from the disk */
function diskContext(): ProcedureContext {
  const handlers: Record<string, Handler> = {
    "fs.exists": ({ path }) => ({ path, exists: existsSync(path as string) }),
    "fs.mkdir": ({ path }) => {
      mkdirSync(path as string, { recursive: true });
      return { path, created: true };
    },
    "fs.write": ({ path, content }) => {
      mkdirSync(dirname(path as string), { recursive: true });
      writeFileSync(path as string, content as string);
      return { path, bytesWritten: (content as string).length };
    },
    "fs.read": ({ path }) => ({ path, content: readFileSync(path as string, "utf8") }),
    "fs.read.json": ({ path }) => ({ path, data: JSON.parse(readFileSync(path as string, "utf8")) }),
    "shell.run": ({ command, args, cwd }) => {
      const result = spawnSync(command as string, args as string[], { cwd: cwd as string, encoding: "utf8" });
      return { exitCode: result.status ?? 1, stdout: result.stdout, stderr: result.stderr, success: result.status === 0 };
    },
  };
  return {
    client: {
      call: async (path: string[], input: Record<string, unknown>) => {
        const handler = handlers[path.join(".")];
        if (!handler) {
          throw new Error(`Unexpected procedure call: ${path.join(".")}`);
        }
        return handler(input);
      },
    },
  } as unknown as ProcedureContext;
}

/** A directory junction (Windows) or symbolic link (elsewhere) */
function link(target: string, path: string): void {
  mkdirSync(dirname(path), { recursive: true });
  symlinkSync(target, path, process.platform === "win32" ? "junction" : "dir");
}

/** Compile a package with its own tsconfig. Returns the compiler output when it fails. */
function compile(packageDir: string): { ok: boolean; output: string } {
  const tsc = join(markModules, "typescript", "bin", "tsc");
  const result = spawnSync(process.execPath, [tsc, "-p", packageDir], { encoding: "utf8" });
  return { ok: result.status === 0, output: `${result.stdout}\n${result.stderr}` };
}

describe("lib new + procedure new", () => {
  let root: string;
  let packageDir: string;
  const ctx = diskContext();

  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), "mark-scaffold-"));
    writeFileSync(join(root, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n");
    mkdirSync(join(root, "packages"));
    link(join(markModules, "@mark1russell7", "cue"), join(root, "node_modules", "@mark1russell7", "cue"));

    const created = await libNew({ name: "demo", preset: "lib", rootPath: root, dryRun: false }, ctx);
    expect(created.errors).toEqual([]);
    packageDir = created.packagePath;
    // The package resolves its imports (@mark1russell7/client, zod, the tsconfig presets) from mark
    link(markModules, join(packageDir, "node_modules"));
  }, 120000);

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("makes a package that compiles before it has procedures", () => {
    expect(readFileSync(join(packageDir, "src", "types.ts"), "utf8")).not.toContain("import");
    const result = compile(packageDir);
    expect(result.output).not.toContain("error");
    expect(result.ok).toBe(true);
  }, 120000);

  it("adds procedures that compile: nested paths, camelCase names, one-segment names", async () => {
    for (const name of ["demo.hello", "demo.api.v2.create", "demo.readJson", "solo"]) {
      const result = await procedureNew({ name, path: packageDir, dryRun: false }, ctx);
      expect(result.errors, name).toEqual([]);
      expect(result.success, name).toBe(true);
    }
    expect(existsSync(join(packageDir, "src", "procedures", "demo", "api", "v2", "create.ts"))).toBe(true);
    expect(existsSync(join(packageDir, "src", "procedures", "solo", "solo.ts"))).toBe(true);

    const register = readFileSync(join(packageDir, "src", "register.ts"), "utf8");
    expect(register).toContain("registerProcedures([demoHelloProcedure, demoApiV2CreateProcedure, demoReadJsonProcedure, soloProcedure])");
    expect(readFileSync(join(packageDir, "src", "types.ts"), "utf8")).toContain('import { z } from "zod";');

    const result = compile(packageDir);
    expect(result.output).not.toContain("error");
    expect(result.ok).toBe(true);
  }, 120000);

  it("refuses a name that collides, and writes nothing", async () => {
    const before = readFileSync(join(packageDir, "src", "register.ts"), "utf8");

    const again = await procedureNew({ name: "demo.hello", path: packageDir, dryRun: false }, ctx);
    expect(again.success).toBe(false);
    expect(again.errors[0]).toContain("already exists");

    // demo.apiV2.create has the same type names as demo.api.v2.create
    const sameNames = await procedureNew({ name: "demo.apiV2.create", path: packageDir, dryRun: false }, ctx);
    expect(sameNames.success).toBe(false);
    expect(sameNames.errors[0]).toContain("collides");
    expect(existsSync(join(packageDir, "src", "procedures", "demo", "apiV2"))).toBe(false);

    // A path that another package registers (client-procedure registers procedure.new)
    const registered = await procedureNew({ name: "procedure.new", path: packageDir, dryRun: false }, ctx);
    expect(registered.success).toBe(false);
    expect(registered.errors[0]).toContain("registered at procedure.new already");

    expect(readFileSync(join(packageDir, "src", "register.ts"), "utf8")).toBe(before);
  }, 120000);
});
