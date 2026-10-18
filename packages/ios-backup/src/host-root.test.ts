/**
 * The ios-backup procedures under the root of a host (roadmap R33, tracker item O36): a root
 * refuses them, with the reason in their rules. The default backups are in the home folder, and
 * the names of the files come from the data of `Manifest.db`. Without a root, nothing changes.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRegistry, invokePath, outputValue, type ProcedureRegistry } from "@procedures/client";
import { confineToRoot, rootDecisionOf } from "@procedures/fs/module";
import { iosBackupModule } from "./module.js";

let base: string;
let root: string;
let rooted: ProcedureRegistry;

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), "ios-backup-host-root-"));
  root = join(base, "root");
  mkdirSync(join(root, "Backup"), { recursive: true });
  rooted = createRegistry(iosBackupModule);
  confineToRoot(rooted, root);
});

afterEach(() => {
  rmSync(base, { recursive: true, force: true });
});

describe("the ios-backup procedures under the root of a host", () => {
  it("are refused, with the reason", () => {
    for (const procedure of iosBackupModule.procedures) {
      const decision = rootDecisionOf(procedure);
      expect(decision.kind, procedure.path.join(".")).toBe("refused");
      expect(decision.reason).toContain("Manifest.db");
    }
  });

  it("refuse a call, also for a folder in the root", async () => {
    for (const [key, input] of [
      ["iosBackup.find", { roots: [join(root, "Backup")] }],
      ["iosBackup.file", { backup: join(root, "Backup"), domain: "HomeDomain", relativePath: "Library/SMS/sms.db" }],
      ["iosBackup.messages", { backup: join(root, "Backup") }],
    ] as const) {
      await expect(invokePath(key.split("."), input, { registry: rooted }), key).rejects.toMatchObject({ code: "FORBIDDEN", reason: "outside-root" });
    }
  });

  it("find the backups without a root", async () => {
    const found = await outputValue(await invokePath<{ backups: unknown[] }>(["iosBackup", "find"], { roots: [join(root, "Backup")] }, { registry: createRegistry(iosBackupModule) }));
    expect(found.backups).toEqual([]);
  });
});
