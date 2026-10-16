// The publish step of the release workflow (.github/workflows/release.yml).
//
// pnpm packs each public package: it writes the versions of the workspace:* dependencies. Then the
// npm CLI publishes the tarball with trusted publishing (OIDC) and provenance. On 2026-10-16 the
// publish of pnpm 12 got HTTP 404 for each package: it did not use the OIDC token of the job. The
// npm CLI is the reference client of trusted publishing, and scripts/npm-bootstrap.mjs publishes
// the first versions the same way.
//
// The script skips each version that is on npm, so a new start continues a release that stopped.
// It stops at the first failure: when the OIDC exchange fails for one package, it fails for all.
//
// The Changesets action gives the file CHANGESETS_OUTPUT. The script writes one line to it for each
// version that it publishes: {"type":"git-tag","tag":"<name>@<version>","packageName":"<name>"}, the
// format of `changeset publish`. With these lines the action pushes a git tag for each version and
// makes a GitHub release from the change log of the package. Without the file, the action makes no
// tags and no releases. scripts/release-tags.mjs makes the tags and releases that a release missed.
//
// Options: --dry-run (pack each package and start `npm publish --dry-run`).

import { spawnSync } from "node:child_process";
import { appendFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { publicPackages, root, run } from "./lib/workspace.mjs";

const dryRun = process.argv.includes("--dry-run");
const inActions = process.env.GITHUB_ACTIONS === "true";

// Trusted publishing needs npm 11.5.1 or later
const npmVersion = run("npm", ["--version"], root, true).trim();
const [major, minor, patch] = npmVersion.split(".").map(Number);
if (major < 11 || (major === 11 && (minor < 5 || (minor === 5 && patch < 1)))) {
  console.error(`npm ${npmVersion} cannot publish with trusted publishing. Use npm 11.5.1 or later.`);
  process.exit(1);
}
console.log(`npm ${npmVersion}`);

/** This function tells if npm has this version of a package. */
function onNpm(name, version) {
  try {
    return run("npm", ["view", `${name}@${version}`, "version"], root, true).trim() === version;
  } catch {
    return false;
  }
}

// An empty file when nothing is published: then the action does not warn that the file is missing
const output = dryRun ? undefined : process.env.CHANGESETS_OUTPUT;
if (output) writeFileSync(output, "");

const work = mkdtempSync(join(tmpdir(), "client-publish-"));
const published = [];
const skipped = [];
let failed;
try {
  for (const pkg of publicPackages()) {
    if (onNpm(pkg.name, pkg.version)) {
      skipped.push(`${pkg.name}@${pkg.version}`);
      console.log(`skip  ${pkg.name}@${pkg.version}: on npm`);
      continue;
    }
    const out = join(work, pkg.dir);
    mkdirSync(out);
    run("pnpm", ["pack", "--pack-destination", out], pkg.path, true);
    const tgz = join(out, readdirSync(out).find((f) => f.endsWith(".tgz")));

    // Provenance comes only from a CI provider. The verbose log tells how npm got its token.
    const args = ["publish", tgz, "--access", "public", "--loglevel", "verbose"];
    if (inActions) args.push("--provenance");
    if (dryRun) args.push("--dry-run");
    const result = spawnSync("npm", args, { cwd: root, encoding: "utf8", shell: process.platform === "win32" });
    // The lines of the npm log, without the file list of the tarball
    const lines = `${result.stdout}\n${result.stderr}`.split("\n").filter((l) => !/^npm notice\s+[\d.]+\s*[kMG]?B /.test(l));
    for (const line of lines.filter((l) => /oidc|provenance|transparency/i.test(l))) console.log(`      ${line.trim()}`);

    if (result.status === 0) {
      published.push(`${pkg.name}@${pkg.version}`);
      console.log(`${dryRun ? "would publish" : "published"} ${pkg.name}@${pkg.version}`);
      // At once, so that a release that stops later still gets the tags of the versions on npm
      if (output) {
        const event = { type: "git-tag", tag: `${pkg.name}@${pkg.version}`, packageName: pkg.name };
        appendFileSync(output, `${JSON.stringify(event)}
`);
      }
    } else {
      failed = pkg.name;
      console.error(`FAIL  ${pkg.name}@${pkg.version}`);
      for (const line of lines.filter((l) => /^npm (error|http fetch (PUT|POST))/.test(l)).slice(-15)) console.error(`      ${line.trim()}`);
      if (lines.some((l) => /OIDC token exchange error - package not found/.test(l))) {
        console.error("npm refused the OIDC exchange. This repository uses the immutable OIDC subject of GitHub");
        console.error("(https://github.com/npm/cli/issues/9969). Examine `npm trust list <package>`: a trusted publisher with an");
        console.error("environment fails with this subject. Else publish from the computer of the owner:");
        console.error("node scripts/npm-bootstrap.mjs --publish");
      }
      break;
    }
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}

const verb = dryRun ? "would be published" : "published";
console.log(`\n${published.length} ${verb}, ${skipped.length} on npm already${failed ? `, stopped at ${failed}` : ""}.`);
if (failed) {
  console.error("Start the release workflow again after the correction: it skips the versions on npm.");
  process.exit(1);
}
