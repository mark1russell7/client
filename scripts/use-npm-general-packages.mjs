// Switch the general packages (cue, splay, docker-sqlite) from github: specifiers to their npm
// versions, after they are published.
//
// The script:
// 1. examines that each npm range has a published version (`npm view`), unless --force;
// 2. replaces each github: specifier of these packages in the root package.json and in each
//    package of packages/;
// 3. removes the build approvals of their git URLs from pnpm-workspace.yaml (a package from the
//    registry runs no "prepare" script);
// 4. starts `pnpm install`, which writes the lockfile, unless --no-install.
//
// Usage: node scripts/use-npm-general-packages.mjs [--dry-run] [--force] [--no-install]

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { GENERAL_PACKAGES, root, run, workspacePackages } from "./lib/workspace.mjs";

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");

// 1. The versions are on npm
if (!args.has("--force")) {
  for (const [name, range] of Object.entries(GENERAL_PACKAGES)) {
    let published = "";
    try {
      published = run("npm", ["view", `${name}@${range}`, "version", "--json"], root, true).trim();
    } catch {
      // npm view fails for a package that does not exist
    }
    if (!published) {
      console.error(`${name}@${range} is not on npm. Publish it first, or give --force.`);
      process.exit(1);
    }
    console.log(`${name}@${range}: on npm (${published})`);
  }
}

// 2. The specifiers
const manifests = [join(root, "package.json"), ...workspacePackages().map((p) => join(p.path, "package.json"))];
let changed = 0;
for (const file of manifests) {
  const text = readFileSync(file, "utf8");
  const manifest = JSON.parse(text);
  let dirty = false;
  for (const field of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
    for (const [name, range] of Object.entries(GENERAL_PACKAGES)) {
      const spec = manifest[field]?.[name];
      if (spec !== undefined && /^(github:|git\+|git:)/.test(spec)) {
        manifest[field][name] = range;
        dirty = true;
        console.log(`${file.slice(root.length + 1)}: ${field}.${name} ${spec} -> ${range}`);
      }
    }
  }
  if (dirty) {
    changed++;
    if (!dryRun) writeFileSync(file, JSON.stringify(manifest, null, 2) + "\n");
  }
}

// 3. The build approvals of the git URLs, with the comment lines above them
const workspaceFile = join(root, "pnpm-workspace.yaml");
const lines = readFileSync(workspaceFile, "utf8").split("\n");
const kept = [];
for (const line of lines) {
  const isGitApproval = Object.keys(GENERAL_PACKAGES).some((name) => line.trimStart().startsWith(`"${name}@git+`));
  if (isGitApproval) {
    while (kept.length > 0 && kept[kept.length - 1].trimStart().startsWith("#") && kept[kept.length - 1].startsWith("  ")) kept.pop();
    console.log(`pnpm-workspace.yaml: removes ${line.trim()}`);
    continue;
  }
  kept.push(line);
}
if (!dryRun && kept.length !== lines.length) writeFileSync(workspaceFile, kept.join("\n"));

console.log(`${changed} package.json files ${dryRun ? "would change" : "changed"}.`);

// 4. The lockfile
if (!dryRun && !args.has("--no-install") && changed > 0) {
  run("pnpm", ["install"], root);
  console.log("pnpm install wrote the lockfile. Start pnpm build and node scripts/check-packages.mjs.");
}
