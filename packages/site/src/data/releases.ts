/**
 * The release history of the packages. It is a module of its own, so only the code of the releases
 * page loads it (the types are in `index.ts`). It has the changes of the newest version only:
 * `release-changes.ts` has all of them.
 */

import releasesJson from "./generated/releases.js";
import type { ReleasesIndex } from "./index";

export const releases: ReleasesIndex = releasesJson as unknown as ReleasesIndex;
