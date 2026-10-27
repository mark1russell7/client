/**
 * The published declarations of each entry other than `./node` name no Node module, no `express`
 * and no `ws` (CLI-6, CLI-61). A project that checks the declarations of its libraries
 * (`skipLibCheck: false`) then needs no `@types/node`, `@types/express` or `@types/ws` for these
 * entries, and a browser project gets no Node types from them.
 *
 * The test reads the `.d.ts` files in `dist/`, as the API snapshot test does. From the file of each
 * entry, it follows each relative import and export. It does not follow the declarations of other
 * packages. Start `pnpm build` first, as CI does.
 */

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { builtinModules } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { statementsOf } from "../../../scripts/lib/api-report.mjs";

const PACKAGE = join(dirname(fileURLToPath(import.meta.url)), "..");

/** The entries whose declarations can name Node types: the Node entry only. */
const NODE_ENTRIES = new Set(["./node"]);

const BUILTINS = new Set(builtinModules.map((name) => name.replace(/^node:/, "")));

/** True when a module name in a declaration file is a Node module, `express` or `ws`. */
function isNodeModule(specifier: string): boolean {
  if (specifier.startsWith("node:") || BUILTINS.has(specifier.split("/")[0]!)) return true;
  return /^(?:express|express-serve-static-core|ws|@types\/(?:node|express|express-serve-static-core|ws))(?:\/|$)/.test(specifier);
}

/** A name of a declaration file that refers to Node types, and the file that names it. */
interface NodeReference {
  readonly file: string;
  readonly name: string;
}

/**
 * This function follows the declaration files of one entry, and gives each reference to Node types:
 * an import of a Node module, `express` or `ws`, a triple-slash reference, or a global of
 * `@types/node` (`NodeJS`, `Buffer`).
 */
function nodeReferencesOf(typesFile: string): { references: NodeReference[]; files: number } {
  const dist = join(PACKAGE, "dist");
  const references: NodeReference[] = [];
  const seen = new Set<string>();
  const queue = [resolve(PACKAGE, typesFile)];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const name = relative(dist, file).split("\\").join("/");
    const source = readFileSync(file, "utf8");
    if (/^\/\/\/\s*<reference\s/m.test(source)) references.push({ file: name, name: "/// <reference>" });
    const code = statementsOf(source).join("\n");
    if (/\bNodeJS\./.test(code)) references.push({ file: name, name: "NodeJS" });
    if (/\bBuffer\b/.test(code)) references.push({ file: name, name: "Buffer" });
    for (const match of code.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|^import\s+)["']([^"']+)["']/gm)) {
      const specifier = match[1]!;
      if (!specifier.startsWith(".")) {
        if (isNodeModule(specifier)) references.push({ file: name, name: specifier });
        continue;
      }
      const base = resolve(dirname(file), specifier);
      const target = [base.replace(/\.js$/, ".d.ts"), `${base}.d.ts`, join(base, "index.d.ts")].find((candidate) => existsSync(candidate));
      if (!target) throw new Error(`${name} imports ${specifier}, and no declaration file has that name`);
      queue.push(target);
    }
  }
  return { references, files: seen.size };
}

interface Manifest {
  exports: Record<string, { types: string }>;
}

const manifest = JSON.parse(readFileSync(join(PACKAGE, "package.json"), "utf8")) as Manifest;
const entries = Object.entries(manifest.exports).map(([subpath, target]) => ({ subpath, types: target.types }));

describe("the declarations of the entries name no Node types (CLI-6, CLI-61)", () => {
  it.each(entries.filter((entry) => !NODE_ENTRIES.has(entry.subpath)))("$subpath names no Node module, express or ws", ({ types }) => {
    expect(existsSync(join(PACKAGE, types)), `${types} is missing: start pnpm build first`).toBe(true);
    const { references, files } = nodeReferencesOf(types);
    expect(files).toBeGreaterThan(0);
    expect(references).toEqual([]);
  });

  it("the check finds the Node types of ./node: express, ws and node:http", () => {
    const node = entries.find((entry) => entry.subpath === "./node");
    expect(node).toBeDefined();
    const names = new Set(nodeReferencesOf(node!.types).references.map((reference) => reference.name));
    expect(names).toContain("express");
    expect(names).toContain("ws");
    expect(names).toContain("node:http");
  });

  it("names the root, ./browser and ./server among the checked entries", () => {
    const checked = entries.map((entry) => entry.subpath).filter((subpath) => !NODE_ENTRIES.has(subpath));
    expect(checked).toEqual(expect.arrayContaining([".", "./browser", "./server"]));
  });

  it("finds a Node module with and without the prefix node:, express and ws", () => {
    for (const specifier of ["node:http", "http", "stream", "fs/promises", "express", "express-serve-static-core", "ws", "@types/node"]) {
      expect(isNodeModule(specifier), specifier).toBe(true);
    }
    for (const specifier of ["zod", "@mark1russell7/service/clock", "wsx", "expressive", "@procedures/client"]) {
      expect(isNodeModule(specifier), specifier).toBe(false);
    }
  });
});
