// Importing a package registers nothing (ARCHITECTURE-PROPOSALS-2026-10, P9, decided 2026-10-13).
//
// For each public package, this script imports each entry of the exports map except `./register`
// in a new Node process. Then the global registry must have no procedure. Each `./register` entry,
// in its own new process, must register at least one procedure. The `sideEffects` field of each
// package must name only `./dist/register.js`, so that a bundler can drop the rest.
//
// Start it after `pnpm build`: node scripts/check-side-effects.mjs. Exit code 1 on a failure.

import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { publicPackages } from "./lib/workspace.mjs";

const REGISTER = new Set(["./register", "./register.js"]);

/** The file of an exports entry (the "import" condition), or undefined for a pattern or a non-JS entry. */
function fileOf(target) {
  const file = typeof target === "string" ? target : target?.import ?? target?.default;
  return typeof file === "string" && file.endsWith(".js") && !file.includes("*") ? file : undefined;
}

/**
 * This function imports the files in a new process from the folder of the package, and gives
 * the number of procedures in the global registry after the imports, or the error.
 */
function proceduresAfter(pkg, files) {
  const code = [
    `for (const file of ${JSON.stringify(files.map((file) => pathToFileURL(join(pkg.path, file)).href))}) await import(file);`,
    `const registry = globalThis[Symbol.for("@procedures/client/PROCEDURE_REGISTRY")];`,
    `console.log(JSON.stringify({ count: registry ? registry.getAll().length : 0 }));`,
  ].join("\n");
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", code], { cwd: pkg.path, encoding: "utf8", timeout: 60_000 });
  const line = result.stdout.trim().split("\n").pop() ?? "";
  try {
    return JSON.parse(line).count;
  } catch {
    return `the import failed: ${(result.stderr || result.stdout).trim().split("\n").slice(-3).join(" ")}`;
  }
}

const failures = [];
let checked = 0;
for (const pkg of publicPackages()) {
  const exportsMap = pkg.manifest.exports ?? {};
  const entries = typeof exportsMap === "string" ? { ".": exportsMap } : exportsMap;
  const plain = [];
  const registers = [];
  for (const [key, target] of Object.entries(entries)) {
    const file = fileOf(target);
    if (!file) continue;
    (REGISTER.has(key) ? registers : plain).push(file);
  }

  if (plain.length > 0) {
    const count = proceduresAfter(pkg, plain);
    if (count !== 0) failures.push(`${pkg.name}: importing ${plain.join(", ")} gives ${typeof count === "number" ? `${count} procedures in the global registry` : count}`);
    checked++;
  }
  for (const file of [...new Set(registers)]) {
    const count = proceduresAfter(pkg, [file]);
    if (typeof count !== "number" || count === 0) failures.push(`${pkg.name}: ${file} registers no procedure (${count})`);
  }

  const sideEffects = pkg.manifest.sideEffects;
  if (sideEffects !== false && sideEffects !== undefined) {
    const others = Array.isArray(sideEffects) ? sideEffects.filter((file) => file !== "./dist/register.js") : [String(sideEffects)];
    if (others.length > 0) failures.push(`${pkg.name}: sideEffects names ${others.join(", ")} (only ./dist/register.js has a side effect)`);
  } else if (registers.length > 0) {
    failures.push(`${pkg.name}: sideEffects does not name ./dist/register.js, so a bundler can drop the register entry`);
  }
}

// When no package is checked, the check examined nothing: that is a failure, not a pass
if (checked === 0) failures.push("no public package of packages/ has an exports entry with a .js file. The check expected the exports of the public packages");

if (failures.length > 0) {
  console.error(`${failures.length} problems:\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
console.log(`The imports of ${checked} packages register nothing, and each register entry registers its procedures.`);
