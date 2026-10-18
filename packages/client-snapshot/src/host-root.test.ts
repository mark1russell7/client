/**
 * The snapshot procedures under the root of a host (roadmap R33, tracker item O36). A root refuses
 * `snapshot.create`, `snapshot.restore` and `snapshot.diff`, with the reason in their rules.
 * `snapshot.list` and `snapshot.delete` reach only S3. Without a root, nothing changes.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRegistry, invokePath, type ProcedureRegistry } from "@procedures/client";
import { confineToRoot, rootDecisionOf } from "@procedures/fs/module";
import { snapshotModule } from "./module.js";

let base: string;
let root: string;
let rooted: ProcedureRegistry;

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), "snapshot-host-root-"));
  root = join(base, "root");
  mkdirSync(root);
  rooted = createRegistry(snapshotModule);
  confineToRoot(rooted, root);
});

afterEach(() => {
  rmSync(base, { recursive: true, force: true });
});

describe("the snapshot procedures under the root of a host", () => {
  it("refuse create, restore and diff with a reason, and leave list and delete as they are", () => {
    const decisions = Object.fromEntries(snapshotModule.procedures.map((procedure) => [procedure.path.join("."), rootDecisionOf(procedure)]));
    expect(Object.fromEntries(Object.entries(decisions).map(([key, decision]) => [key, decision.kind]))).toEqual({
      "snapshot.create": "refused",
      "snapshot.list": "unchanged",
      "snapshot.restore": "refused",
      "snapshot.diff": "refused",
      "snapshot.delete": "unchanged",
    });
    expect(decisions["snapshot.create"]?.reason).toContain("starts git and pnpm");
    expect(decisions["snapshot.restore"]?.reason).toContain("temporary folder");
    expect(decisions["snapshot.diff"]?.reason).toContain("another machine");
  });

  it("refuse a call in the root, and start nothing", async () => {
    for (const [key, input] of [
      ["snapshot.create", { name: "x", bucket: "b", paths: [root] }],
      ["snapshot.restore", { id: "x", bucket: "b", targetPath: join(root, "restored") }],
      ["snapshot.diff", { id: "x", bucket: "b", paths: [root] }],
    ] as const) {
      await expect(invokePath(key.split("."), input, { registry: rooted }), key).rejects.toMatchObject({ code: "FORBIDDEN", reason: "outside-root" });
    }
    expect(existsSync(join(root, "restored"))).toBe(false);
    expect(readdirSync(root)).toEqual([]);
  });

  it("start the handlers without a root", async () => {
    const plain = createRegistry(snapshotModule);
    // The registry has no s3 procedures, so the restore fails at its first nested call, not at a root
    const error = await invokePath(["snapshot", "restore"], { id: "x", bucket: "b", targetPath: join(base, "restored") }, { registry: plain }).then(
      () => undefined,
      (thrown: unknown) => thrown,
    );
    expect(error).toMatchObject({ code: "NOT_FOUND" });
  });
});
