/**
 * fs.glob: `ignore`, `absolute`, `dot` and `cwd` (deep dive DATA-7).
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { glob } from "./glob.js";
import { GlobInputSchema } from "../../types.js";

let root: string;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "fs-glob-"));
  for (const file of ["a/q.ts", "a/node_modules/x/p.ts", "b/r.tsx", "b/.dot.ts", ".hidden/h.ts", "dist/d.ts", ".git/config", ".env", ".npmrc", ".github/a.md", "docs/b.md"]) {
    mkdirSync(join(root, file, ".."), { recursive: true });
    writeFileSync(join(root, file), "");
  }
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

function run(input: Record<string, unknown>) {
  return glob(GlobInputSchema.parse(input));
}

describe("fs.glob", () => {
  it("matches relative to cwd, with / separators, sorted", async () => {
    const result = await run({ pattern: "**/*.{ts,tsx}", cwd: root });
    expect(result.matches).toEqual(["a/node_modules/x/p.ts", "a/q.ts", "b/r.tsx", "dist/d.ts"]);
  });

  it("keeps the ignore option (the schema stripped it before)", () => {
    expect(GlobInputSchema.parse({ pattern: "*", ignore: ["x"] }).ignore).toEqual(["x"]);
  });

  it("leaves out the ignored paths", async () => {
    const result = await run({ pattern: "**/*.{ts,tsx}", cwd: root, ignore: ["**/node_modules/**", "dist/**"] });
    expect(result.matches).toEqual(["a/q.ts", "b/r.tsx"]);
  });

  it("returns absolute paths, resolved against cwd", async () => {
    const result = await run({ pattern: "a/*.ts", cwd: root, absolute: true });
    expect(result.matches).toEqual([resolve(root, "a/q.ts")]);
  });

  it("includes dot entries with dot: true, and still applies ignore", async () => {
    const result = await run({ pattern: "**/*.ts", cwd: root, dot: true, ignore: ["**/node_modules/**"] });
    expect(result.matches).toEqual([".hidden/h.ts", "a/q.ts", "b/.dot.ts", "dist/d.ts"]);
  });

  it("matches an explicit dot pattern with dot: true", async () => {
    const result = await run({ pattern: ".hidden/*.ts", cwd: root, dot: true });
    expect(result.matches).toEqual([".hidden/h.ts"]);
  });

  it("matches a dot name in a brace group of the pattern with dot: true", async () => {
    const result = await run({ pattern: "{.github,docs}/**/*.md", cwd: root, dot: true });
    expect(result.matches).toEqual([".github/a.md", "docs/b.md"]);
  });

  it("ignores a dot name in a brace group of an ignore entry with dot: true", async () => {
    const ignore = ["**/{.git,node_modules}/**", "{.env,.npmrc}", "{.github,docs,.hidden}/**"];
    const result = await run({ pattern: "**/*", cwd: root, dot: true, ignore });
    expect(result.matches).toEqual(["a", "a/q.ts", "b", "b/.dot.ts", "b/r.tsx", "dist", "dist/d.ts"]);
  });

  it("gives the folder of a pattern b/** with dot: true, as fs.glob without dot does", async () => {
    expect((await run({ pattern: "b/**", cwd: root, dot: true })).matches).toEqual(["b", "b/.dot.ts", "b/r.tsx"]);
    expect((await run({ pattern: "b/**", cwd: root })).matches).toEqual(["b", "b/r.tsx"]);
  });

  it("keeps the walk out of a folder only when an ignore pattern matches the folder or each entry in it", async () => {
    const result = await run({ pattern: "**", cwd: root, dot: true, ignore: ["**/.*"] });
    expect(result.matches).toEqual([
      "a", "a/node_modules", "a/node_modules/x", "a/node_modules/x/p.ts", "a/q.ts",
      "b", "b/r.tsx", "dist", "dist/d.ts", "docs", "docs/b.md",
    ]);
    // "a/*" also matches "a/", thus it ignores the folder a. "b/?????" ignores only b/r.tsx.
    const below = await run({ pattern: "**", cwd: root, dot: true, ignore: ["b/?????", "a/*"] });
    expect(below.matches.filter((path) => path.startsWith("a") || path.startsWith("b"))).toEqual(["b", "b/.dot.ts"]);
  });

  it("matches a pattern that starts with ./ with dot: true", async () => {
    expect((await run({ pattern: "./b/*", cwd: root, dot: true })).matches).toEqual(["b/.dot.ts", "b/r.tsx"]);
  });
});
