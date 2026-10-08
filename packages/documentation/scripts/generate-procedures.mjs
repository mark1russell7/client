// Generate PROCEDURES.md from the live procedure registry.
//
// The registry (PROCEDURE_REGISTRY) is a globalThis Symbol.for singleton, so every package's
// client copy registers into the same registry. We import each workspace package's built
// dist/register.js (which auto-registers its procedures), then introspect the registry and
// emit a grouped markdown catalog. This replaces the hand-maintained PROCEDURES.md that drifted.
//
// Usage:  node packages/documentation/scripts/generate-procedures.mjs   (from the repo root)
// Requires each package to be built (`pnpm build`). Packages that fail to load are reported
// and skipped, not fatal.

import { writeFileSync, existsSync, readdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DOCS = join(HERE, "..");                 // packages/documentation/
const ROOT = join(DOCS, "..");                 // packages/

const packages = readdirSync(ROOT, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

const loaded = [];
const failed = [];

// Aggregator bundles re-import the same client-* members, so loading them only produces
// "already registered" noise. Their procedures are already covered by loading the members
// individually below.
const SKIP = new Set(["bundle-dev", "bundle-mcp"]);

// Import every package's register.js (side-effect: registers procedures into the shared registry).
for (const rel of packages) {
  if (SKIP.has(rel)) continue;
  const reg = join(ROOT, rel, "dist", "register.js");
  if (!existsSync(reg)) continue; // not every package registers procedures
  try {
    await import(pathToFileURL(reg).href);
    loaded.push(rel);
  } catch (err) {
    failed.push(`${rel}: ${err?.message ?? err}`);
  }
}

// Pull the registry from the core client (also ensures core client.* procedures are registered).
const { PROCEDURE_REGISTRY } = await import(pathToFileURL(join(ROOT, "client", "dist", "index.js")).href);
const all = PROCEDURE_REGISTRY.getAll();

// Group by top-level namespace (first path segment).
const groups = new Map();
for (const proc of all) {
  const ns = proc.path[0] ?? "(root)";
  if (!groups.has(ns)) groups.set(ns, []);
  groups.get(ns).push(proc);
}

const esc = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ").trim();

let out = "";
out += "# Mark Ecosystem Procedure Catalog\n\n";
out += "> **Generated file — do not hand-edit.** Produced by `packages/documentation/scripts/generate-procedures.mjs`\n";
out += "> from the live `PROCEDURE_REGISTRY` (introspected after importing every built package's\n";
out += "> `register.js`). Regenerate with `node packages/documentation/scripts/generate-procedures.mjs`.\n\n";
out += `**Total procedures:** ${all.length} across ${groups.size} namespaces. `;
out += `Loaded ${loaded.length} package register(s).\n\n`;
if (failed.length) {
  out += `> ⚠️ ${failed.length} package(s) failed to load and are not represented below:\n`;
  for (const f of failed) out += `> - ${esc(f)}\n`;
  out += "\n";
}

// Table of contents.
const names = [...groups.keys()].sort();
out += "## Namespaces\n\n";
for (const ns of names) {
  out += `- [\`${ns}.*\`](#${ns}) — ${groups.get(ns).length} procedure(s)\n`;
}
out += "\n---\n\n";

for (const ns of names) {
  const procs = groups.get(ns).sort((a, b) => a.path.join(".").localeCompare(b.path.join(".")));
  out += `## ${ns}\n\n`;
  out += "| Procedure | Description |\n|-----------|-------------|\n";
  for (const p of procs) {
    const name = p.path.join(".");
    const desc = esc(p.metadata?.description) || "_(no description)_";
    out += `| \`${name}\` | ${desc} |\n`;
  }
  out += "\n";
}

writeFileSync(join(DOCS, "PROCEDURES.md"), out, "utf8");
console.error(`Wrote PROCEDURES.md: ${all.length} procedures, ${groups.size} namespaces.`);
console.error(`Loaded: ${loaded.join(", ")}`);
if (failed.length) console.error(`Failed: \n  ${failed.join("\n  ")}`);
