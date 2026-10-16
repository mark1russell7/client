// The package check: the packages as a user gets them from npm.
//
// For each public package of packages/, this script:
// 1. packs it with pnpm (pnpm writes the versions of the workspace:* dependencies);
// 2. reads the packed package.json: no workspace: specifier, no git dependency, the metadata;
// 3. checks the tarball with publint --strict and attw (the ESM-only profile);
// 4. installs all the tarballs together in an empty project, as from npm;
// 5. imports each package root, runs a program with the client, and starts the bins.
//
// Usage: node scripts/check-packages.mjs [--allow-git-deps] [--no-install] [--keep]
// --allow-git-deps: accept the github: dependencies of the general packages (cue, splay,
//   docker-sqlite) until they are on npm. A release must not have them: npm 12 does not install
//   git dependencies by default.
// --no-install: steps 1 to 3 only.
// --keep: keep the temporary folder, and print its path.
// Start `pnpm build` first: the tarballs hold the built dist/ folders.

import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gitDependencies, publicPackages, readFromTarball, root, run } from "./lib/workspace.mjs";

const args = new Set(process.argv.slice(2));
const allowGitDeps = args.has("--allow-git-deps");
const install = !args.has("--no-install");
const keep = args.has("--keep");

const problems = [];
const fail = (message) => {
  problems.push(message);
  console.error(`  FAIL ${message}`);
};

