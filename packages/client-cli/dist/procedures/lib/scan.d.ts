/**
 * lib.scan procedure
 *
 * Scans ~/git for all packages and builds a mapping of package name to repo path.
 */
import type { LibScanInput, LibScanOutput } from "../../types.js";
/**
 * Scan for packages in the git directory
 */
export declare function libScan(input: LibScanInput): Promise<LibScanOutput>;
//# sourceMappingURL=scan.d.ts.map