// Type-check the test files of each package (deep dive SITE-10).
//
// The tsconfig presets of cue exclude `*.test.ts` and `*.spec.ts`, so `pnpm typecheck` does
// not read the tests. For each package with a tsconfig.json, this script writes a temporary
// config next to it. That config extends the package config, includes the whole `src` folder
// with the tests, and emits nothing. Then it starts `tsc -p` on it and deletes it.
//
// Usage: node .github/scripts/typecheck-tests.mjs [package-folder ...]
// With no argument, it examines each folder in packages/ that has a test file.
// Exit code: 1 when a package has a type error.

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PACKAGES = join(ROOT, "packages");
const TEMP_NAME = "tsconfig.tests.tmp.json";

function hasTests(dir) {
  if (!existsSync(dir)) return false;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory() ? hasTests(path) : /\.(test|spec)\.tsx?$/.test(entry.name)) return true;
  }
  return false;
}

// The packages whose tests had type errors when this check started (2026-10-08). The script
// still examines them and prints the errors, but they do not fail the check. Remove a package
// from the list when its tests type-check. Do not add a package.
const KNOWN_FAILING = new Set(["client", "client-collections", "client-dag", "client-git"]);

const requested = process.argv.slice(2);
const folders = (requested.length > 0 ? requested : readdirSync(PACKAGES))
  .map((name) => join(PACKAGES, name))
  .filter((dir) => existsSync(join(dir, "tsconfig.json")) && hasTests(join(dir, "src")));

let failed = 0;
const known = [];
const fixed = [];
for (const dir of folders) {
  const name = relative(ROOT, dir).replace(/\\/g, "/");
  const temp = join(dir, TEMP_NAME);
  writeFileSync(
    temp,
    JSON.stringify(
      {
        extends: "./tsconfig.json",
        compilerOptions: { noEmit: true, composite: false, incremental: false, declaration: false, declarationMap: false, isolatedDeclarations: false },
        include: ["${configDir}/src/**/*"],
        exclude: ["${configDir}/node_modules", "${configDir}/dist"],
      },
      null,
      2,
    ),
  );
  try {
    // The TypeScript of the package, so each package uses its own version
    const tsc = createRequire(join(dir, "package.json")).resolve("typescript/bin/tsc");
    const result = spawnSync(process.execPath, [tsc, "-p", temp, "--pretty", "false"], { cwd: dir, encoding: "utf8" });
    const folder = relative(PACKAGES, dir);
    if (result.status === 0) {
      console.log(`ok    ${name}`);
      if (KNOWN_FAILING.has(folder)) fixed.push(folder);
    } else {
      const output = (result.stdout || result.stderr).trimEnd();
      const errors = output.split("\n").filter((line) => line.includes("error TS")).length;
      if (KNOWN_FAILING.has(folder)) {
        known.push(folder);
        console.log(`known ${name} (${errors} errors, in the list of known failures)`);
      } else {
        failed++;
        console.log(`error ${name}`);
      }
      console.log(output.replace(/^/gm, "      "));
    }
  } finally {
    rmSync(temp, { force: true });
  }
}

console.log(`\n${folders.length - failed - known.length} of ${folders.length} packages: the test files type-check.`);
if (known.length > 0) console.log(`Known failures (they do not fail the check): ${known.join(", ")}.`);
if (fixed.length > 0) console.log(`These packages type-check now. Remove them from KNOWN_FAILING: ${fixed.join(", ")}.`);
process.exit(failed > 0 ? 1 : 0);
