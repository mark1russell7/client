// Check that every manifest package's committed dist/ is not stale relative to its src/.
//
// The ecosystem installs packages via github:#main and ships committed dist/, so a package whose
// dist/ is older than its src/ (or missing) ships stale/absent code to consumers. This was the
// single biggest hygiene failure in the July 2026 audit. Run this before pushing, or in CI.
//
// Usage:   node documentation/scripts/check-build-freshness.mjs
// Exit 0 if all fresh; exit 1 if any package is STALE or MISSING dist.

import { readFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const manifest = JSON.parse(readFileSync(join(ROOT, "ecosystem", "ecosystem.manifest.json"), "utf8"));

// Newest mtime (ms) of any file under dir matching a predicate; 0 if none / dir absent.
function newestMtime(dir, keep) {
  if (!existsSync(dir)) return 0;
  let newest = 0;
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    let entries;
    try {
      entries = readdirSync(d, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const full = join(d, e.name);
      if (e.isDirectory()) {
        if (e.name === "node_modules" || e.name === ".git") continue;
        stack.push(full);
      } else if (keep(e.name)) {
        const m = statSync(full).mtimeMs;
        if (m > newest) newest = m;
      }
    }
  }
  return newest;
}

// Test files (*.test.ts / *.spec.ts) are not emitted to dist, so exclude them — otherwise editing
// a test falsely makes src look "newer than dist".
const isSrc = (n) =>
  n.endsWith(".ts") && !n.endsWith(".d.ts") && !n.endsWith(".test.ts") && !n.endsWith(".spec.ts");
const isDist = (n) => n.endsWith(".js") || n.endsWith(".d.ts");

const stale = [];
const missing = [];
const noSrc = [];
let fresh = 0;

for (const { path: rel } of Object.values(manifest.packages)) {
  const pkg = join(ROOT, rel);
  const srcDir = join(pkg, "src");
  const distDir = join(pkg, "dist");
  const srcMtime = newestMtime(srcDir, isSrc);
  if (srcMtime === 0) {
    noSrc.push(rel); // no TS sources (e.g. ecosystem/docs) — nothing to build
    continue;
  }
  if (!existsSync(distDir)) {
    missing.push(rel);
    continue;
  }
  const distMtime = newestMtime(distDir, isDist);
  if (distMtime === 0) {
    missing.push(rel);
  } else if (srcMtime > distMtime + 1000) {
    // 1s grace for filesystem timestamp resolution.
    stale.push(rel);
  } else {
    fresh++;
  }
}

console.error(`fresh: ${fresh} | stale: ${stale.length} | missing dist: ${missing.length} | no src: ${noSrc.length}`);
if (stale.length) console.error(`STALE (src newer than dist — rebuild + commit):\n  ${stale.join("\n  ")}`);
if (missing.length) console.error(`MISSING dist:\n  ${missing.join("\n  ")}`);

process.exit(stale.length || missing.length ? 1 : 0);
