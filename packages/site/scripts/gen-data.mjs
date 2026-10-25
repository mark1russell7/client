// Generate the data of the site from the workspace: the packages, their dependencies and
// every procedure with its JSON Schemas.
//
// The script imports the built register.js of each package in dependency order. The
// registry is one global object, so the new entries after each import belong to that
// package. Thus each procedure has the package that defines it.
//
// The `mark` CLI imports only the packages that declare `client.procedures`. The script
// imports those first, so it knows which procedures the CLI has. Then it imports the other
// packages with a register.js (for example client-mcp).
//
// The site declares each of these packages as a dependency, so `pnpm -r build` builds them
// before the site. A package without its build or a package that does not load stops the
// script with an error (deep dive SITE-4: the catalog lost procedures without a message).
// SITE_ALLOW_LOAD_FAILURES=1 lets a local build continue: the footer of the site then lists
// the packages that did not load.
//
// Usage: node scripts/gen-data.mjs (from packages/site). Build the workspace first (`pnpm build`).
// Output: src/data/generated/*.js with .d.ts files. Git ignores that folder. catalog.js has the
// procedures without their schemas, and schemas/<package>.js has the schemas of each package.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readCoreFields } from "./core-fields.mjs";
import { readStatusData } from "./status-data.mjs";
import { readStatusBoard } from "@mark1russell7/site-pages";
import { readReleases, splitReleases } from "./releases-data.mjs";
import { docModuleName, readDocs } from "./docs-data.mjs";
import { countTests, npmVersion } from "./site-metrics.mjs";

