/**
 * These tests compare the dot-entry match of `fs.glob` before and after its move to `@mark1russell7/files`
 * (roadmap R4, CA14). The old matcher is kept here as a fixture. The tests pin each difference.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, posix, resolve } from "node:path";
import { matchesGlob } from "@mark1russell7/files";
import { glob } from "./glob.js";
import { GlobInputSchema } from "../../types.js";

// The old matcher: a leading "." of each name became a character that a name cannot hold.
const DOT = "\u0001";
const hideDots = (path: string): string =>
  path
    .split("/")
    .map((name) => (name.startsWith(".") && name !== "." && name !== ".." ? DOT + name.slice(1) : name))
    .join("/");
const oldMatch = (path: string, pattern: string): boolean => posix.matchesGlob(hideDots(path), hideDots(pattern));
const oldFolderIgnored = (path: string, pattern: string): boolean =>
  oldMatch(path, pattern) || posix.matchesGlob(`${hideDots(path)}/${DOT}`, hideDots(pattern));
const newMatch = (path: string, pattern: string): boolean => matchesGlob(path, pattern, { dot: true });
const newFolderIgnored = (path: string, pattern: string): boolean => newMatch(path, pattern) || newMatch(`${path}/`, pattern);

const patterns = ["*", "**", "**/*", "*.ts", "**/*.ts", "a/**", "a/*", "a/**/*", ".*", "**/.*", ".git/**", "**/.git/**", "a/?", "a/[bc]", "a/[!b]", "{a,b}/*", "a/{b,.c}", "**/b", "a/**/b", "a", "a/b", "*/b", ".a/*", "?a", "**/a/**"];
const paths = ["a", "b", "a/b", "a/c", "a/.c", ".a", ".a/b", "a/b/c", "a/.b/c", ".git", ".git/config", "x.ts", "a/x.ts", ".x.ts", "a/.x.ts", "a/b/b", "b/c", "ba", ".b"];

describe("the dot-entry match of fs.glob moves to @mark1russell7/files (CA14)", () => {
  it("gives the old match for each pair, except the named differences", () => {
    const differences: string[] = [];
    for (const pattern of patterns) {
      for (const path of paths) {
        if (oldMatch(path, pattern) !== newMatch(path, pattern)) differences.push(`match ${pattern} ${path} ${newMatch(path, pattern)}`);
      }
    }
    // "x/**" also matches the folder "x", as the node:fs glob does without dot. A brace with a dot name matches.
    expect(differences).toEqual(["match a/** a true", "match .git/** .git true", "match **/.git/** .git true", "match a/{b,.c} a/.c true", "match **/a/** a true"]);
  });

  it("prunes the old folders, except the named differences", () => {
    const differences: string[] = [];
    for (const pattern of patterns) {
      for (const path of paths) {
        if (oldFolderIgnored(path, pattern) !== newFolderIgnored(path, pattern)) differences.push(`${pattern} ${path} ${newFolderIgnored(path, pattern)}`);
      }
    }
    // Before, an ignore of "**/.*", "a/?" or "a/[!b]" pruned folders with no ignored contents.
    const pruned = differences.filter((line) => line.startsWith("**/.* ")).map((line) => line.split(" ")[1]);
    expect(pruned).toEqual(paths.filter((path) => !/(^|\/)\.[^/]*$/.test(path)));
    expect(differences.filter((line) => !line.startsWith("**/.* "))).toEqual(["a/? a false", "a/[!b] a false", "a/{b,.c} a/.c true"]);
  });
});

