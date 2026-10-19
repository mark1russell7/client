// Read the release history of the packages for the Releases section of the status page.
//
// The packages of the repository are one fixed version group on npm (`@procedures/*`). Changesets
// writes a section for each version in the CHANGELOG.md of each package: a `## 0.13.2` heading,
// a `###` heading for each kind of change, and one `- <short sha>: <text>` entry for each change.
// The next lines of an entry have an indent of two spaces.
//
// The versions come from the changelog of `@procedures/client`, because each release of the group
// has it. The date of a version is the date of its git tag `@procedures/client@<version>`. A
// version without a tag (the first releases) gets the date of the commit that added its heading
// to that changelog. The Pages workflow and the Site job of CI check out the full history
// (fetch-depth 0), so git has the tags and the commits.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/** The package that names the group: each release of the group has a section in its changelog. */
export const GROUP = "@procedures/client";
/** The changelog of the group, from the root of the repository. */
export const GROUP_CHANGELOG = "packages/client/CHANGELOG.md";

const VERSION_HEADING = /^##\s+(\d+\.\d+\.\d+)\s*$/;
const COMMIT_ENTRY = /^([0-9a-f]{7,40}):\s+([\s\S]*)$/;
// The lines of Changesets for a new version of a dependency: no change of the package itself
const DEPENDENCY_ENTRY = /^(?:Updated dependencies\b|@[\w.-]+\/[\w.-]+@\S+\s*$)/;

export class ReleaseDataError extends Error {}

/** The numbers of a version "1.2.3", for a sort. */
function partsOf(version) {
  return version.split(".").map(Number);
}

