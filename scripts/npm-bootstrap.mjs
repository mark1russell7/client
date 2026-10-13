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
//   4. node scripts/npm-bootstrap.mjs --approve       approves each staged version (or on npmjs.com)
//   5. node scripts/npm-bootstrap.mjs --trust
//      connects each package to .github/workflows/release.yml (one command for each package)
//
// Steps 4 and 5 need the 2FA of the owner. Start them in a terminal: npm opens the browser to
// confirm (or give --otp <code>, which is valid for a short time).
//
// After the scope change (2026-10-12), --deprecate-old marks each old @mark1russell7 package that
// is on npm as deprecated, with the name of its @procedures package (also with the 2FA).
//
// --publish publishes the first version directly (`npm publish`, with the 2FA in the terminal),
// in place of the staged publish. A direct publish needs no --approve step. It stops at the first
// failure, because each try asks for the 2FA. Start it again: it skips the versions on npm.
//
// npm limits the new packages of one account. On 2026-10-12 it refused each new package with
// HTTP 429 ("rate limited exceeded") after 25 new packages, for the staged and the direct publish.
// The direct publish shows this 429 as EOTP: npm sends the request again with the used 2FA. So
// the script reads the npm log of a failed publish, and tells when the cause is the 429.
//
// Options: --dry-run, --publish, --approve, --trust, --deprecate-old, --otp <code>,
//          --only <name,name> (a part of the packages).

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gitDependencies, publicPackages, root, run } from "./lib/workspace.mjs";
import { NEW_SCOPE, OLD_SCOPE, OLD_TO_NEW } from "./lib/old-names.mjs";

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const value = (name) => {
  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
};
const dryRun = flag("--dry-run");
const trust = flag("--trust");
const approve = flag("--approve");
const publishDirect = flag("--publish");
const deprecateOld = flag("--deprecate-old");
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

/**
 * This function starts an npm command with the terminal of the user, so that npm can open the
 * browser for the 2FA and wait. It gives the exit code.
 */
function interactive(args) {
  return spawnSync("npm", args, { cwd: root, stdio: "inherit", shell: process.platform === "win32" }).status ?? 1;
}

/** This function tells if the npm logs in a folder show HTTP 429, the limit of new packages. */
function rateLimited(logsDir) {
  try {
    return readdirSync(logsDir).some((f) => /failed with 429|code E429/.test(readFileSync(join(logsDir, f), "utf8")));
  } catch {
    return false;
  }
}

/**
 * This function gives the staged versions ("name@version") of the account, which wait for an
 * approval. npm refuses to stage such a version again (HTTP 409).
 */
function stagedVersions() {
  try {
    const list = JSON.parse(run("npm", ["stage", "list", "--json"], root, true));
    return new Set(list.filter((s) => s.status === "staged").map((s) => `${s.packageName}@${s.version}`));
  } catch {
    return new Set();
  }
}

/**
 * This function tells if a package has a real version on npm. A staged publish of a new package
 * makes the package with the placeholder version `0.0.0-stage` until the approval.
 */