describe("fs.glob with dot: true, after the move", () => {
  let root: string;
  const run = (input: Record<string, unknown>) => glob(GlobInputSchema.parse(input));

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "fs-glob-home-"));
    for (const file of ["a/q.ts", "a/b/r.ts", "a/.e.ts", ".git/config"]) {
      mkdirSync(join(root, file, ".."), { recursive: true });
      writeFileSync(join(root, file), "");
    }
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("gives the folder of x/** as the glob without dot does", async () => {
    const withDot = await run({ pattern: "a/**", cwd: root, dot: true });
    const withoutDot = await run({ pattern: "a/**", cwd: root });
    expect(withDot.matches).toEqual(["a", "a/.e.ts", "a/b", "a/b/r.ts", "a/q.ts"]);
    expect(withoutDot.matches).toEqual(withDot.matches.filter((path) => path !== "a/.e.ts"));
  });

  it("enters the folders when the ignore pattern is a dot name or one character", async () => {
    expect((await run({ pattern: "**/*.ts", cwd: root, dot: true, ignore: ["**/.*"] })).matches).toEqual(["a/b/r.ts", "a/q.ts"]);
    expect((await run({ pattern: "**/*.ts", cwd: root, dot: true, ignore: ["a/?"] })).matches).toEqual(["a/.e.ts", "a/q.ts"]);
  });
});

/** The old walk of `fs.glob` with `dot: true`, before its move to `findEntries`, kept as a fixture. */
async function oldWalkWithDots(root: string, pattern: string, ignore: readonly string[]): Promise<string[]> {
  const isIgnored = (path: string): boolean => ignore.some((glob) => newMatch(path, glob));
  const folderIgnored = (path: string): boolean => isIgnored(path) || isIgnored(`${path}/`);
  const matches: string[] = [];
  async function visit(relative: string): Promise<void> {
    for (const entry of await readdir(relative ? resolve(root, relative) : root, { withFileTypes: true })) {
      const path = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (folderIgnored(path)) continue;
        if (newMatch(path, pattern)) matches.push(path);
        await visit(path);
      } else if (newMatch(path, pattern) && !isIgnored(path)) {
        matches.push(path);
      }
    }
  }
  await visit("");
  return matches.sort();
}

describe("the dot walk of fs.glob moves to findEntries of @mark1russell7/files (CA14)", () => {
  let root: string;
  const files = ["a/q.ts", "a/b/r.ts", "a/.e.ts", "a/.c/s.ts", ".git/config", "node_modules/m/i.js", "b/c", "b/.d/t", "x.ts", ".x.ts"];

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "fs-glob-walk-"));
    for (const file of files) {
      mkdirSync(join(root, file, ".."), { recursive: true });
      writeFileSync(join(root, file), "");
    }
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("gives the old matches for each pattern and ignore list", async () => {
    const ignores: string[][] = [[], ["**/.*"], ["a/**"], ["a/*"], ["**/node_modules/**"], [".git/**", "b/?"], ["a/b", "**/*.js"], ["a/[!b]"], ["a/q.ts"]];
    const literals = [".", "a", "a/q.ts", "a/b", ".git", "node_modules/m", "b/.d/t", "missing"];
    const differences: string[] = [];
    for (const pattern of [...patterns, ...literals]) {
      for (const ignore of ignores) {
        const before = await oldWalkWithDots(root, pattern, ignore);
        const after = (await glob(GlobInputSchema.parse({ pattern, cwd: root, dot: true, ignore }))).matches;
        if (JSON.stringify(before) !== JSON.stringify(after)) differences.push(`${pattern} [${ignore.join(",")}] ${JSON.stringify(before)} ${JSON.stringify(after)}`);
      }
    }
    expect(differences).toEqual([]);
  });

  it("matches a pattern that starts with ./ or that is absolute", async () => {
    // Before, these patterns matched nothing, because the walk compared them with relative paths.
    expect((await glob(GlobInputSchema.parse({ pattern: "./a/*.ts", cwd: root, dot: true }))).matches).toEqual(["a/.e.ts", "a/q.ts"]);
    expect((await glob(GlobInputSchema.parse({ pattern: `${root}/a/*.ts`, cwd: root, dot: true }))).matches).toEqual(["a/.e.ts", "a/q.ts"]);
  });
});
