/// <reference types="node" />
/**
 * The "Use it" code of a procedure page runs: the test writes the code of core procedures to
 * files and runs them with Node against the built `@procedures/client`.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { execFile } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { procedureByKey } from "../data";
import { exampleInput, usageCode } from "./usage";

const run = promisify(execFile);
const folder = fileURLToPath(new URL("../../node_modules/.cache/usage", import.meta.url));

beforeAll(() => {
  mkdirSync(folder, { recursive: true });
});

describe("the usage of a procedure", () => {
  for (const key of ["client.add", "client.range", "client.toUpper"]) {
    it(`${key}: the TypeScript code runs`, async () => {
      const procedure = procedureByKey(key);
      expect(procedure).toBeDefined();
      const file = join(folder, `${key}.mjs`);
      writeFileSync(file, usageCode(procedure!, "@procedures/client"));
      const { stdout } = await run(process.execPath, [file], { timeout: 30_000 });
      expect(() => JSON.parse(stdout)).not.toThrow();
    });
  }

  it("gives the required fields of a core procedure from its typed fields", () => {
    expect(exampleInput(procedureByKey("client.add")!)).toEqual({ a: 1, b: 1 });
  });

  it("imports the package of another procedure", () => {
    const code = usageCode(procedureByKey("git.status")!, "@procedures/git");
    expect(code).toContain('import "@procedures/git/register";');
    expect(code).toContain('client.exec(["git","status"], {})');
  });
});
