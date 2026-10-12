// The first publish of the public packages: the one-time bootstrap before trusted publishing.
//
// npm trusts a GitHub workflow only for a package that exists. So the first version of each
// package comes from this computer, as a staged publish: npm keeps the version until the owner
// approves it with 2FA. Then the release workflow publishes every later version with OIDC.
//
// Steps (packages/documentation/RELEASE.md tells the whole procedure):
//   1. npm login
//   2. node scripts/npm-bootstrap.mjs --dry-run     the tarballs, and what npm would stage
//   3. node scripts/npm-bootstrap.mjs               stages each version that is not on npm
//   4. Approve the staged versions on npmjs.com, or with `npm stage approve <id> --otp <code>`
//   5. node scripts/npm-bootstrap.mjs --trust --otp <code>
//      connects each package to .github/workflows/release.yml (one command for each package)
//
// Options: --dry-run, --trust, --otp <code>, --only <name,name> (a part of the packages).

import { mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gitDependencies, publicPackages, root, run } from "./lib/workspace.mjs";

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const value = (name) => {
  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
};
const dryRun = flag("--dry-run");
const trust = flag("--trust");
const otp = value("--otp");
const only = value("--only")?.split(",").map((s) => s.trim());

const REPO = "mark1russell7/client";
const WORKFLOW = "release.yml";
const ENVIRONMENT = "npm";

const packages = publicPackages().filter((p) => !only || only.includes(p.name));
if (packages.length === 0) {
  console.error("No package to work on. Examine --only.");
  process.exit(1);
}

/** The version of a package on npm, or undefined when npm does not have it. */
function publishedVersion(name, version) {
  try {
    return run("npm", ["view", `${name}@${version}`, "version"], root, true).trim() || undefined;
  } catch {
    return undefined;
  }
}

if (!dryRun) {
  try {
    console.log(`npm user: ${run("npm", ["whoami"], root, true).trim()}`);
  } catch {
    console.error("npm has no valid login. Start `npm login` first.");
    process.exit(1);
  }
}

// --trust: connect each package to the release workflow
if (trust) {
  const failures = [];
  for (const pkg of packages) {
    const args = ["trust", "github", pkg.name, "--file", WORKFLOW, "--repo", REPO, "--env", ENVIRONMENT, "--allow-publish", "--yes"];
    if (otp) args.push("--otp", otp);
    console.log(`npm ${args.join(" ")}`);
    if (dryRun) continue;
    try {
      run("npm", args, root);
    } catch (error) {
      failures.push(pkg.name);
      console.error(`  failed: ${String(error.stderr ?? error.message).trim()}`);
    }
  }
  if (failures.length > 0) {
    console.error(`\n${failures.length} packages have no trusted publisher yet: ${failures.join(", ")}`);
    console.error("A 2FA code is valid for a short time: start the command again with a new code and --only.");
    process.exit(1);
  }
  if (dryRun) {
    console.log(`\nThe dry run printed the ${packages.length} commands, and started none.`);
  } else {
    console.log("\nEach package trusts the release workflow. Set 'Require two-factor authentication and disallow tokens' on npmjs.com after the first release from the workflow.");
  }
  process.exit(0);
}

// The staged publish of the first version
const blocked = packages.flatMap((pkg) => gitDependencies(pkg.manifest).map((dep) => `${pkg.name}: ${dep}`));
if (blocked.length > 0) {
  console.error("These dependencies are git dependencies, which npm 12 does not install by default:");
  for (const line of blocked) console.error(`  ${line}`);
  console.error("Publish the general packages (cue, splay, docker-sqlite), then start scripts/use-npm-general-packages.mjs.");
  if (!dryRun) process.exit(1);
}

const work = mkdtempSync(join(tmpdir(), "client-bootstrap-"));
const staged = [];
const skipped = [];
const failed = [];
try {
  for (const pkg of packages) {
    const existing = publishedVersion(pkg.name, pkg.version);
    if (existing) {
      skipped.push(`${pkg.name}@${existing}`);
      console.log(`skip  ${pkg.name}@${pkg.version}: on npm`);
      continue;
    }
    // pnpm packs the package: it writes the versions of the workspace:* dependencies
    const out = join(work, pkg.dir);
    mkdirSync(out);
    run("pnpm", ["pack", "--pack-destination", out], pkg.path, true);
    const tgz = join(out, readdirSync(out).find((f) => f.endsWith(".tgz")));
    const args = ["stage", "publish", tgz, "--access", "public", "--provenance=false"];
    if (dryRun) args.push("--dry-run");
    try {
      run("npm", args, root, true);
      staged.push(`${pkg.name}@${pkg.version}`);
      console.log(`${dryRun ? "would stage" : "staged"} ${pkg.name}@${pkg.version}`);
    } catch (error) {
      failed.push(pkg.name);
      console.error(`FAIL  ${pkg.name}: ${String(error.stderr ?? error.message).trim().split("\n").slice(-3).join(" ")}`);
    }
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}

console.log(`\n${staged.length} ${dryRun ? "would be staged" : "staged"}, ${skipped.length} on npm already, ${failed.length} failed.`);
if (!dryRun && staged.length > 0) {
  console.log("\nNext:");
  console.log("  1. Approve the staged versions: on npmjs.com, or `npm stage list` and `npm stage approve <id> --otp <code>`.");
  console.log("  2. node scripts/npm-bootstrap.mjs --trust --otp <code>");
}
if (failed.length > 0) process.exit(1);
