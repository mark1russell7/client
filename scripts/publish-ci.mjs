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
// Options: --dry-run (pack each package and start `npm publish --dry-run`).

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
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
    const lines = `${result.stdout}\n${result.stderr}`.split("\n");
    for (const line of lines.filter((l) => /oidc|provenance|transparency/i.test(l))) console.log(`      ${line.trim()}`);

    if (result.status === 0) {
      published.push(`${pkg.name}@${pkg.version}`);
      console.log(`${dryRun ? "would publish" : "published"} ${pkg.name}@${pkg.version}`);
    } else {
      failed = pkg.name;
      console.error(`FAIL  ${pkg.name}@${pkg.version}`);
      for (const line of lines.filter((l) => /error|http fetch (PUT|POST)/i.test(l)).slice(-30)) console.error(`      ${line.trim()}`);
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
