/**
 * The helpers that the package root exports (the DAG nodes of a scan, the git references and the
 * global flags of mark), and the handlers of the module through a registry: lib.new, lib.audit
 * and ecosystem.procedures against a temporary workspace.
 */

import { afterAll, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRegistry, invokePath, outputValue } from "@procedures/client";
// The control flow and procedure.* of the core in the global registry, for ecosystem.procedures
import "@procedures/client/register";
import * as root from "./index.js";
import { libModule } from "./module.js";
import type { EcosystemProceduresOutput } from "./procedures/ecosystem/index.js";
import type { LibAuditOutput, LibNewOutput } from "./types.js";

const workspace = mkdtempSync(join(tmpdir(), "client-lib-helpers-"));
afterAll(() => rmSync(workspace, { recursive: true, force: true }));

function writePackage(folder: string, manifest: Record<string, unknown>, files: Record<string, string> = {}): string {
  const dir = join(workspace, "packages", folder);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "package.json"), JSON.stringify(manifest));
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  return dir;
}

writeFileSync(join(workspace, "pnpm-workspace.yaml"), 'packages:\n  - "packages/*"\n');
writePackage("client-demo", { name: "@procedures/client-demo", client: { procedures: "./register.mjs" } }, { "register.mjs": "export {};\n" });
writePackage("client-broken", { name: "@procedures/client-broken", client: { procedures: "./missing.mjs" } });
writePackage("client-plain", { name: "@procedures/client-plain", dependencies: { "@procedures/client-demo": "workspace:*" } });
writePackage("other", { name: "@procedures/other" });

const registry = createRegistry(libModule);

async function call<T>(key: string, input: unknown): Promise<T> {
  return outputValue(await invokePath<T>(key.split("."), input, { registry }));
}

describe("the helpers of the package root", () => {
  it("builds the DAG nodes of the scanned packages, with the edges between them only", () => {
    const nodes = root.buildDAGNodes({
      "@procedures/a": { name: "@procedures/a", repoPath: "/w/a", mark1russell7Deps: [] },
      "@procedures/b": {
        name: "@procedures/b",
        repoPath: "/w/b",
        mark1russell7Deps: ["@procedures/a", "@procedures/missing"],
        currentBranch: "dev",
        gitRemote: "git@example.com:x/y.git",
      },
    });
    expect(nodes.get("@procedures/a")).toMatchObject({ id: "@procedures/a", requiredBranch: "main", gitRef: "github:mark1russell7/@procedures/a#main" });
    expect(nodes.get("@procedures/b")).toMatchObject({ dependencies: ["@procedures/a"], requiredBranch: "dev", gitRef: "git@example.com:x/y.git" });
  });

  it("parses the git references of package.json", () => {
    expect(root.parseGitRef("github:mark1russell7/logger#main")).toEqual({
      raw: "github:mark1russell7/logger#main",
      host: "github",
      owner: "mark1russell7",
      repo: "logger",
      ref: "main",
    });
    expect(root.parseGitRef("^1.0.0")).toBeNull();
    expect(root.isGitRef("gitlab:user/project#develop")).toBe(true);
    expect(root.isGitRef("workspace:*")).toBe(false);
    expect(root.isMark1Russell7Ref("github:mark1russell7/cue#main")).toBe(true);
    expect(root.isMark1Russell7Ref("github:someone/cue#main")).toBe(false);
    const refs = root.extractMark1Russell7Deps({
      cue: "github:mark1russell7/cue#main",
      other: "github:someone/other#main",
      broken: "mark1russell7/no-host",
    });
    expect(refs.map((ref) => ref.repo)).toEqual(["cue"]);
    expect(root.getPackageNameFromRef(refs[0]!)).toBe("cue");
  });

  it("finds a global flag of mark by its long name or its short letter", () => {
    expect(root.findGlobalFlag("format", false)?.short).toBe("f");
    expect(root.findGlobalFlag("i", true)?.long).toBe("interactive");
    expect(root.findGlobalFlag("nothing", false)).toBeUndefined();
  });
});

describe("the handlers of the module", () => {
  it("lib.new gives the plan of a new package with dryRun", async () => {
    const result = await call<LibNewOutput>("lib.new", { name: "fresh", rootPath: workspace, dryRun: true });
    expect(result.success).toBe(true);
    expect(result.packageName).toBe("@procedures/fresh");
  });

  it("lib.audit examines each package of the workspace", async () => {
    const result = await call<LibAuditOutput>("lib.audit", { rootPath: workspace });
    expect(result.summary.total).toBe(4);
  });

  it("ecosystem.procedures lists the procedures of the client packages, by namespace", async () => {
    const result = await call<EcosystemProceduresOutput>("ecosystem.procedures", { rootPath: workspace });
    // The client-* packages only: the demo with a register file, the broken one and the plain one
    expect(result.byPackage.map((pkg) => pkg.name).sort()).toEqual([
      "@procedures/client-broken",
      "@procedures/client-demo",
      "@procedures/client-plain",
    ]);
    expect(result.byPackage.find((pkg) => pkg.name === "@procedures/client-plain")?.procedures).toEqual([]);
    // The name @procedures/client-demo gives the namespace "client": the core procedures count
    expect(result.summary.namespaces).toContain("client");
    expect(result.byNamespace["client"]?.length).toBeGreaterThan(0);

    const filtered = await call<EcosystemProceduresOutput>("ecosystem.procedures", { rootPath: workspace, namespace: "none" });
    expect(filtered.summary.totalProcedures).toBe(0);
  });
});
