// Generate PACKAGES.md from the workspace: each package's name, folder, description,
// dependencies, and the procedures it registers.
//
// Procedures are attributed by loading each package's built dist/register.js in dependency
// order and recording which procedures appear in the shared registry after each import.
//
// Usage:  node packages/documentation/scripts/generate-packages.mjs   (from the repo root)
// Requires each package to be built (`pnpm build`).

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DOCS = join(HERE, "..");          // packages/documentation/
const PACKAGES = join(DOCS, "..");      // packages/

const packages = readdirSync(PACKAGES, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(join(PACKAGES, entry.name, "package.json")))
  .map((entry) => {
    const json = JSON.parse(readFileSync(join(PACKAGES, entry.name, "package.json"), "utf8"));
    return { folder: entry.name, json };
  });
const byName = new Map(packages.map((p) => [p.json.name, p]));

function deps(json, kind) {
  return Object.entries(json[kind] ?? {})
    .filter(([name]) => name.startsWith("@mark1russell7/"))
    .map(([name, spec]) => ({ name, workspace: String(spec).startsWith("workspace:") }));
}

// Dependency order: a package after the workspace packages it depends on
const order = [];
const visiting = new Set();
function visit(pkg) {
  if (order.includes(pkg) || visiting.has(pkg)) return;
  visiting.add(pkg);
  for (const dep of deps(pkg.json, "dependencies")) {
    const target = byName.get(dep.name);
    if (target) visit(target);
  }
  visiting.delete(pkg);
  order.push(pkg);
}
for (const pkg of [...packages].sort((a, b) => a.folder.localeCompare(b.folder))) visit(pkg);

// The registry, with the core procedures already registered
const core = await import(pathToFileURL(join(PACKAGES, "client", "dist", "index.js")).href);
const registry = core.PROCEDURE_REGISTRY;
const keyOf = (proc) => proc.path.join(".");
const seen = new Set(registry.getAll().map(keyOf));
const owned = new Map([["@mark1russell7/client", [...seen]]]);

for (const pkg of order) {
  if (pkg.json.name === "@mark1russell7/client") continue;
  const register = join(PACKAGES, pkg.folder, "dist", "register.js");
  if (!existsSync(register)) continue;
  try {
    await import(pathToFileURL(register).href);
  } catch (error) {
    owned.set(pkg.json.name, [`(failed to load: ${error?.message ?? error})`]);
    continue;
  }
  const added = registry.getAll().map(keyOf).filter((key) => !seen.has(key));
  for (const key of added) seen.add(key);
  owned.set(pkg.json.name, added);
}

function procedureSummary(name) {
  const procs = owned.get(name) ?? [];
  if (procs.length === 0) return "—";
  const namespaces = new Map();
  for (const key of procs) {
    const ns = key.split(".")[0];
    namespaces.set(ns, (namespaces.get(ns) ?? 0) + 1);
  }
  return [...namespaces].map(([ns, n]) => `\`${ns}.*\` (${n})`).join(", ");
}

const esc = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ").trim();

let out = "";
out += "# Package Reference\n\n";
out += "> **Generated file — do not hand-edit.** Produced by `packages/documentation/scripts/generate-packages.mjs`\n";
out += "> from the workspace's package.json files and the live procedure registry.\n";
out += "> Regenerate with `node packages/documentation/scripts/generate-packages.mjs` after `pnpm build`.\n\n";
out += `**Packages:** ${packages.length}. **Procedures:** ${seen.size}. The full procedure list is in [PROCEDURES.md](./PROCEDURES.md).\n\n`;
out += "Dependencies marked *(general)* are separate repositories, referenced with `github:` specifiers.\n\n";
out += "| Package | Folder | Description | Procedures | Depends on |\n|---|---|---|---|---|\n";
for (const pkg of [...packages].sort((a, b) => a.folder.localeCompare(b.folder))) {
  const depList = deps(pkg.json, "dependencies")
    .map((d) => (d.workspace ? `\`${d.name.replace("@mark1russell7/", "")}\`` : `\`${d.name.replace("@mark1russell7/", "")}\` *(general)*`))
    .join(", ") || "—";
  out += `| \`${pkg.json.name}\` | \`packages/${pkg.folder}\` | ${esc(pkg.json.description) || "—"} | ${procedureSummary(pkg.json.name)} | ${depList} |\n`;
}
out += "\nProcedures are counted for the package whose `register.js` adds them first, in dependency order.\n";
out += "A bundle (`bundle-dev`, `bundle-mcp`) adds none of its own.\n";

writeFileSync(join(DOCS, "PACKAGES.md"), out, "utf8");
console.error(`Wrote PACKAGES.md: ${packages.length} packages, ${seen.size} procedures.`);
