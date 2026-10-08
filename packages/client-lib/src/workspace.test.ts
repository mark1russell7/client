import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import {
  expandHome,
  extractEcosystemDeps,
  findWorkspaceRoot,
  isEcosystemDependencySpec,
  packagesDir,
  resolveWorkspaceRoot,
} from "./workspace.js";

describe("findWorkspaceRoot", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "client-lib-ws-"));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("finds the nearest folder with pnpm-workspace.yaml", () => {
    writeFileSync(join(tmp, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n");
    const nested = join(tmp, "packages", "a", "src");
    mkdirSync(nested, { recursive: true });

    expect(findWorkspaceRoot(nested)).toBe(tmp);
    expect(findWorkspaceRoot(tmp)).toBe(tmp);
  });

  it("returns null when no folder above has pnpm-workspace.yaml", () => {
    expect(findWorkspaceRoot(tmp)).toBeNull();
  });
});

describe("resolveWorkspaceRoot", () => {
  it("defaults to the workspace that contains client-lib", () => {
    const root = resolveWorkspaceRoot();
    expect(existsSync(join(root, "pnpm-workspace.yaml"))).toBe(true);
    expect(existsSync(join(packagesDir(root), "client-lib", "package.json"))).toBe(true);
  });

  it("uses an explicit rootPath and expands ~", () => {
    expect(resolveWorkspaceRoot("~/some/where")).toBe(join(homedir(), "some", "where"));
  });
});

describe("expandHome", () => {
  it("expands ~ and ~/ only at the start", () => {
    expect(expandHome("~")).toBe(homedir());
    expect(expandHome("~/a")).toBe(join(homedir(), "a"));
    expect(expandHome("/a/~/b")).toBe("/a/~/b");
  });
});

describe("isEcosystemDependencySpec", () => {
  it("accepts workspace links and github:mark1russell7 references", () => {
    expect(isEcosystemDependencySpec("workspace:*")).toBe(true);
    expect(isEcosystemDependencySpec("workspace:^")).toBe(true);
    expect(isEcosystemDependencySpec("github:mark1russell7/cue#main")).toBe(true);
  });

  it("rejects registry versions", () => {
    expect(isEcosystemDependencySpec("^3.24.0")).toBe(false);
    expect(isEcosystemDependencySpec("latest")).toBe(false);
  });
});

describe("extractEcosystemDeps", () => {
  it("collects @mark1russell7 links from all dependency fields without duplicates", () => {
    const deps = extractEcosystemDeps({
      dependencies: {
        "@mark1russell7/client": "workspace:*",
        "@mark1russell7/logger": "github:mark1russell7/logger#main",
        zod: "^3.24.0",
      },
      devDependencies: {
        "@mark1russell7/client": "workspace:*",
        "@mark1russell7/cue": "github:mark1russell7/cue#main",
        typescript: "^5.9.3",
      },
      peerDependencies: {
        "@mark1russell7/client-shell": "workspace:*",
      },
    });

    expect(deps.sort()).toEqual([
      "@mark1russell7/client",
      "@mark1russell7/client-shell",
      "@mark1russell7/cue",
      "@mark1russell7/logger",
    ]);
  });

  it("ignores @mark1russell7 packages that come from the registry", () => {
    expect(extractEcosystemDeps({ dependencies: { "@mark1russell7/x": "^1.0.0" } })).toEqual([]);
  });
});
