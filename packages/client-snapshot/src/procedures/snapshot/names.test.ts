/**
 * Snapshot names and exclusions (deep dive DATA-1, DATA-3).
 */

import { describe, it, expect, vi } from "vitest";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ProcedureContext } from "@mark1russell7/client";
import { assertSnapshotName, isExcluded } from "./names.js";
import { snapshotRestore } from "./restore.js";

describe("snapshot names", () => {
  it("accepts plain names and rejects paths", () => {
    expect(() => assertSnapshotName("id", "daily-2026-10-08.1_a")).not.toThrow();
    for (const bad of ["x/../../dir", "..", String.raw`a\b`, "a/b", "", "a b"]) {
      expect(() => assertSnapshotName("id", bad)).toThrow("Invalid snapshot id");
    }
  });

  it("restore refuses a hostile id before it touches the disk or S3", async () => {
    const victim = mkdtempSync(join(tmpdir(), "victim-"));
    const call = vi.fn();
    const ctx = { client: { call } } as unknown as ProcedureContext;
    await expect(
      snapshotRestore({ id: `x/../../${victim}`, bucket: "b", targetPath: join(tmpdir(), "target") } as never, ctx),
    ).rejects.toThrow("Invalid snapshot id");
    expect(existsSync(victim)).toBe(true);
    expect(call).not.toHaveBeenCalled();
  });
});

describe("archive exclusions", () => {
  const light = ["node_modules", ".pnpm-store", "dist", "*.log"];

  it("matches whole path segments and file endings", () => {
    expect(isExcluded("proj/node_modules/x/index.js", light)).toBe(true);
    expect(isExcluded("proj/dist/index.js", light)).toBe(true);
    expect(isExcluded("proj/debug.log", light)).toBe(true);
    expect(isExcluded(String.raw`proj\dist\a.js`, light)).toBe(true);
  });

  it("keeps sources whose names only contain a pattern", () => {
    expect(isExcluded("proj/src/distance.ts", light)).toBe(false);
    expect(isExcluded("proj/distribution/notes.md", light)).toBe(false);
    expect(isExcluded("proj/src/logger.ts", light)).toBe(false);
  });
});
