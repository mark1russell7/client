/**
 * The release history of the packages. It is a module of its own, so only the code of the status
 * page loads it (the types are in `index.ts`).
 */

import releasesJson from "./generated/releases.js";
import type { ReleasesData } from "./index";

export const releases: ReleasesData = releasesJson as unknown as ReleasesData;