const SITE = join(dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGES = join(SITE, "..");
const OUT = join(SITE, "src", "data", "generated");
const ALLOW_FAILURES = process.env["SITE_ALLOW_LOAD_FAILURES"] === "1";

// Procedure handlers and dependencies write to the console when they load. The data goes to files.
const log = console.log;
const fail = (message) => {
  process.stderr.write(`gen-data: ${message}\n`);
  process.exit(1);
};
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
const manifests = new Map();
for (const entry of readdirSync(PACKAGES, { withFileTypes: true })) {
  const manifest = join(PACKAGES, entry.name, "package.json");
  if (!entry.isDirectory() || !existsSync(manifest)) continue;
  const pkg = JSON.parse(readFileSync(manifest, "utf8"));
  manifests.set(entry.name, pkg);
  // The devDependencies of the site only set the build order (see below): the map does not show them
  const devDependencies = entry.name === "site" ? {} : pkg.devDependencies;
  packages.push({
    dir: entry.name,
    name: pkg.name,
    description: pkg.description ?? "",
    private: pkg.private === true,
    deps: [],
    rawDeps: { ...pkg.dependencies, ...devDependencies, ...pkg.peerDependencies },
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

// Level: 0 for a package without workspace dependencies, else 1 + the highest level of its dependencies.
// The site is an app at the end of the graph: its build-order dependencies do not count.
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
// The build order: the site depends on each package that registers procedures
// ---------------------------------------------------------------------------

// Apps that register procedures for themselves only
const SKIP = new Set(["impl-mcp-dev", "site"]);
const registering = packages.filter((pkg) => !SKIP.has(pkg.dir) && existsSync(join(PACKAGES, pkg.dir, "src", "register.ts")));

const site = manifests.get("site");
const siteDeps = { ...site.dependencies, ...site.devDependencies };
const undeclared = registering.filter((pkg) => siteDeps[pkg.name] === undefined);
if (undeclared.length > 0) {
  fail(
    `the site does not depend on ${undeclared.map((pkg) => pkg.name).join(", ")}. Add each one to the ` +
      `devDependencies of packages/site/package.json as "workspace:*", so that pnpm builds it before the site.`,
  );
}

const clientDist = join(PACKAGES, "client", "dist", "index.js");
const unbuilt = [
  ...(existsSync(clientDist) ? [] : ["client"]),
  ...registering.filter((pkg) => !existsSync(join(PACKAGES, pkg.dir, "dist", "register.js"))).map((pkg) => pkg.dir),
];
if (unbuilt.length > 0) {
  fail(`these packages are not built: ${unbuilt.join(", ")}. Start \`pnpm build\` at the root of the repository first.`);
}

// ---------------------------------------------------------------------------
// Procedures
// ---------------------------------------------------------------------------

const client = await import(pathToFileURL(clientDist).href);
const registry = client.PROCEDURE_REGISTRY;
// An import registers nothing: the register entry of the client package adds its procedures
await import(pathToFileURL(join(PACKAGES, "client", "dist", "register.js")).href);

const owner = new Map();
for (const proc of registry.getAll()) owner.set(proc.path.join("."), "client");

const failed = [];
const byLevel = (a, b) => a.level - b.level || a.dir.localeCompare(b.dir);

async function load(pkg, file) {
  try {
    await import(pathToFileURL(file).href);
  } catch (error) {
    failed.push({ package: pkg.dir, error: String(error?.message ?? error).split("\n")[0] });
    return;
  }
  for (const proc of registry.getAll()) {
    const key = proc.path.join(".");
    if (!owner.has(key)) owner.set(key, pkg.dir);
  }
}

// Phase 1: the packages that `mark` loads (deep dive SITE-11: the catalog showed `mark mcp serve`,
// but client-mcp does not declare client.procedures, so `mark` does not have it)
const cliPackages = registering.filter((pkg) => manifests.get(pkg.dir).client?.procedures).sort(byLevel);
for (const pkg of cliPackages) {
  await load(pkg, join(PACKAGES, pkg.dir, manifests.get(pkg.dir).client.procedures));
}
const cliKeys = new Set(registry.getAll().map((proc) => proc.path.join(".")));

// Phase 2: the other packages with a register.js
for (const pkg of registering.filter((candidate) => !cliPackages.includes(candidate)).sort(byLevel)) {
  await load(pkg, join(PACKAGES, pkg.dir, "dist", "register.js"));
}

if (failed.length > 0 && !ALLOW_FAILURES) {
  fail(
    `${failed.length} packages did not load:\n` +
      failed.map((failure) => `  ${failure.package}: ${failure.error}`).join("\n") +
      `\nSet SITE_ALLOW_LOAD_FAILURES=1 to make the site without them.`,
  );
}

const mcpSnapshot = join(PACKAGES, "impl-mcp-dev", "tools.snapshot.txt");
if (!existsSync(mcpSnapshot)) fail("packages/impl-mcp-dev/tools.snapshot.txt is missing.");
const mcpTools = new Set(readFileSync(mcpSnapshot, "utf8").split(/\r?\n/).filter(Boolean));

/** The JSON Schema of a procedure's input or output, as the MCP tools and `mark` see it. */
function schemaOf(schema, io = "input") {
  return client.jsonSchemaOf(schema, { io }) ?? { type: "object" };
}

const coreFields = readCoreFields(PACKAGES);
// The Composer's runtime (src/lib/runtime.ts) has the core procedures and procedure.define/get/list/delete
const browserKeys = new Set([...client.allCoreProcedures, ...client.metaProcedures].map((proc) => proc.path.join(".")));
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
    output: schemaOf(proc.output, "output"),
    registered: registry.has(proc.path),
    cli: cliKeys.has(key),
    browser: browserKeys.has(key),
    mcp: mcpTools.has(key),
    fields: coreFields[key] ?? null,
  });
}
const procedures = [...all.values()].sort((a, b) => a.key.localeCompare(b.key));

const missingTools = [...mcpTools].filter((tool) => !all.has(tool));
if (missingTools.length > 0) fail(`the MCP tool snapshot names procedures that no package registers: ${missingTools.join(", ")}.`);

for (const proc of procedures) {
  const pkg = byDir.get(proc.package);
  if (pkg) pkg.procedures++;
}

// ---------------------------------------------------------------------------
// The build: the commit and its date
// ---------------------------------------------------------------------------

function git(...args) {
  try {
    return execFileSync("git", args, { cwd: SITE, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || null;
  } catch {
    return null;
  }
}
// Not GITHUB_SHA: in a workflow_run job it names the head of main, not the commit that CI tested
const commit = process.env["SITE_COMMIT"] || git("rev-parse", "HEAD");
const build = { commit, date: (commit && git("show", "-s", "--format=%cI", commit)) || new Date().toISOString() };

// ---------------------------------------------------------------------------
// The status page: the live board (`readStatusBoard` of @mark1russell7/site-pages) reads the
// roadmap file and the open pull requests and issues on GitHub. Without GITHUB_TOKEN, or when GitHub does not answer,
// the board shows the roadmap only. Its history reads the closed status documents.
// ---------------------------------------------------------------------------

const STATUS_BOARD = { roadmap: "packages/documentation/ROADMAP-2026-10.md", owner: "mark1russell7", repo: "client" };

let board;
try {
  board = await readStatusBoard({ repoDir: join(PACKAGES, ".."), ...STATUS_BOARD, token: process.env["GITHUB_TOKEN"], commit });
} catch (error) {
  fail(`the status board cannot read the roadmap. ${error?.message ?? error}`);
}
if (!board.github.available) process.stderr.write(`gen-data: the status board has no GitHub data: ${board.github.reason}.\n`);

let status;
try {
  status = readStatusData(PACKAGES, SITE);
} catch (error) {
  fail(`the status board cannot read a status document. ${error?.message ?? error}`);
}

// ---------------------------------------------------------------------------
// The releases: the changelog of each package, and the dates from git, GitHub and npm
// (scripts/releases-data.mjs, with @mark1russell7/site-pages)
// ---------------------------------------------------------------------------

let releases;
try {
  releases = await readReleases({
    repoDir: join(PACKAGES, ".."),
    token: process.env["GITHUB_TOKEN"],
    ref: commit ?? "HEAD",
    warn: (message) => process.stderr.write(`gen-data: ${message}\n`),
  });
} catch (error) {
  fail(`the releases cannot be read from the changelogs. ${error?.message ?? error}`);
}

// ---------------------------------------------------------------------------
// The docs pages (scripts/docs-data.mjs): the guides, the documents of the client library and
// the README of each package, as HTML. A program block can run when the browser has its procedures.
// ---------------------------------------------------------------------------

let docs;
try {
  docs = readDocs(PACKAGES, packages, { canRun: (key) => browserKeys.has(key) });
} catch (error) {
  fail(`the docs pages cannot be made. ${error?.stack ?? error}`);
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
// The measured numbers of the home page (scripts/site-metrics.mjs)
const tests = countTests(PACKAGES);
const npm = { name: "@procedures/client", version: await npmVersion("@procedures/client") };
// The newest version of the changelogs: the build can run before npm has it
const newest = releases.releases[0];
const metrics = { tests: tests.tests, testFiles: tests.files, npm, release: newest ? { version: newest.version, date: newest.date } : null };

// Each page loads the catalog, so it has the procedures without their schemas. The schemas were
// 57 kB of gzip in each page. Now each package has a module of its schemas, and the page of a
// procedure loads only the module of its package (src/data/schemas.ts).
const summaries = procedures.map(({ input: _input, output: _output, ...summary }) => summary);
write("catalog", { procedures: summaries, failed, mcpTools: [...mcpTools].sort(), build, metrics });
const schemasByPackage = new Map();
for (const { key, package: dir, input, output } of procedures) {
  const entries = schemasByPackage.get(dir) ?? [];
  entries.push({ key, input, output });
  schemasByPackage.set(dir, entries);
}
rmSync(join(OUT, "schemas"), { recursive: true, force: true });
mkdirSync(join(OUT, "schemas"), { recursive: true });
for (const [dir, entries] of schemasByPackage) {
  writeFileSync(join(OUT, "schemas", `${dir}.js`), `export default ${JSON.stringify(entries)};\n`);
  writeFileSync(join(OUT, "schemas", `${dir}.d.ts`), "declare const data: unknown;\nexport default data;\n");
}
write("status", status);
write("status-board", board);
// The index and the changes of the newest version load with the releases page, the other changes on demand
const { index: releaseIndex, changes: releaseChanges } = splitReleases(releases);
write("releases", releaseIndex);
write("release-changes", releaseChanges);
// The list of the docs pages goes with the routes; the content of each page and the headings for
// the command palette load only with the page and the palette.
write("docs-index", docs.index);
write("docs-routes", docs.routes);
write("docs-search", docs.search);
rmSync(join(OUT, "docs"), { recursive: true, force: true });
mkdirSync(join(OUT, "docs"), { recursive: true });
for (const [slug, page] of Object.entries(docs.pages)) {
  const name = docModuleName(slug);
  writeFileSync(join(OUT, "docs", `${name}.js`), `export default ${JSON.stringify(page)};\n`);
  writeFileSync(join(OUT, "docs", `${name}.d.ts`), "declare const data: unknown;\nexport default data;\n");
}

log(
  `site data: ${packages.length} packages, ${procedures.length} procedures ` +
    `(${procedures.filter((p) => p.cli).length} in the CLI, ${procedures.filter((p) => p.mcp).length} MCP tools, ` +
    `${procedures.filter((p) => p.browser).length} in the browser), ` +
    `${board.items.length} roadmap items (${board.items.filter((item) => item.statusClass !== "done").length} open), ` +
    (board.github.available ? `${board.pullRequests.length} open pull requests and ${board.issues.length} open issues ` : "no GitHub data ") +
    `on the status board, ${status.findings.length} findings in its history, ` +
    `${releases.releases.length} releases, ` +
    `${docs.index.length} docs pages (${docs.index.reduce((sum, doc) => sum + doc.programs, 0)} program blocks), ` +
    `${metrics.tests} tests in ${metrics.testFiles} files, npm: ${npm.version ?? "not published"}` +
    (failed.length ? `, ${failed.length} packages failed to load: ${failed.map((f) => f.package).join(", ")}` : ""),
);
process.exit(0);
