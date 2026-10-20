// The types of releases-data.mjs, for the TypeScript tests of the site.

import type { ReleaseChange, ReleasesData, ReleasesIndex } from "../src/data/index";

export declare const GROUP: string;
export declare const REPOSITORY: string;

export declare function splitReleases(data: ReleasesData): { index: ReleasesIndex; changes: Record<string, ReleaseChange[]> };
export declare function readReleases(options: {
  repoDir: string;
  token?: string | undefined;
  ref?: string | undefined;
  warn?: (message: string) => void;
}): Promise<ReleasesData>;
