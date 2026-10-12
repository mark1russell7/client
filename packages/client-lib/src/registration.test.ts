/**
 * Importing only the root of client-lib registers what its procedures call (docs review DOC-5).
 * Before, lib.scan called fs.* and git.*, but the root did not register client-fs or client-git:
 * alone, lib.scan found no packages, and lib.new and lib.rename failed.
 *
 * This file imports nothing else, so the registry has only what the root registers.
 */

import { describe, it, expect, afterAll } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PROCEDURE_REGISTRY, invokeProcedure, outputValue } from "@procedures/client";
import "./index.js";
import type { LibScanOutput } from "./types.js";

const tmp = mkdtempSync(join(tmpdir(), "client-lib-root-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe("the root of client-lib", () => {
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
});
