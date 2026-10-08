/**
 * snapshot.delete procedure
 *
 * Delete a snapshot from S3.
 */
import type { ProcedureContext } from "@mark1russell7/client";
import type { SnapshotDeleteInput, SnapshotDeleteOutput } from "../../types.js";
/**
 * Delete a snapshot from S3
 */
export declare function snapshotDelete(input: SnapshotDeleteInput, ctx: ProcedureContext): Promise<SnapshotDeleteOutput>;
//# sourceMappingURL=delete.d.ts.map