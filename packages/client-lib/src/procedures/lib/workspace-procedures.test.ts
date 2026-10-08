/**
 * Tests of lib.scan, lib.audit and lib.new against a temporary workspace.
 *
 * The procedures reach the file system and git only through ctx.client.call(),
 * so a fake client serves fs.* from the real (temporary) disk and git.* from fixed values.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ProcedureContext } from "@mark1russell7/client";
import { libScan } from "./scan.js";
import { libAudit } from "./audit.js";
import { libNew } from "./new.js";

type Handler = (input: Record<string, unknown>) => unknown;

function fakeContext(calls: string[] = []): ProcedureContext {
  const handlers: Record<string, Handler> = {
    "fs.readdir": ({ path }) => ({
      path,
      entries: readdirSync(path as string, { withFileTypes: true }).map((entry) => ({
        name: entry.name,
        path: join(path as string, entry.name),
        type: entry.isDirectory() ? "directory" : "file",
      })),
    }),
    "fs.read.json": ({ path }) => ({ path, data: JSON.parse(readFileSync(path as string, "utf8")) }),
    "fs.exists": ({ path }) => ({ path, exists: existsSync(path as string) }),
    "git.status": () => ({ branch: "main" }),
    "git.remote": () => ({ name: "origin", url: "git@github.com:mark1russell7/client.git" }),
  };
  return {
    client: {
      call: async (path: string[], input: Record<string, unknown>) => {
        const key = path.join(".");
        calls.push(key);
        const handler = handlers[key];
        if (!handler) {
          throw new Error(`Unexpected procedure call: ${key}`);
        }
        return handler(input);
      },
    },
  } as unknown as ProcedureContext;
}

function writeJson(file: string, data: unknown): void {
  writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
}

/** Make a package folder with the files of the package template */
function makePackage(root: string, folder: string, pkg: Record<string, unknown>): string {
  const dir = join(root, "packages", folder);
  mkdirSync(join(dir, "src"), { recursive: true });
  writeJson(join(dir, "package.json"), pkg);
  writeJson(join(dir, "tsconfig.json"), {});
  writeJson(join(dir, "dependencies.json"), { dependencies: ["ts", "node"] });
  writeFileSync(join(dir, ".gitignore"), "node_modules/\n");
  return dir;
}

describe("workspace lib procedures", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "client-lib-scan-"));
    writeFileSync(join(root, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n");
    mkdirSync(join(root, "packages"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  describe("lib.scan", () => {
    it("lists the workspace packages with their ecosystem dependencies", async () => {
      makePackage(root, "b", {
        name: "@mark1russell7/b",
        dependencies: { "@mark1russell7/a": "workspace:*", zod: "^3.24.0" },
        devDependencies: { "@mark1russell7/cue": "github:mark1russell7/cue#main" },
      });
      makePackage(root, "a", { name: "@mark1russell7/a" });
      writeFileSync(join(root, "packages", "notes.txt"), "not a package");

      const calls: string[] = [];
      const result = await libScan({ rootPath: root }, fakeContext(calls));

      expect(Object.keys(result.packages)).toEqual(["@mark1russell7/a", "@mark1russell7/b"]);
      expect(result.packages["@mark1russell7/b"]).toEqual({
        name: "@mark1russell7/b",
        repoPath: join(root, "packages", "b"),
        currentBranch: "main",
        gitRemote: "git@github.com:mark1russell7/client.git",
        mark1russell7Deps: ["@mark1russell7/a", "@mark1russell7/cue"],
      });
      expect(result.warnings).toEqual([]);
      // One repository: the branch is read once, not once per package
      expect(calls.filter((c) => c === "git.status")).toHaveLength(1);
    });

    it("warns about folders without a usable package.json", async () => {
      mkdirSync(join(root, "packages", "empty"));
      makePackage(root, "nameless", {});

      const result = await libScan({ rootPath: root }, fakeContext());

      expect(result.packages).toEqual({});
      expect(result.warnings.map((w) => w.issue)).toEqual([
        "Failed to read package.json",
        "package.json has no name",
      ]);
    });

    it("warns when the workspace has no packages folder", async () => {
      rmSync(join(root, "packages"), { recursive: true });

      const result = await libScan({ rootPath: root }, fakeContext());

      expect(result.packages).toEqual({});
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]?.issue).toContain("Failed to list workspace packages");
    });
  });

  describe("lib.audit", () => {
    it("passes a package that matches the template", async () => {
      makePackage(root, "a", { name: "@mark1russell7/a" });

      const result = await libAudit({ rootPath: root, fix: false }, fakeContext());

      expect(result.success).toBe(true);
      expect(result.summary).toEqual({ total: 1, valid: 1, invalid: 0 });
    });

    it("reports missing files and workspace problems", async () => {
      makePackage(root, "a", { name: "@mark1russell7/a" });
      const b = makePackage(root, "b", {
        name: "@mark1russell7/b",
        dependencies: { "@mark1russell7/a": "github:mark1russell7/a#main" },
        pnpm: { onlyBuiltDependencies: [] },
      });
      writeFileSync(join(b, "pnpm-lock.yaml"), "");
      rmSync(join(b, "dependencies.json"));

      const result = await libAudit({ rootPath: root, fix: false }, fakeContext());
      const audit = result.results.find((r) => r.name === "@mark1russell7/b");

      expect(result.success).toBe(false);
      expect(audit?.missingFiles).toEqual(["dependencies.json"]);
      expect(audit?.pnpmIssues.map((i) => i.type).sort()).toEqual([
        "ignored-pnpm-field",
        "not-workspace-link",
        "package-lockfile",
      ]);
    });

    it("skips packages/cli, the repository tool of the template", async () => {
      mkdirSync(join(root, "packages", "cli", "src"), { recursive: true });
      writeJson(join(root, "packages", "cli", "package.json"), { name: "@mark1russell7/repo-cli" });

      const result = await libAudit({ rootPath: root, fix: false }, fakeContext());

      expect(result.results).toEqual([]);
    });
  });

  describe("lib.new", () => {
    it("plans packages/<name> in a dry run and creates nothing", async () => {
      const result = await libNew({ name: "demo", preset: "lib", rootPath: root, dryRun: true }, fakeContext());

      expect(result.success).toBe(true);
      expect(result.packageName).toBe("@mark1russell7/demo");
      expect(result.packagePath).toBe(join(root, "packages", "demo"));
      expect(result.created).toContain(join(root, "packages", "demo", "src", "register.ts"));
      expect(existsSync(join(root, "packages", "demo"))).toBe(false);
    });

    it("refuses a package folder that exists", async () => {
      makePackage(root, "demo", { name: "@mark1russell7/demo" });

      const result = await libNew({ name: "demo", preset: "lib", rootPath: root, dryRun: false }, fakeContext());

      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain("already exists");
    });
  });
});
