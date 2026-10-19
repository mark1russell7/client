// The types of releases-data.mjs, for the TypeScript tests of the site.

import type { Release, ReleasesData } from "../src/data/index";

export declare const GROUP: string;
export declare const GROUP_CHANGELOG: string;
export declare class ReleaseDataError extends Error {}

export interface ChangelogEntry {
  /** The short SHA of the commit, or null for an entry without a commit. */
  commit: string | null;
  /** The first sentence of the entry, with its code spans. */
  text: string;
}

export interface ChangelogSection {
  version: string;
  entries: ChangelogEntry[];
}

export declare function compareVersions(a: string, b: string): number;
export declare function firstSentence(text: string): string;
export declare function parseChangelog(markdown: string): ChangelogSection[];
export declare function buildReleases(changelogs: Array<{ name: string; markdown: string }>, dates: Map<string, string>): Release[];
export declare function releaseDates(repoDir: string, versions: string[], warn?: (message: string) => void): Map<string, string>;
export declare function readReleases(packagesDir: string, repoDir: string, warn?: (message: string) => void): ReleasesData;
