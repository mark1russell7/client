/**
 * Locate the vitest CLI of a project, and build safe vitest arguments.
 *
 * The procedures run vitest as `node <vitest.mjs> ...args` through shell.run (no shell):
 * - no shell means a test pattern cannot inject a command;
 * - the project's own vitest is used, so nothing is downloaded and no .cmd shim is needed.
 *
 * (client-vitest has the same resolver. The two packages overlap; see DECISIONS-2026-10.md.)
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

/**
 * Reject a value that the vitest CLI would read as an option
 */
export function assertNotOption(name: string, value: string): string {
  if (value.startsWith("-")) {
    throw new Error(`Invalid ${name} (starts with "-"): ${value}`);
  }
  return value;
}
