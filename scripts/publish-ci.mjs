// The pack step of the publish (.github/workflows/release.yml, the job "build").
//
//   node scripts/publish-ci.mjs <release folder> <plan file>
//
// The release has two sides. The job "build" runs the code of this repository, with no OIDC token:
// this script runs there. The job "publish" holds the OIDC token and runs no code of this
// repository: the npm-publish action of mark1russell7/template publishes the tarballs that this
// script makes. Thus a change to this script cannot get the OIDC token.
//
// 1. For each public package whose version is not on npm, pnpm packs the package into the release
//    folder. pnpm writes the versions of the workspace:* dependencies. <release folder>/packages.txt
//    has one line for each tarball, "name version file", a package after the packages that it uses.
//    The job uploads the folder as the artifact "release". An empty packages.txt: nothing to publish.
// 2. The plan file (tags.json) has one entry for each public package: name, version, tag,
//    prerelease and notes. The tag is <name>@<version>, as Changesets makes it. The notes are the
//    section of the version in the CHANGELOG.md of the package. @procedures/client comes last, so
//    its GitHub release is the last one. The job uploads the file as the artifact "tags", and
//    reusable-release-tag.yml of the template reads it.
//
// pnpm packs, and the npm CLI publishes. On 2026-10-16 the publish of pnpm 12 got HTTP 404 for
// each package: it did not use the OIDC token of the job. The npm CLI is the reference client of
// trusted publishing, and scripts/npm-bootstrap.mjs publishes the first versions the same way.
//
// The npm-publish action also skips each version that is on npm, so a new start continues a
// release that stopped. Start `pnpm build` before this script: the tarballs hold dist/.

import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { changelogSection, publicPackages, run } from "./lib/workspace.mjs";

const [out, planFile] = process.argv.slice(2);
if (out === undefined || planFile === undefined) {
  console.error("usage: node scripts/publish-ci.mjs <release folder> <plan file>");
  process.exit(2);
}
const release = resolve(out);
mkdirSync(release, { recursive: true });

// The package whose GitHub release is the latest one
const LATEST = "@procedures/client";
// GitHub refuses a release text of more than 125000 characters
const MAX_NOTES = 100_000;

/** This function tells if npm has this version of a package. The query string goes around the cache of the registry. */
async function onNpm(name, version) {
  const response = await fetch(`https://registry.npmjs.org/${name.replace("/", "%2f")}?t=${Date.now()}`, {
    headers: { accept: "application/vnd.npm.install-v1+json" },
  });
  if (response.status === 404) return false;
  if (!response.ok) throw new Error(`The registry gave HTTP ${response.status} for ${name}.`);
  const packument = await response.json();
  return packument.versions?.[version] !== undefined;
}

const packages = publicPackages();
const lines = [];
for (const pkg of packages) {
  if (await onNpm(pkg.name, pkg.version)) {
    console.log(`skip  ${pkg.name}@${pkg.version}: on npm`);
    continue;
  }
  // The new file in the folder is the tarball. The output of pnpm also holds the output of the
  // package scripts (prepack), so the script does not read it.
  const before = new Set(readdirSync(release));
  run("pnpm", ["pack", "--pack-destination", release], pkg.path, true);
  const added = readdirSync(release).filter((file) => !before.has(file) && file.endsWith(".tgz"));
  if (added.length !== 1) throw new Error(`pnpm pack of ${pkg.name} made ${added.length} tarballs: ${added.join(", ")}`);
  lines.push(`${pkg.name} ${pkg.version} ${added[0]}`);
  console.log(`pack  ${pkg.name}@${pkg.version}: ${added[0]}`);
}
writeFileSync(resolve(release, "packages.txt"), lines.length > 0 ? `${lines.join("\n")}\n` : "");

const plan = [...packages]
  .sort((a, b) => Number(a.name === LATEST) - Number(b.name === LATEST))
  .map((pkg) => {
    const section = changelogSection(pkg.dir, pkg.version) || `The release ${pkg.version} of ${pkg.name}.`;
    const notes = section.length <= MAX_NOTES ? section : `${section.slice(0, MAX_NOTES)}\n\n(The CHANGELOG.md of \`${pkg.name}\` has the full text.)`;
    return {
      name: pkg.name,
      version: pkg.version,
      tag: `${pkg.name}@${pkg.version}`,
      prerelease: /^[^+]*-/.test(pkg.version),
      notes,
    };
  });
writeFileSync(resolve(planFile), `${JSON.stringify(plan, null, 2)}\n`);

console.log(`\n${lines.length} to publish, ${packages.length - lines.length} on npm already, ${plan.length} in the plan of the GitHub releases.`);