const work = mkdtempSync(join(tmpdir(), "client-pack-"));
try {
  const packages = publicPackages();
  const versions = new Set(packages.map((p) => p.version));
  if (versions.size !== 1) fail(`the public packages have more than one version: ${[...versions].join(", ")}`);

  // Changesets gives the public packages one version: each one must be in the fixed group
  const changesets = JSON.parse(readFileSync(join(root, ".changeset", "config.json"), "utf8"));
  const fixed = new Set(changesets.fixed?.[0] ?? []);
  for (const pkg of packages) {
    if (!fixed.has(pkg.name)) fail(`${pkg.name} is not in the "fixed" group of .changeset/config.json`);
  }
  for (const name of fixed) {
    if (!packages.some((p) => p.name === name)) fail(`.changeset/config.json names ${name}, which is not a public package`);
  }
  console.log(`Packing ${packages.length} public packages (version ${[...versions].join(", ")})`);

  const tarballs = [];
  for (const pkg of packages) {
    const out = join(work, "tarballs", pkg.dir);
    mkdirSync(out, { recursive: true });
    run("pnpm", ["pack", "--pack-destination", out], pkg.path, true);
    const file = readdirSync(out).find((f) => f.endsWith(".tgz"));
    if (file === undefined) {
      fail(`${pkg.name}: pnpm pack made no tarball`);
      continue;
    }
    const tgz = join(out, file);
    tarballs.push(tgz);

    // The packed manifest
    const packed = JSON.parse(readFromTarball(tgz, "package/package.json"));
    for (const field of ["dependencies", "peerDependencies", "optionalDependencies"]) {
      for (const [dep, spec] of Object.entries(packed[field] ?? {})) {
        if (String(spec).startsWith("workspace:")) fail(`${pkg.name}: ${field}.${dep} is still ${spec}`);
      }
    }
    if (!allowGitDeps) {
      for (const dep of gitDependencies(packed)) {
        fail(`${pkg.name}: ${dep} is a git dependency. Publish the general package, then start scripts/use-npm-general-packages.mjs`);
      }
    }
    for (const field of ["license", "repository", "description", "homepage", "author"]) {
      if (!packed[field]) fail(`${pkg.name}: the packed package.json has no ${field}`);
    }
    // Since P9 (2026-10-13) a root registers nothing: only ./register does. This rule agrees with
    // scripts/check-side-effects.mjs (roadmap R8: before, it asked a root that imports
    // register.js to keep ./dist/index.js in sideEffects, the rule of the time before P9).
    const index = join(pkg.path, "src", "index.ts");
    if (existsSync(index) && /["']\.\/register\.js["']/.test(readFileSync(index, "utf8"))) {
      fail(`${pkg.name}: src/index.ts imports ./register.js, so an import of the root registers procedures (scripts/check-side-effects.mjs)`);
    }
    for (const required of ["package/LICENSE", "package/README.md"]) {
      try {
        readFromTarball(tgz, required);
      } catch {
        fail(`${pkg.name}: the tarball has no ${required.slice("package/".length)}`);
      }
    }

    // The tarball as npm and TypeScript read it
    try {
      run("pnpm", ["exec", "publint", "run", tgz, "--strict"], root, true);
    } catch (error) {
      fail(`${pkg.name}: publint\n${error.stdout ?? ""}${error.stderr ?? ""}`);
    }
    try {
      run("pnpm", ["exec", "attw", tgz, "--profile", "esm-only", "--format", "ascii"], root, true);
    } catch (error) {
      fail(`${pkg.name}: attw\n${error.stdout ?? ""}${error.stderr ?? ""}`);
    }
    console.log(`  ok   ${pkg.name}`);
  }

  if (install && problems.length === 0) {
    // An empty project that installs the tarballs, as a user installs the packages from npm
    const app = join(work, "app");
    mkdirSync(app);
    writeFileSync(join(app, "package.json"), JSON.stringify({ name: "client-pack-smoke", private: true, type: "module" }));
    console.log("Installing the tarballs into an empty project");
    run("npm", ["install", "--no-audit", "--no-fund", "--loglevel=error", ...tarballs], app);

    // Each package root imports and registers nothing. Each register entry registers. The client
    // runs a program (ARCHITECTURE-PROPOSALS-2026-10, P9).
    const registering = packages.filter((p) => p.manifest.exports?.["./register"]).map((p) => p.name);
    writeFileSync(
      join(app, "smoke.mjs"),
      `const names = ${JSON.stringify(packages.map((p) => p.name))};
for (const name of names) {
  try {
    await import(name);
  } catch (error) {
    throw new Error("import " + name + ": " + error.message);
  }
}
await import("@procedures/client/browser");
const global = globalThis[Symbol.for("@procedures/client/PROCEDURE_REGISTRY")];
const afterRoots = global ? global.getAll().length : 0;
if (afterRoots !== 0) throw new Error("the package roots registered " + afterRoots + " procedures");
for (const name of ${JSON.stringify(registering)}) {
  try {
    await import(name + "/register");
  } catch (error) {
    throw new Error("import " + name + "/register: " + error.message);
  }
}

const { Client, LocalTransport, PROCEDURE_REGISTRY, allCoreProcedures } = await import("@procedures/client");
for (const procedure of allCoreProcedures) {
  if (!PROCEDURE_REGISTRY.has(procedure.path)) PROCEDURE_REGISTRY.register(procedure);
}
const client = new Client(new LocalTransport({ registry: PROCEDURE_REGISTRY }));
const sum = await client.exec({ $proc: ["client", "add"], input: { a: 2, b: 3 } });
if (sum !== 5) throw new Error("client.add gave " + JSON.stringify(sum));
const chain = await client.exec({
  $proc: ["client", "chain"],
  input: { steps: [{ $proc: ["client", "add"], input: { a: 2, b: 3 } }, { $proc: ["client", "multiply"], input: { a: { $ref: "$last" }, b: 4 } }] },
});
if (chain.final !== 20) throw new Error("client.chain gave " + JSON.stringify(chain));
const exists = await client.exec({ $proc: ["fs", "exists"], input: { path: "package.json" } });
if (exists.exists !== true) throw new Error("fs.exists gave " + JSON.stringify(exists));
console.log(names.length + " packages import and register nothing, " + ${JSON.stringify(registering)}.length + " register entries register, and the client runs a program");
`,
    );
    process.stdout.write(`  ok   ${run("node", ["smoke.mjs"], app)}`);

    // The bins start
    for (const pkg of packages) {
      for (const [bin, path] of Object.entries(pkg.bin)) {
        const file = join(app, "node_modules", ...pkg.name.split("/"), path);
        if (!existsSync(file)) {
          fail(`${pkg.name}: the bin ${bin} (${path}) is not in the package`);
          continue;
        }
        // A server bin waits for requests: only examine that it exists
        if (bin === "mcp-dev-tools" || bin === "client-registry") continue;
        try {
          run("node", [file, "--help"], app, true);
          console.log(`  ok   ${bin} --help`);
        } catch (error) {
          fail(`${pkg.name}: ${bin} --help\n${error.stdout ?? ""}${error.stderr ?? ""}`);
        }
      }
    }
  }
} finally {
  if (keep) console.log(`The temporary folder: ${work}`);
  else rmSync(work, { recursive: true, force: true });
}

if (problems.length > 0) {
  console.error(`\nThe package check found ${problems.length} problems.`);
  process.exit(1);
}
console.log("\nThe package check passed.");
