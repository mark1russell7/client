/// <reference types="node" />
/**
 * The TypeScript tab gives code that runs (deep dive SITE-2). Before, the code made
 * `new Client(new LocalTransport())` without the core procedures, so 7 of 8 examples threw
 * "No handler registered". This test writes the code of each example to a file, runs it with
 * Node against the built `@mark1russell7/client`, and compares its output with the result of the
 * Composer runtime.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { execFile } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { promisify } from "node:util";
import { examples } from "./examples";
import { runProgram } from "./runtime";
import { toTypeScript } from "./program";

const run = promisify(execFile);

// A folder in the site package, so Node finds @mark1russell7/client in its node_modules
const folder = fileURLToPath(new URL("../../node_modules/.cache/typescript-tab", import.meta.url));

beforeAll(() => {
  mkdirSync(folder, { recursive: true });
});

describe("the TypeScript tab", () => {
  for (const example of examples) {
    it(`${example.id}: the code runs and gives the result of the Composer`, async () => {
      const code = toTypeScript(example.program);
      // The code has no type annotations, so it is also JavaScript
      const file = join(folder, `${example.id}.mjs`);
      writeFileSync(file, code);
      const { stdout } = await run(process.execPath, [file], { timeout: 30_000 });
      const composer = await runProgram(example.program);
      expect(composer.ok).toBe(true);
      expect(JSON.parse(stdout)).toEqual(JSON.parse(JSON.stringify(composer.value)));
    });
  }

  it("imports the package of a procedure that is not in the core", () => {
    const code = toTypeScript({ $proc: ["git", "status"], input: {} }, (key) =>
      key.startsWith("git.") ? "@mark1russell7/client-git" : undefined,
    );
    expect(code).toContain('import "@mark1russell7/client-git";');
    expect(code).toContain("PROCEDURE_REGISTRY.register(procedure)");
  });
});
