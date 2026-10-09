/**
 * `client discover` and `client announce` (deep dive CORE-17).
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discoverPackages, generateCode } from "./discover.js";
import { announce, getRegistry } from "./announce.js";

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "discover-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** Write a package.json (and its procedures file) under a folder. */
function pkg(dir: string, manifest: Record<string, unknown>, proceduresFile?: string): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "package.json"), JSON.stringify(manifest, null, 2));
  if (proceduresFile) {
    mkdirSync(join(dir, proceduresFile, ".."), { recursive: true });
    writeFileSync(join(dir, proceduresFile), "");
  }
}

describe("client discover", () => {
  it("finds a hoisted transitive dependency", async () => {
    pkg(root, { name: "app", dependencies: { a: "1" } });
    pkg(join(root, "node_modules", "a"), { name: "a", dependencies: { b: "1" } });
    pkg(join(root, "node_modules", "b"), { name: "b", client: { procedures: "./dist/register.js" } }, "dist/register.js");

    const found = await discoverPackages(root, false);
    expect(found.map((p) => p.name)).toEqual(["b"]);
  });

  it("imports a path that the exports map allows", async () => {
    pkg(root, { name: "app", dependencies: { c: "1", d: "1", e: "1", f: "1" } });
    pkg(
      join(root, "node_modules", "c"),
      { name: "c", exports: { ".": "./dist/index.js", "./register": { import: "./dist/register.js" } }, client: { procedures: "./dist/register.js" } },
      "dist/register.js"
    );
    pkg(
      join(root, "node_modules", "d"),
      { name: "d", exports: { ".": { import: "./dist/index.js" } }, client: { procedures: "./dist/register.js" } },
      "dist/register.js"
    );
    pkg(join(root, "node_modules", "e"), { name: "e", client: { procedures: "./dist/register.js" } }, "dist/register.js");
    pkg(
      join(root, "node_modules", "f"),
      { name: "f", exports: { "./*": "./dist/*.js" }, client: { procedures: "./dist/register.js" } },
      "dist/register.js"
    );

    const code = generateCode(await discoverPackages(root, false));
    expect(code).toContain('import "c/register";');
    // The exports map has no path for the file: the package root registers its procedures
    expect(code).toContain('import "d";');
    expect(code).toContain('import "e/dist/register.js";');
    expect(code).toContain('import "f/register";');
  });
});

describe("client announce", () => {
  it("does not edit the package.json of the consumer without the propagate option", async () => {
    pkg(root, { name: "app", scripts: {} });
    const dir = join(root, "node_modules", "lib");
    pkg(dir, { name: "lib", client: { procedures: "./dist/register.js" } }, "dist/register.js");

    await announce({ verbose: false, cwd: dir });
    expect(JSON.parse(readFileSync(join(root, "package.json"), "utf8")).scripts).toEqual({});
    expect((await getRegistry(root)).packages["lib"]?.proceduresPath).toBe("./dist/register.js");

    await announce({ verbose: false, cwd: dir, propagate: true });
    expect(JSON.parse(readFileSync(join(root, "package.json"), "utf8")).scripts.postinstall).toBe("client announce");
  });

  it("keeps every entry when several packages announce at the same time, and leaves no temp file", async () => {
    pkg(root, { name: "app" });
    const names = Array.from({ length: 8 }, (_, i) => `lib${i}`);
    for (const name of names) {
      pkg(join(root, "node_modules", name), { name, client: { procedures: "./dist/register.js" } }, "dist/register.js");
    }

    await Promise.all(names.map((name) => announce({ verbose: false, cwd: join(root, "node_modules", name) })));

    expect(Object.keys((await getRegistry(root)).packages).sort()).toEqual(names);
    expect(readdirSync(root).filter((file) => file !== "package.json" && file !== "node_modules")).toEqual([".client-registry.json"]);
  });
});
