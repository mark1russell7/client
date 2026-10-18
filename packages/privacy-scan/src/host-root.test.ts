/**
 * The privacy-scan procedures under the root of a host (roadmap R33, tracker item O36).
 * `privacyScan.files` scans only files and folders in the root, and reads its list files from the
 * root. `privacyScan.text` reaches no file. Without a root, nothing changes.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRegistry, invokePath, outputValue, type ProcedureRegistry } from "@procedures/client";
import { confineToRoot, rootDecisionOf } from "@procedures/fs/module";
import { privacyScanModule } from "./module.js";
import type { FileScan } from "./scan.js";

let base: string;
let root: string;
let rooted: ProcedureRegistry;

async function scan(input: unknown, at: ProcedureRegistry = rooted): Promise<FileScan> {
  return outputValue(await invokePath<FileScan>(["privacyScan", "files"], input, { registry: at }));
}

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), "privacy-scan-host-root-"));
  root = join(base, "root");
  mkdirSync(join(root, "notes"), { recursive: true });
  writeFileSync(join(root, "notes", "a.md"), "We met in Sunnyvale.\n");
  writeFileSync(join(root, "terms.txt"), "Sunnyvale\n");
  writeFileSync(join(base, "secret.md"), "Sunnyvale again.\n");
  rooted = createRegistry(privacyScanModule);
  confineToRoot(rooted, root);
});

afterEach(() => {
  rmSync(base, { recursive: true, force: true });
});

describe("the privacy-scan procedures under the root of a host", () => {
  it("confine privacyScan.files, and leave privacyScan.text as it is", () => {
    const kinds = Object.fromEntries(privacyScanModule.procedures.map((procedure) => [procedure.path.join("."), rootDecisionOf(procedure).kind]));
    expect(kinds).toEqual({ "privacyScan.text": "unchanged", "privacyScan.files": "confined" });
  });

  it("scan a folder and read a list file in the root", async () => {
    const result = await scan({ paths: ["notes"], termsFile: "terms.txt" });
    expect(result.files).toBe(1);
    expect(result.findings.map((finding) => finding.file)).toEqual([join(root, "notes", "a.md")]);
  });

  it("refuse a path or a list file outside the root", async () => {
    for (const input of [{ paths: [join(base, "secret.md")] }, { paths: ["notes", "../secret.md"] }, { paths: ["notes"], termsFile: join(base, "secret.md") }, { paths: ["notes"], allowFile: "../secret.md" }]) {
      await expect(scan(input)).rejects.toMatchObject({ code: "FORBIDDEN", reason: "outside-root" });
    }
  });

  it("scan each path without a root", async () => {
    const result = await scan({ paths: [join(base, "secret.md")], terms: ["Sunnyvale"] }, createRegistry(privacyScanModule));
    expect(result.findings).toHaveLength(1);
  });
});
