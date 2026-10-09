/**
 * E2E: `lib new` and `procedure new` through the built CLI, in a temporary workspace (never in
 * the repository: before, these tests made packages in the real packages/ folder).
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { built, link, mark, MARK_MODULES } from "./run.js";

describe.skipIf(!built)("mark: lib new and procedure new", () => {
  let root: string;
  let pkg: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "mark-e2e-workspace-"));
    writeFileSync(join(root, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n");
    mkdirSync(join(root, "packages"));
    // lib new runs the workspace's cue-config
    link(join(MARK_MODULES, "@mark1russell7", "cue"), join(root, "node_modules", "@mark1russell7", "cue"));
    pkg = join(root, "packages", "e2e-demo");
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("lib new makes a package in the workspace that --root-path names", () => {
    const run = mark(["lib", "new", "e2e-demo", "--root-path", root]);
    expect(run.stderr).toBe("");
    expect(run.exitCode).toBe(0);
    for (const file of ["package.json", "tsconfig.json", "src/index.ts", "src/register.ts", "src/types.ts"]) {
      expect(existsSync(join(pkg, file)), file).toBe(true);
    }
  });

  it("procedure new adds a procedure and registers it, also with a nested path", () => {
    expect(mark(["procedure", "new", "demo.hello", "--path", pkg]).exitCode).toBe(0);
    expect(mark(["procedure", "new", "api.v2.users.create", "--path", pkg]).exitCode).toBe(0);
    expect(existsSync(join(pkg, "src", "procedures", "demo", "hello.ts"))).toBe(true);
    expect(existsSync(join(pkg, "src", "procedures", "api", "v2", "users", "create.ts"))).toBe(true);
    const register = readFileSync(join(pkg, "src", "register.ts"), "utf8");
    expect(register).toContain("demoHelloProcedure");
    expect(register).toContain("apiV2UsersCreateProcedure");
  });

  it("procedure new refuses a name that exists, with exit code 1", () => {
    const run = mark(["procedure", "new", "demo.hello", "--path", pkg]);
    expect(run.exitCode).toBe(1);
    expect(run.stdout + run.stderr).toContain("already exists");
  });
});
