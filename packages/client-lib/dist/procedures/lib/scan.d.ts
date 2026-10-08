/**
 * lib.scan procedure
 *
 * Scans ecosystem packages using ecosystem.manifest.json as the source of truth.
 * Only processes packages listed in the manifest - does NOT scan arbitrary directories.
 */
import type { ProcedureContext } from "@mark1russell7/client";
import type { LibScanInput, LibScanOutput } from "../../types.js";
/**
 * Scan for packages using the ecosystem manifest as the source of truth
 */
export declare function libScan(input: LibScanInput, ctx: ProcedureContext): Promise<LibScanOutput>;
//# sourceMappingURL=scan.d.ts.map