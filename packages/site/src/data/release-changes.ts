/**
 * The changes of each version of the group, by version. The releases page loads this module when
 * the reader selects a version other than the newest one.
 */

import changesJson from "./generated/release-changes.js";
import type { ReleaseChange } from "./index";

export const releaseChanges: Record<string, ReleaseChange[]> = changesJson as unknown as Record<string, ReleaseChange[]>;
