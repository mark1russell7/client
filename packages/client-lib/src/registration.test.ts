/**
 * Importing only the register entry of client-lib registers what its procedures call (docs review
 * DOC-5). Before, lib.scan called fs.* and git.*, but client-lib did not register client-fs or
 * client-git: alone, lib.scan found no packages, and lib.new and lib.rename failed. The package
 * root registers nothing (ARCHITECTURE-PROPOSALS-2026-10, P9).
 *
 * This file imports nothing else, so the registry has only what the register entry registers.
 */

import { describe, it, expect, afterAll } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PROCEDURE_REGISTRY, createRegistry, invokePath, invokeProcedure, outputValue } from "@procedures/client";
import dagModule from "@procedures/dag/module";
import type { DagTraverseOutput } from "@procedures/dag";
import "./register.js";
import { libModule } from "./module.js";
import type { LibScanOutput } from "./types.js";

const tmp = mkdtempSync(join(tmpdir(), "client-lib-root-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe("the register entry of client-lib", () => {
  it("registers the fs and git procedures that its procedures call", () => {
    for (const key of ["fs.readdir", "fs.read.json", "fs.exists", "fs.write", "git.status", "git.remote"]) {
      expect(PROCEDURE_REGISTRY.get(key.split("."))?.handler, key).toBeDefined();
    }
  });

  it("lets lib.scan find the packages of a workspace", async () => {
    writeFileSync(join(tmp, "pnpm-workspace.yaml"), 'packages:\n  - "packages/*"\n');
    mkdirSync(join(tmp, "packages", "a"), { recursive: true });
    writeFileSync(join(tmp, "packages", "a", "package.json"), '{"name":"@mark1russell7/root-test-a","version":"0.0.0"}\n');
    const scan = PROCEDURE_REGISTRY.get(["lib", "scan"])!;
    const result = (await outputValue(await invokeProcedure(scan, { rootPath: tmp }))) as LibScanOutput;
    expect(Object.keys(result.packages)).toEqual(["@mark1russell7/root-test-a"]);
  });

  it("does not register dag.traverse: the module of @procedures/dag has it", () => {
    expect(PROCEDURE_REGISTRY.get(["dag", "traverse"])).toBeUndefined();
    expect(libModule.procedures.map((procedure) => procedure.path.join("."))).not.toContain("dag.traverse");
  });
});

describe("dag.traverse of @procedures/dag with lib.scan of this module", () => {
  it("visits the packages that lib.scan finds, in the order of their dependencies", async () => {
    const root = mkdtempSync(join(tmpdir(), "client-lib-traverse-"));
    try {
      writeFileSync(join(root, "pnpm-workspace.yaml"), 'packages:\n  - "packages/*"\n');
      const write = (name: string, deps: Record<string, string>) => {
        mkdirSync(join(root, "packages", name), { recursive: true });
        writeFileSync(join(root, "packages", name, "package.json"), JSON.stringify({ name: `@procedures/${name}`, dependencies: deps }));
      };
      write("base", {});
      write("top", { "@procedures/base": "workspace:*" });

      const registry = createRegistry(libModule, dagModule);
      const output = await invokePath<DagTraverseOutput>(["dag", "traverse"], { visit: ["client", "identity"], rootPath: root, dryRun: true }, { registry });
      const result = await outputValue(output);

      expect(result.success).toBe(true);
      expect(result.results.map((entry) => entry.name)).toEqual(["@procedures/base", "@procedures/top"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
