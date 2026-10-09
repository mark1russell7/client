/**
 * lib.rename end to end in a temporary workspace (deep dive DATA-7).
 *
 * The test runs the registered procedures: lib.rename calls the real fs.glob, fs.read.json and
 * fs.write. Before, lib.rename read `files` from fs.glob (which returns `matches`) and always threw.
 */

import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client, LocalTransport, PROCEDURE_REGISTRY } from "@mark1russell7/client";
import "@mark1russell7/client-fs";
import "../../register.js";
import type { LibRenameOutput } from "../../types.js";

const client = new Client(new LocalTransport({ registry: PROCEDURE_REGISTRY }));
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function write(file: string, content: string): void {
  mkdirSync(join(file, ".."), { recursive: true });
  writeFileSync(file, content);
}

function json(data: unknown): string {
  return JSON.stringify(data, null, 2) + "\n";
}

/** A workspace with the package "old-lib", a user of it, and copies in node_modules and dist. */
function workspace(): string {
  const root = mkdtempSync(join(tmpdir(), "lib-rename-"));
  roots.push(root);
  write(join(root, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n");
  write(join(root, "packages", "old", "package.json"), json({ name: "old-lib", version: "1.0.0" }));
  write(join(root, "packages", "user", "package.json"), json({ name: "user", dependencies: { "old-lib": "workspace:*" } }));
  write(
    join(root, "packages", "user", "src", "index.ts"),
    'import { a } from "old-lib";\nimport { b } from "old-lib/sub";\nexport const c = import("old-lib");\nexport { a, b };\n',
  );
  // The search leaves out node_modules and dist
  write(join(root, "node_modules", "old-lib", "package.json"), json({ name: "old-lib" }));
  write(join(root, "packages", "user", "dist", "index.ts"), 'import { a } from "old-lib";\n');
  return root;
}

function rename(input: Record<string, unknown>): Promise<LibRenameOutput> {
  return client.call({ service: "lib", operation: "rename" }, input);
}

describe("lib.rename", () => {
  it("previews the changes with dryRun", async () => {
    const root = workspace();
    const result = await rename({ oldName: "old-lib", newName: "new-lib", rootPath: root, dryRun: true });

    expect(result.errors).toEqual([]);
    expect(result.success).toBe(true);
    expect(result.summary).toEqual({ packageNames: 1, dependencies: 1, imports: 3, total: 5 });
    // Nothing changes on disk
    expect(readFileSync(join(root, "packages", "old", "package.json"), "utf8")).toContain('"old-lib"');
  });

  it("renames the package, its dependents and the imports, and leaves node_modules and dist", async () => {
    const root = workspace();
    const result = await rename({ oldName: "old-lib", newName: "new-lib", rootPath: root });
    expect(result.success).toBe(true);

    expect(JSON.parse(readFileSync(join(root, "packages", "old", "package.json"), "utf8")).name).toBe("new-lib");
    const user = JSON.parse(readFileSync(join(root, "packages", "user", "package.json"), "utf8"));
    expect(user.dependencies).toEqual({ "new-lib": "workspace:*" });
    const source = readFileSync(join(root, "packages", "user", "src", "index.ts"), "utf8");
    expect(source).toContain('from "new-lib"');
    expect(source).toContain('from "new-lib/sub"');
    expect(source).toContain('import("new-lib")');

    expect(JSON.parse(readFileSync(join(root, "node_modules", "old-lib", "package.json"), "utf8")).name).toBe("old-lib");
    expect(readFileSync(join(root, "packages", "user", "dist", "index.ts"), "utf8")).toContain('"old-lib"');
  });
});
