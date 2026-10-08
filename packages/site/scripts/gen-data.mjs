// Generate the data of the site from the workspace: the packages, their dependencies and
// every procedure with its JSON Schemas.
//
// The script imports the built register.js of each package in dependency order. The
// registry is one global object, so the new entries after each import belong to that
// package. Thus each procedure has the package that defines it.
//
// Usage: node scripts/gen-data.mjs (from packages/site). Build the workspace first (`pnpm build`).
// Output: src/data/generated/*.js with .d.ts files. Git ignores that folder.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readCoreFields } from "./core-fields.mjs";

const SITE = join(dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGES = join(SITE, "..");
const OUT = join(SITE, "src", "data", "generated");

// Procedure handlers and dependencies write to the console when they load. The data goes to files.
const log = console.log;
console.log = () => {};
console.info = () => {};
console.warn = () => {};

// ---------------------------------------------------------------------------
// Packages
// ---------------------------------------------------------------------------

function countLines(dir) {
  if (!existsSync(dir)) return 0;
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) total += countLines(path);
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      total += readFileSync(path, "utf8").split("\n").length;
    }
  }
  return total;
}

const packages = [];
for (const entry of readdirSync(PACKAGES, { withFileTypes: true })) {
  const manifest = join(PACKAGES, entry.name, "package.json");
  if (!entry.isDirectory() || !existsSync(manifest)) continue;
  const pkg = JSON.parse(readFileSync(manifest, "utf8"));
  packages.push({
    dir: entry.name,
    name: pkg.name,
    description: pkg.description ?? "",
    private: pkg.private === true,
    deps: [],
    rawDeps: { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies },
    lines: countLines(join(PACKAGES, entry.name, "src")),
    procedures: 0,
    level: 0,
  });
}

const byName = new Map(packages.map((pkg) => [pkg.name, pkg]));
for (const pkg of packages) {
  pkg.deps = Object.keys(pkg.rawDeps)
    .filter((name) => byName.has(name) && name !== pkg.name)
    .map((name) => byName.get(name).dir)
    .sort();
  delete pkg.rawDeps;
}

// Level: 0 for a package without workspace dependencies, else 1 + the highest level of its dependencies
const byDir = new Map(packages.map((pkg) => [pkg.dir, pkg]));
const levels = new Map();
function levelOf(dir, stack = new Set()) {
  if (levels.has(dir)) return levels.get(dir);
  if (stack.has(dir)) return 0; // a cycle: break it here
  stack.add(dir);
  const deps = byDir.get(dir)?.deps ?? [];
  const level = deps.length === 0 ? 0 : 1 + Math.max(...deps.map((dep) => levelOf(dep, stack)));
  stack.delete(dir);
  levels.set(dir, level);
  return level;
}
for (const pkg of packages) pkg.level = levelOf(pkg.dir);

// ---------------------------------------------------------------------------
// Procedures
// ---------------------------------------------------------------------------

const clientDist = join(PACKAGES, "client", "dist", "index.js");
if (!existsSync(clientDist)) {
  console.error("packages/client is not built. Start `pnpm build` at the root of the repository first.");
  process.exit(1);
}
const client = await import(pathToFileURL(clientDist).href);
const { zodToJsonSchema } = await import(pathToFileURL(join(PACKAGES, "mcp", "dist", "index.js")).href);
const registry = client.PROCEDURE_REGISTRY;

const owner = new Map();
for (const proc of registry.getAll()) owner.set(proc.path.join("."), "client");

const failed = [];
const SKIP = new Set(["bundle-dev", "bundle-mcp", "impl-mcp-dev", "site"]);
const ordered = [...packages].sort((a, b) => a.level - b.level || a.dir.localeCompare(b.dir));
for (const pkg of ordered) {
  if (SKIP.has(pkg.dir)) continue;
  const register = join(PACKAGES, pkg.dir, "dist", "register.js");
  if (!existsSync(register)) continue;
  try {
    await import(pathToFileURL(register).href);
  } catch (error) {
    failed.push({ package: pkg.dir, error: String(error?.message ?? error).split("\n")[0] });
    continue;
  }
  for (const proc of registry.getAll()) {
    const key = proc.path.join(".");
    if (!owner.has(key)) owner.set(key, pkg.dir);
  }
}

const mcpSnapshot = join(PACKAGES, "impl-mcp-dev", "tools.snapshot.txt");
const mcpTools = new Set(
  existsSync(mcpSnapshot) ? readFileSync(mcpSnapshot, "utf8").split(/\r?\n/).filter(Boolean) : [],
);

function schemaOf(schema) {
  try {
    return zodToJsonSchema(schema);
  } catch {
    return { type: "object" };
  }
}

const coreFields = readCoreFields(PACKAGES);
const browserKeys = new Set(client.allCoreProcedures.map((proc) => proc.path.join(".")));
const all = new Map();
for (const proc of [...registry.getAll(), ...client.allCoreProcedures]) {
  const key = proc.path.join(".");
  if (all.has(key)) continue;
  all.set(key, {
    key,
    path: proc.path,
    package: owner.get(key) ?? "client",
    description: proc.metadata?.description ?? "",
    tags: proc.metadata?.tags ?? [],
    input: schemaOf(proc.input),
    output: schemaOf(proc.output),
    registered: registry.has(proc.path),
    browser: browserKeys.has(key),
    mcp: mcpTools.has(key),
    fields: coreFields[key] ?? null,
  });
}
const procedures = [...all.values()].sort((a, b) => a.key.localeCompare(b.key));

for (const proc of procedures) {
  const pkg = byDir.get(proc.package);
  if (pkg) pkg.procedures++;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, ".gitignore"), "*\n");
// A .js module with a .d.ts declaration: the generated tsconfig does not include .json files
const write = (name, data) => {
  writeFileSync(join(OUT, `${name}.js`), `export default ${JSON.stringify(data, null, 2)};\n`);
  writeFileSync(join(OUT, `${name}.d.ts`), "declare const data: unknown;\nexport default data;\n");
};
write("packages", packages.sort((a, b) => a.level - b.level || a.dir.localeCompare(b.dir)));
write("catalog", { procedures, failed, mcpTools: [...mcpTools].sort() });

log(
  `site data: ${packages.length} packages, ${procedures.length} procedures ` +
    `(${procedures.filter((p) => p.mcp).length} MCP tools, ${procedures.filter((p) => p.browser).length} browser)` +
    (failed.length ? `, ${failed.length} packages failed to load: ${failed.map((f) => f.package).join(", ")}` : ""),
);
process.exit(0);