/** A negative number when `a` is older than `b`, a positive number when it is newer, else 0. */
export function compareVersions(a, b) {
  const left = partsOf(a);
  const right = partsOf(b);
  for (let index = 0; index < 3; index++) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

/**
 * The first sentence of a text. A full stop, a question mark or an exclamation mark ends the
 * sentence when a space and no lowercase letter follow it. A mark in a code span does not end it.
 * A text that ends with a colon (a list follows) ends with a full stop.
 */
export function firstSentence(text) {
  const clean = text.replace(/\s+/g, " ").trim();
  let code = false;
  for (let index = 0; index < clean.length; index++) {
    const char = clean[index];
    if (char === "`") {
      code = !code;
      continue;
    }
    if (code || (char !== "." && char !== "?" && char !== "!")) continue;
    const next = clean[index + 1];
    if (next === undefined) break;
    if (next === " " && !/^[a-z]/.test(clean.slice(index + 2))) return clean.slice(0, index + 1);
  }
  return clean.replace(/:$/, ".");
}

/**
 * The entries of each version of a changelog, in the order of the file. An entry is a line that
 * starts with "- " and the indented lines under it. Its text is its first paragraph: the lines
 * before an empty line or a nested list. An entry for a new dependency version is not a change.
 */
export function parseChangelog(markdown) {
  const sections = [];
  let section = null;
  let entry = null;
  const close = () => {
    if (entry && section) section.raw.push(entry);
    entry = null;
  };
  for (const line of markdown.split(/\r?\n/)) {
    const heading = VERSION_HEADING.exec(line);
    if (heading) {
      close();
      section = { version: heading[1], raw: [] };
      sections.push(section);
      continue;
    }
    if (section === null) continue;
    if (line.startsWith("- ")) {
      close();
      entry = [line.slice(2)];
    } else if (entry && (line.trim() === "" || /^\s/.test(line))) {
      entry.push(line);
    } else {
      // A heading ("### Patch Changes") or a paragraph of the section ends the entry
      close();
      if (/^#{1,2}\s/.test(line)) section = null;
    }
  }
  close();
  return sections.map(({ version, raw }) => ({
    version,
    entries: raw.flatMap((lines) => {
      const paragraph = [];
      for (const [index, line] of lines.entries()) {
        if (index > 0 && (line.trim() === "" || /^\s+[-*]\s/.test(line))) break;
        paragraph.push(line.trim());
      }
      const text = paragraph.join(" ");
      const commit = COMMIT_ENTRY.exec(text);
      const body = commit ? commit[2] : text;
      if (body.trim() === "" || DEPENDENCY_ENTRY.test(body.trim())) return [];
      return [{ commit: commit ? commit[1] : null, text: firstSentence(body) }];
    }),
  }));
}

/**
 * The releases of the group, newest first.
 *
 * - `changelogs`: the npm name and the Markdown of each changelog. The changelog of `GROUP` gives
 *   the versions.
 * - `dates`: the ISO date of each version.
 *
 * Each change is one commit (or one text, for an entry without a commit) with the packages that
 * list it. The changes with the most packages come first.
 */
export function buildReleases(changelogs, dates) {
  const group = changelogs.find((changelog) => changelog.name === GROUP);
  if (!group) throw new ReleaseDataError(`no changelog of ${GROUP}`);
  const versions = parseChangelog(group.markdown)
    .map((section) => section.version)
    .sort((a, b) => compareVersions(b, a));
  if (versions.length === 0) throw new ReleaseDataError(`${GROUP_CHANGELOG}: no "## <version>" heading`);

  const changes = new Map(versions.map((version) => [version, new Map()]));
  for (const { name, markdown } of changelogs) {
    for (const section of parseChangelog(markdown)) {
      const byKey = changes.get(section.version);
      if (!byKey) continue;
      for (const entry of section.entries) {
        const key = entry.commit ?? `text:${entry.text}`;
        const change = byKey.get(key) ?? { commit: entry.commit, text: entry.text, packages: [] };
        if (!change.packages.includes(name)) change.packages.push(name);
        byKey.set(key, change);
      }
    }
  }

  const oldest = versions[versions.length - 1];
  return versions.map((version) => {
    const date = dates.get(version);
    if (!date) throw new ReleaseDataError(`the version ${version} has no date`);
    const patch = partsOf(version)[2];
    return {
      version,
      date,
      kind: version === oldest ? "first" : patch === 0 ? "minor" : "patch",
      changes: [...changes.get(version).values()]
        .map((change) => ({ ...change, packages: [...change.packages].sort() }))
        .sort((a, b) => b.packages.length - a.packages.length || a.text.localeCompare(b.text)),
    };
  });
}

/**
 * The date of each version from git: the date of its tag, else the date of the commit that added
 * its heading to the changelog of the group. `warn` gets a message when the clone is shallow
 * (the dates are then not exact) or when git does not know a version.
 */
export function releaseDates(repoDir, versions, warn = () => {}) {
  const git = (...args) => {
    try {
      return execFileSync("git", args, { cwd: repoDir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    } catch {
      return "";
    }
  };
  if (git("rev-parse", "--is-shallow-repository").trim() === "true") {
    warn("the clone is shallow, so the release dates are not exact. Check out the full history (fetch-depth 0).");
  }
  const dates = new Map();
  const tags = git("for-each-ref", "--format=%(refname:strip=2) %(creatordate:iso-strict)", `refs/tags/${GROUP}@*`);
  for (const line of tags.split(/\r?\n/)) {
    const match = /@(\d+\.\d+\.\d+) (\S+)$/.exec(line.trim());
    if (match) dates.set(match[1], match[2]);
  }
  const missing = [];
  for (const version of versions) {
    if (dates.has(version)) continue;
    const added = git("log", "--format=%cI", `-S## ${version}`, "--", `:(top)${GROUP_CHANGELOG}`).trim().split(/\r?\n/).filter(Boolean);
    const date = added[added.length - 1];
    if (date) dates.set(version, date);
    else missing.push(version);
  }
  if (missing.length > 0) {
    // Without git, a version gets the date of the next newer version, or the time of the build
    warn(`git gives no date for ${missing.join(", ")}. The page shows an approximate date.`);
    const sorted = [...versions].sort((a, b) => compareVersions(b, a));
    let newer = new Date().toISOString();
    for (const version of sorted) {
      if (dates.has(version)) newer = dates.get(version);
      else dates.set(version, newer);
    }
  }
  return dates;
}

/**
 * The data of the page in two modules. The index has each version with its number of changes,
 * and the changes of the newest version only: the status page shows them first. The other changes
 * load when the reader selects another version, so the first load of the page stays small.
 */
export function splitReleases(data) {
  const newest = data.releases[0];
  return {
    index: {
      group: data.group,
      releases: data.releases.map(({ changes, ...release }) => ({ ...release, changeCount: changes.length })),
      changes: newest ? { [newest.version]: newest.changes } : {},
    },
    changes: Object.fromEntries(data.releases.map((release) => [release.version, release.changes])),
  };
}

/** The release data of the workspace: the changelog of each package and the dates from git. */
export function readReleases(packagesDir, repoDir, warn = () => {}) {
  const changelogs = [];
  for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
    const file = join(packagesDir, entry.name, "CHANGELOG.md");
    const manifest = join(packagesDir, entry.name, "package.json");
    if (!entry.isDirectory() || !existsSync(file) || !existsSync(manifest)) continue;
    const { name } = JSON.parse(readFileSync(manifest, "utf8"));
    changelogs.push({ name, markdown: readFileSync(file, "utf8") });
  }
  const group = changelogs.find((changelog) => changelog.name === GROUP);
  if (!group) throw new ReleaseDataError(`${GROUP_CHANGELOG} is missing`);
  const versions = parseChangelog(group.markdown).map((section) => section.version);
  return { group: GROUP, releases: buildReleases(changelogs, releaseDates(repoDir, versions, warn)) };
}
