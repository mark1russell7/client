/**
 * Locate the vitest CLI of a project.
 *
 * The procedures run vitest as `node <vitest.mjs> ...args` with no shell:
 * - no shell means test patterns cannot inject commands;
 * - running the project's own vitest (instead of `npx vitest`) never downloads a package,
 *   and avoids the .cmd shim that Node cannot spawn without a shell on Windows.
 */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";

export function resolveVitestCli(cwd: string): string {
  const require = createRequire(join(resolve(cwd), "package.json"));
  let packageJsonPath: string;
  try {
    packageJsonPath = require.resolve("vitest/package.json");
  } catch {
    throw new Error(`vitest is not installed for ${cwd}. Add it as a devDependency.`);
  }
  const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { bin?: string | Record<string, string> };
  const bin = typeof pkg.bin === "string" ? pkg.bin : pkg.bin?.["vitest"];
  if (!bin) {
    throw new Error(`The vitest package at ${dirname(packageJsonPath)} has no "vitest" bin.`);
  }
  return join(dirname(packageJsonPath), bin);
}
