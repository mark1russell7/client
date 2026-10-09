/**
 * repo rename changes every reference to a workspace package, and no other (deep dive CLI-20).
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { planRename, rewriteText } from "./rename.ts";

function write(root: string, path: string, content: string): void {
  const full = join(root, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
}

describe("repo rename", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "repo-rename-"));
    write(root, "package.json", JSON.stringify({ name: "acme-monorepo", devDependencies: { "@acme/ste-lint": "github:acme/ste-lint" } }));
    write(root, "packages/a/package.json", JSON.stringify({
      name: "@acme/a",
      dependencies: { "@acme/b": "workspace:*", "@acme/cue": "github:acme/cue#main" },
    }));
    write(root, "packages/b/package.json", JSON.stringify({ name: "@acme/b" }));
    write(root, "packages/a/src/index.ts", `import { b } from "@acme/b";\nimport { cue } from "@acme/cue";\n`);
    write(root, "packages/a/test/a.test.ts", `import "@acme/a";\n`);
    write(root, "packages/a/e2e/run.ts", `import "@acme/b/register";\n`);
    write(root, "packages/a/vitest.config.ts", `// tests of @acme/a\n`);
    write(root, "packages/a/tsconfig.json", JSON.stringify({ compilerOptions: { paths: { "@acme/b": ["../b/src"] } } }));
    write(root, "packages/a/README.md", "Use @acme/a. It needs @acme/b, and @acme/cue from its own repository.\n");
    write(root, ".github/workflows/ci.yml", "run: pnpm --filter @acme/a test\n");
    write(root, "CLAUDE.md", "The package @acme/b.\n");
    write(root, "pnpm-lock.yaml", "'@acme/b': link\n");
    write(root, "packages/a/node_modules/@acme/b/package.json", JSON.stringify({ name: "@acme/b" }));
    write(root, "packages/a/dist/index.js", `import "@acme/b";\n`);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("changes sources, tests, configuration files, tsconfig.json, documents and workflows", async () => {
    const changes = await planRename(root, "acme", "zeta");
    const changed = changes.map((change) => relative(root, change.path).replace(/\\/g, "/")).sort();
    expect(changed).toEqual([
      ".github/workflows/ci.yml",
      "CLAUDE.md",
      "package.json",
      "packages/a/README.md",
      "packages/a/e2e/run.ts",
      "packages/a/package.json",
      "packages/a/src/index.ts",
      "packages/a/test/a.test.ts",
      "packages/a/tsconfig.json",
      "packages/a/vitest.config.ts",
      "packages/b/package.json",
    ]);
  });

  it("keeps the packages of other repositories, the lockfile, node_modules and dist", async () => {
    const changes = await planRename(root, "acme", "zeta");
    const after = new Map(changes.map((change) => [relative(root, change.path).replace(/\\/g, "/"), change.after]));
    expect(after.get("package.json")).toContain('"zeta-monorepo"');
    expect(after.get("package.json")).toContain('"@acme/ste-lint"');
    expect(after.get("packages/a/package.json")).toContain('"@zeta/b":"workspace:*"');
    expect(after.get("packages/a/package.json")).toContain('"@acme/cue":"github:acme/cue#main"');
    expect(after.get("packages/a/src/index.ts")).toBe(`import { b } from "@zeta/b";\nimport { cue } from "@acme/cue";\n`);
    expect(after.get("packages/a/e2e/run.ts")).toBe(`import "@zeta/b/register";\n`);
    expect(after.get("packages/a/README.md")).toBe("Use @zeta/a. It needs @zeta/b, and @acme/cue from its own repository.\n");
  });

  it("changes only whole package names", () => {
    const names = new Set(["client", "client-lib"]);
    expect(rewriteText("@acme/client @acme/client-lib @acme/client-git @acme/clientx", "acme", "zeta", names, false)).toBe(
      "@zeta/client @zeta/client-lib @acme/client-git @acme/clientx",
    );
  });
});
