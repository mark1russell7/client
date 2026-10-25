// Read the release history of the packages for the releases page of the site.
//
// `@mark1russell7/site-pages` reads the changelogs and the dates (fleet issue #1). The packages of
// the repository are one fixed version group on npm (`@procedures/*`), so the versions come from
// the changelog of `@procedures/client`: each release of the group has it. The date of a version
// is the date of its git tag `@procedures/client@<version>`, else of its GitHub release, else its
// publication time on npm, else the commit that added its heading to that changelog. The Pages
// workflow and the Site job of CI check out the full history (fetch-depth 0), so git has the tags
// and the commits.
//
// This module keeps what only this site needs: the name of the group, and the split of the data
// into the index of the page and the changes of each version.

import { readReleases as readRepositoryReleases } from "@mark1russell7/site-pages";

/** The package that names the group: each release of the group has a section in its changelog. */
export const GROUP = "@procedures/client";
/** The repository on GitHub, for the GitHub releases and the links. */
export const REPOSITORY = "mark1russell7/client";

/**
 * The data of the page in two modules. The index has each version with its number of changes,
 * and the changes of the newest version only: the releases page shows them first. The other changes
 * load when the reader selects another version, so the first load of the page stays small. The
 * page makes its own links, so the index does not keep the links of a version.
 */
export function splitReleases(data) {
  const newest = data.releases[0];
  return {
    index: {
      group: data.group,
      releases: data.releases.map(({ changes, links: _links, ...release }) => ({ ...release, changeCount: changes.length })),
      changes: newest ? { [newest.version]: newest.changes } : {},
    },
    changes: Object.fromEntries(data.releases.map((release) => [release.version, release.changes])),
  };
}

/**
 * The release data of the repository: the changelog of each package, the git tags, the npm
 * publication times of the group and, with a token, the GitHub releases. A failure of GitHub or npm
 * gives a warning, not an error.
 *
 * @throws ReleaseDataError of `@mark1russell7/site-pages` when the group has no changelog
 */
export async function readReleases({ repoDir, token, ref, warn = () => {} }) {
  const releases = await readRepositoryReleases({ repoDir, repository: REPOSITORY, group: GROUP, packages: [GROUP], token, ref, warn });
  return { group: GROUP, releases };
}