function onNpm(name) {
  try {
    const latest = run("npm", ["view", name, "dist-tags.latest"], root, true).trim();
    return latest !== "" && latest !== "0.0.0-stage";
  } catch {
    return false;
  }
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

// --deprecate-old: point each old @mark1russell7 package on npm to its @procedures package
if (deprecateOld) {
  const pairs = Object.entries(OLD_TO_NEW).filter(([, to]) => !only || only.includes(`${NEW_SCOPE}${to}`));
  const failures = [];
  const waiting = [];
  let count = 0;
  for (const [from, to] of pairs) {
    const oldName = `${OLD_SCOPE}${from}`;
    let versions;
    try {
      versions = run("npm", ["view", oldName, "versions", "--json"], root, true).trim();
    } catch {
      continue; // not on npm: the private packages, and names that were never published
    }
    if (!versions) continue;
    // The message must not name a package that npm does not have yet
    if (!onNpm(`${NEW_SCOPE}${to}`)) {
      waiting.push(oldName);
      console.log(`wait  ${oldName}: ${NEW_SCOPE}${to} is not on npm yet`);
      continue;
    }
    const message = `Moved to ${NEW_SCOPE}${to}: npm install ${NEW_SCOPE}${to}`;
    console.log(`npm deprecate "${oldName}@*" "${message}"`);
    count++;
    if (dryRun) continue;
    if (interactive(["deprecate", `${oldName}@*`, message, ...(otp ? ["--otp", otp] : [])]) !== 0) failures.push(oldName);
  }
  if (failures.length > 0) {
    console.error(`\n${failures.length} deprecations failed: ${failures.join(", ")}. Start the command again.`);
    process.exit(1);
  }
  console.log(dryRun ? `\nThe dry run printed ${count} deprecations.` : `\n${count} old packages point to their new names.`);
  if (waiting.length > 0) {
    console.log(`${waiting.length} old packages wait for their new package. Start the command again after its publish.`);
  }
  process.exit(0);
}

// --approve: approve each staged version of these packages
if (approve) {
  const names = new Set(packages.map((p) => p.name));
  const list = JSON.parse(run("npm", ["stage", "list", "--json"], root, true));
  const todo = list.filter((s) => s.status === "staged" && names.has(s.packageName));
  if (todo.length === 0) {
    console.log("No staged version of these packages waits for an approval.");
    process.exit(0);
  }
  const failures = [];
  for (const s of todo) {
    console.log(`npm stage approve ${s.id}   (${s.packageName}@${s.version})`);
    if (dryRun) continue;
    if (interactive(["stage", "approve", s.id, ...(otp ? ["--otp", otp] : [])]) !== 0) failures.push(s.packageName);
  }
  if (failures.length > 0) {
    console.error(`\n${failures.length} approvals failed: ${failures.join(", ")}. Start the command again (it takes only the versions that still wait).`);
    process.exit(1);
  }
  console.log(
    dryRun
      ? `\nThe dry run printed ${todo.length} approvals.`
      : `\n${todo.length} versions approved. Next: node scripts/npm-bootstrap.mjs --trust`,
  );
  process.exit(0);
}

// --trust: connect each package to the release workflow
if (trust) {
  const failures = [];
  for (const pkg of packages) {
    const args = ["trust", "github", pkg.name, "--file", WORKFLOW, "--repo", REPO, "--env", ENVIRONMENT, "--allow-publish", "--yes"];
    if (otp) args.push("--otp", otp);
    console.log(`npm ${args.join(" ")}`);
    if (dryRun) continue;
    if (interactive(args) !== 0) {
      failures.push(pkg.name);
      console.error(`  failed: ${pkg.name}`);
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
const waiting = [];
const failed = [];
let limited = 0;
const alreadyStaged = dryRun ? new Set() : stagedVersions();
try {
  for (const pkg of packages) {
    const existing = publishedVersion(pkg.name, pkg.version);
    if (existing) {
      skipped.push(`${pkg.name}@${existing}`);
      console.log(`skip  ${pkg.name}@${pkg.version}: on npm`);
      continue;
    }
    if (alreadyStaged.has(`${pkg.name}@${pkg.version}`)) {
      waiting.push(`${pkg.name}@${pkg.version}`);
      console.log(`skip  ${pkg.name}@${pkg.version}: staged, waits for --approve`);
      continue;
    }
    // pnpm packs the package: it writes the versions of the workspace:* dependencies
    const out = join(work, pkg.dir);
    mkdirSync(out);
    run("pnpm", ["pack", "--pack-destination", out], pkg.path, true);
    const tgz = join(out, readdirSync(out).find((f) => f.endsWith(".tgz")));
    if (publishDirect) {
      // In the terminal, so that npm can open the browser for the 2FA
      const logs = join(out, "logs");
      mkdirSync(logs);
      const publishArgs = ["publish", tgz, "--access", "public", "--provenance=false", "--logs-dir", logs, ...(otp ? ["--otp", otp] : [])];
      if (dryRun) publishArgs.push("--dry-run");
      console.log(`npm publish ${pkg.name}@${pkg.version}`);
      if (interactive(publishArgs) === 0) {
        staged.push(`${pkg.name}@${pkg.version}`);
        console.log(`${dryRun ? "would publish" : "published"} ${pkg.name}@${pkg.version}`);
      } else {
        failed.push(pkg.name);
        if (rateLimited(logs)) {
          console.error(`\nFAIL  ${pkg.name}: npm refused it with HTTP 429, the limit of new packages of the account.`);
          console.error("      The 2FA was correct: npm shows the 429 as EOTP. Try again when the limit resets.");
        } else {
          console.error(`FAIL  ${pkg.name}: the next packages are not tried. Start the command again.`);
        }
        break;
      }
      continue;
    }
    const args = ["stage", "publish", tgz, "--access", "public", "--provenance=false"];
    if (dryRun) args.push("--dry-run");
    try {
      run("npm", args, root, true);
      staged.push(`${pkg.name}@${pkg.version}`);
      console.log(`${dryRun ? "would stage" : "staged"} ${pkg.name}@${pkg.version}`);
    } catch (error) {
      failed.push(pkg.name);
      const text = String(error.stderr ?? error.message);
      if (/E429/.test(text)) limited++;
      console.error(`FAIL  ${pkg.name}: ${text.trim().split("\n").slice(-3).join(" ")}`);
    }
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}

const verb = publishDirect ? (dryRun ? "would be published" : "published") : dryRun ? "would be staged" : "staged";
console.log(`\n${staged.length} ${verb}, ${skipped.length} on npm already, ${waiting.length} wait for --approve, ${failed.length} failed.`);
if (limited > 0) {
  console.log(`npm refused ${limited} with HTTP 429, the limit of new packages of the account. Start the command again in 24 hours.`);
}
if (!dryRun && staged.length > 0 && publishDirect) {
  console.log("\nNext: node scripts/npm-bootstrap.mjs --trust");
} else if (!dryRun && staged.length + waiting.length > 0) {
  console.log("\nNext:");
  console.log("  1. node scripts/npm-bootstrap.mjs --approve   (in a terminal: npm opens the browser for the 2FA)");
  console.log("  2. node scripts/npm-bootstrap.mjs --trust");
}
if (failed.length > 0) process.exit(1);
