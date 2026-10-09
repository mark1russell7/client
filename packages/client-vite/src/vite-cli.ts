/**
 * Locate the vite CLI of a project.
 *
 * The procedures run vite as `node <vite.js> ...args` with no shell. Before, they ran
 * `npx vite` with `shell: true`: `host`, `mode` and `outDir` reached the shell unescaped
 * (deep dive WRP-8), and npx could download vite when the project did not have it.
 */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";

export function resolveViteCli(cwd: string): string {
  const require = createRequire(join(resolve(cwd), "package.json"));
  let packageJsonPath: string;
  try {
    packageJsonPath = require.resolve("vite/package.json");
  } catch {
    throw new Error(`vite is not installed for ${cwd}. Add it as a devDependency.`);
  }
  const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { bin?: string | Record<string, string> };
  const bin = typeof pkg.bin === "string" ? pkg.bin : pkg.bin?.["vite"];
  if (!bin) {
    throw new Error(`The vite package at ${dirname(packageJsonPath)} has no "vite" bin.`);
  }
  return join(dirname(packageJsonPath), bin);
}

/** A value that vite reads as an argument (a mode, a folder, a host): it must not start with "-". */
export function viteArg(name: string, value: string): string {
  if (value.startsWith("-")) {
    throw new Error(`Invalid ${name} (starts with "-"): ${value}`);
  }
  return value;
}
