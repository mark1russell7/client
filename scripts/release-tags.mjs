// The git tags and the GitHub Releases of the current versions of the public packages.
//
// The release workflow makes them through the Changesets action (scripts/publish-ci.mjs tells
// how). When a release made none, for example 0.3.0 on 2026-10-16, this script makes the missing
// ones. Each tag is <name>@<version> at the commit of the versions, as the action makes it. Each
// Release has the tag as its title and the section of the version in CHANGELOG.md as its text.
// The script needs the gh CLI with a token that can write the contents of the repository.
//
// Options:
//   --commit <sha>   the commit of the versions (required): the "Version the packages" commit
//   --latest <name>  the package whose Release is the latest one (default: @procedures/client)
//   --dry-run        tell each tag and Release that the script makes, and make nothing

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { publicPackages, root } from "./lib/workspace.mjs";

const args = process.argv.slice(2);
const option = (name) => {
  const at = args.indexOf(name);
  return at === -1 ? undefined : args[at + 1];
};
const dryRun = args.includes("--dry-run");
const commit = option("--commit");
const latest = option("--latest") ?? "@procedures/client";
if (!commit) {
  console.error("Give the commit of the versions: --commit <sha>");
  process.exit(1);
}

/** This function starts gh, and gives its status and its output. */
function gh(ghArgs) {
  const result = spawnSync("gh", ghArgs, { cwd: root, encoding: "utf8" });
  return { ok: result.status === 0, out: `${result.stdout ?? ""}${result.stderr ?? ""}`.trim() };
}

const repo = gh(["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"]);
if (!repo.ok) {
  console.error(`gh does not know the repository: ${repo.out}`);
  process.exit(1);
}
const sha = gh(["api", `repos/${repo.out}/commits/${commit}`, "--jq", ".sha"]);
if (!sha.ok) {
  console.error(`GitHub does not have the commit ${commit}: ${sha.out}`);
  process.exit(1);
}

/** This function gives the section of a version in a CHANGELOG.md, without its heading. */
function changelogSection(dir, version) {
  const file = join(root, "packages", dir, "CHANGELOG.md");
  if (!existsSync(file)) return "";
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `## ${version}`);
  if (start === -1) return "";
  const end = lines.findIndex((line, index) => index > start && line.startsWith("## "));
  return lines.slice(start + 1, end === -1 ? undefined : end).join("\n").trim();
}

const work = mkdtempSync(join(tmpdir(), "release-tags-"));
const made = [];
let failed = 0;
try {
  // The latest Release comes last, so GitHub shows it as the latest one
  const packages = publicPackages().sort((a, b) => Number(a.name === latest) - Number(b.name === latest));
  for (const pkg of packages) {
    const tag = `${pkg.name}@${pkg.version}`;
    const hasTag = gh(["api", `repos/${repo.out}/git/ref/tags/${tag}`]).ok;
    const hasRelease = gh(["release", "view", tag, "--repo", repo.out, "--json", "tagName"]).ok;
    if (hasTag && hasRelease) {
      console.log(`skip  ${tag}: the tag and the Release exist`);
      continue;
    }
    if (dryRun) {
      console.log(`would make ${hasTag ? "" : "the tag and "}the Release ${tag}`);
      continue;
    }
    if (!hasTag) {
      const ref = gh(["api", "-X", "POST", `repos/${repo.out}/git/refs`, "-f", `ref=refs/tags/${tag}`, "-f", `sha=${sha.out}`]);
      if (!ref.ok) {
        console.error(`FAIL  the tag ${tag}: ${ref.out}`);
        failed++;
        continue;
      }
    }
    const notes = join(work, `${pkg.dir}.md`);
    writeFileSync(notes, changelogSection(pkg.dir, pkg.version) || `The release ${pkg.version} of ${pkg.name}.`);
    const release = gh([
      "release", "create", tag, "--repo", repo.out, "--verify-tag", "--title", tag, "--notes-file", notes,
      `--latest=${pkg.name === latest}`, ...(pkg.version.includes("-") ? ["--prerelease"] : []),
    ]);
    if (!release.ok) {
      console.error(`FAIL  the Release ${tag}: ${release.out}`);
      failed++;
      continue;
    }
    made.push(tag);
    console.log(`made  ${tag}`);
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}

console.log(`\n${made.length} made${failed ? `, ${failed} failed` : ""}.`);
if (failed) process.exit(1);
