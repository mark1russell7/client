// Type-check the test files of each package (deep dive SITE-10).
//
// The tsconfig presets of cue exclude `*.test.ts` and `*.spec.ts`, so `pnpm typecheck` does
// not read the tests. For each package with a tsconfig.json, this script writes a temporary
// config next to it. That config extends the package config, includes the whole `src` folder
// with the tests and the `test` folder of their helpers, and emits nothing. Then it starts `tsc -p` on it and deletes it.
//
// The tests can also be in a __tests__ or an e2e folder next to src (roadmap R8: before, the
// script did not read client-docker/__tests__ and mark/e2e).
//
// Usage: node .github/scripts/typecheck-tests.mjs [package-folder ...]
// With no argument, it examines each folder in packages/ that has a test file.
// Exit code: 1 when a package has a type error.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PACKAGES = join(ROOT, "packages");
const TEMP_NAME = "tsconfig.tests.tmp.json";
/** The folders of a package that can hold tests */
const TEST_FOLDERS = ["src", "__tests__", "e2e"];

function hasTests(dir) {
  if (!existsSync(dir)) return false;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory() ? hasTests(path) : /\.(test|spec)\.tsx?$/.test(entry.name)) return true;
  }
  return false;
}

/** The path of the tsc script of the TypeScript that a package uses. */
function typescriptBin(dir) {
  const manifestPath = createRequire(join(dir, "package.json")).resolve("typescript/package.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const bin = typeof manifest.bin === "string" ? manifest.bin : manifest.bin?.tsc;
  if (!bin) throw new Error(`The typescript package at ${dirname(manifestPath)} has no tsc bin`);
  return join(dirname(manifestPath), bin);
}

const requested = process.argv.slice(2);
const folders = (requested.length > 0 ? requested : readdirSync(PACKAGES))
  .map((name) => join(PACKAGES, name))
  .filter((dir) => existsSync(join(dir, "tsconfig.json")) && TEST_FOLDERS.some((folder) => hasTests(join(dir, folder))));

let failed = 0;
for (const dir of folders) {
  const name = relative(ROOT, dir).replace(/\\/g, "/");
  const temp = join(dir, TEMP_NAME);
  writeFileSync(
    temp,
    JSON.stringify(
      {
        extends: "./tsconfig.json",
        // The helpers of the tests can be in a test/ folder next to src/, so the root is the package
        compilerOptions: { noEmit: true, composite: false, incremental: false, declaration: false, declarationMap: false, isolatedDeclarations: false, rootDir: "${configDir}" },
        include: ["${configDir}/src/**/*", "${configDir}/test/**/*", "${configDir}/__tests__/**/*", "${configDir}/e2e/**/*"],
        exclude: ["${configDir}/node_modules", "${configDir}/dist"],
      },
      null,
      2,
    ),
  );
  try {
    // The TypeScript of the package, so each package uses its own version. The bin comes from
    // the package.json of typescript: TypeScript 7 does not export "./bin/tsc".
    const tsc = typescriptBin(dir);
    const result = spawnSync(process.execPath, [tsc, "-p", temp, "--pretty", "false"], { cwd: dir, encoding: "utf8" });
    if (result.status === 0) {
      console.log(`ok    ${name}`);
    } else {
      failed++;
      console.log(`error ${name}`);
      console.log((result.stdout || result.stderr).trimEnd().replace(/^/gm, "      "));
    }
  } finally {
    rmSync(temp, { force: true });
  }
}

console.log(`\n${folders.length - failed} of ${folders.length} packages: the test files type-check.`);
process.exit(failed > 0 ? 1 : 0);
