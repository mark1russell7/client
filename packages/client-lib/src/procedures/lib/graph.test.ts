/**
 * lib.graph (roadmap R44): the dependency graph of a temporary workspace and of this workspace,
 * through a registry of the module (its fs.* procedures read the real disk).
 */

import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRegistry, invokePath, outputValue } from "@procedures/client";
import { libModule } from "../../module.js";
import { findCycles } from "./graph.js";
import type { LibGraphOutput } from "../../types.js";

const registry = createRegistry(libModule);
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

async function graph(rootPath?: string): Promise<LibGraphOutput> {
  return outputValue(await invokePath<LibGraphOutput>(["lib", "graph"], rootPath === undefined ? {} : { rootPath }, { registry }), ["lib", "graph"]);
}

/** A workspace with a package.json for each entry (a string is the raw content of the file). */
function workspace(packages: Record<string, Record<string, unknown> | string | null>): string {
  const root = mkdtempSync(join(tmpdir(), "lib-graph-"));
  roots.push(root);
  writeFileSync(join(root, "pnpm-workspace.yaml"), 'packages:\n  - "packages/*"\n');
  for (const [folder, manifest] of Object.entries(packages)) {
    const dir = join(root, "packages", folder);
    mkdirSync(dir, { recursive: true });
    if (manifest === null) continue;
    writeFileSync(join(dir, "package.json"), typeof manifest === "string" ? manifest : JSON.stringify(manifest));
  }
  writeFileSync(join(root, "packages", "README.md"), "a file, not a package");
  return root;
}

describe("lib.graph (R44)", () => {
  it("declares that it only reads, and the procedures that it calls", () => {
    const procedure = libModule.procedures.find((item) => item.path.join(".") === "lib.graph");
    expect(procedure?.metadata.effects).toEqual({ reads: ["fs"], writes: [] });
    expect(procedure?.metadata["calls"]).toEqual(["fs.readdir", "fs.read.json"]);
  });

  it("gives the nodes, the workspace: edges and the build levels of a workspace without a cycle", async () => {
    const root = workspace({
      "pkg-core": { name: "@x/core", version: "1.0.0" },
      "pkg-util": { name: "@x/util", version: "1.0.0", dependencies: { "@x/core": "workspace:*", lodash: "^4.0.0" } },
      "pkg-app": {
        name: "@x/app",
        private: true,
        dependencies: { "@x/util": "workspace:^", "@x/core": "1.0.0" },
        devDependencies: { "@x/core": "workspace:*" },
        peerDependencies: { "@x/util": "workspace:*" },
      },
    });
    const result = await graph(root);
    expect(result.root).toBe(root);
    expect(result.nodes).toEqual([
      { name: "@x/app", folder: "pkg-app", private: true },
      { name: "@x/core", folder: "pkg-core", version: "1.0.0" },
      { name: "@x/util", folder: "pkg-util", version: "1.0.0" },
    ]);
    expect(result.edges).toEqual([
      { from: "@x/app", to: "@x/util", kind: "dependencies", spec: "workspace:^" },
      { from: "@x/app", to: "@x/core", kind: "devDependencies", spec: "workspace:*" },
      { from: "@x/app", to: "@x/util", kind: "peerDependencies", spec: "workspace:*" },
      { from: "@x/util", to: "@x/core", kind: "dependencies", spec: "workspace:*" },
    ]);
    expect(result).toMatchObject({ acyclic: true, cycles: [], levels: [["@x/core"], ["@x/util"], ["@x/app"]], warnings: [] });
  });

  it("finds the cycles, and gives no levels", async () => {
    const root = workspace({
      a: { name: "a", dependencies: { b: "workspace:*" } },
      b: { name: "b", devDependencies: { c: "workspace:*" } },
      c: { name: "c", dependencies: { a: "workspace:*" } },
      d: { name: "d", dependencies: { d: "workspace:*", a: "workspace:*" } },
      e: { name: "e" },
    });
    const result = await graph(root);
    expect(result.acyclic).toBe(false);
    expect(result.cycles).toEqual([["a", "b", "c"], ["d"]]);
    expect(result.levels).toBeUndefined();
  });

  it("warns about a folder without package.json, a package without a name and a missing workspace package", async () => {
    const root = workspace({
      empty: null,
      broken: "{ not json",
      nameless: { version: "1.0.0" },
      lonely: { name: "lonely", dependencies: { ghost: "workspace:*" } },
    });
    const result = await graph(root);
    expect(result.nodes.map((node) => node.name)).toEqual(["lonely"]);
    expect(result.edges).toEqual([]);
    const issues = result.warnings.map((warning) => warning.issue);
    expect(issues).toHaveLength(4);
    expect(issues.filter((issue) => issue.startsWith("Failed to read package.json"))).toHaveLength(2);
    expect(issues).toContain("package.json has no name");
    expect(issues).toContain("ghost (workspace:*) is not a package of the workspace");
    expect(result.levels).toEqual([["lonely"]]);
  });

  it("refuses a rootPath that is not a workspace root", async () => {
    const dir = mkdtempSync(join(tmpdir(), "lib-graph-none-"));
    roots.push(dir);
    await expect(graph(dir)).rejects.toThrow(/Not a workspace root/);
  });

  it("gives the graph of this workspace without a cycle, with @procedures/client at level 0", async () => {
    const result = await graph();
    expect(result.nodes.length).toBeGreaterThan(30);
    expect(result.acyclic).toBe(true);
    expect(result.levels?.[0]).toContain("@procedures/client");
    const fs = result.edges.filter((edge) => edge.from === "@procedures/lib" && edge.kind === "dependencies").map((edge) => edge.to);
    expect(fs).toEqual(expect.arrayContaining(["@procedures/client", "@procedures/fs", "@procedures/dag"]));
  });
});

describe("findCycles", () => {
  it("gives each strongly connected component with more than one node, and each self-loop", () => {
    const edges = new Map<string, string[]>([
      ["a", ["b"]],
      ["b", ["a", "c"]],
      ["c", ["d"]],
      ["d", ["c"]],
      ["e", ["e"]],
      ["f", []],
    ]);
    expect(findCycles(["f", "e", "d", "c", "b", "a"], edges)).toEqual([["a", "b"], ["c", "d"], ["e"]]);
    expect(findCycles(["x"], new Map())).toEqual([]);
  });
});
