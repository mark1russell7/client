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
  for (const file of ["a/q.ts", "a/node_modules/x/p.ts", "b/r.tsx", "b/.dot.ts", ".hidden/h.ts", "dist/d.ts"]) {
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
});
