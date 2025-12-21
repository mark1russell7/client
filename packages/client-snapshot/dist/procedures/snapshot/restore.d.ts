/**
 * snapshot.restore procedure
 *
 * Restore an environment snapshot from S3.
 */
import type { ProcedureContext } from "@mark1russell7/client";
import type { SnapshotRestoreInput, SnapshotRestoreOutput } from "../../types.js";
/**
 * Restore a snapshot from S3
 */
export declare function snapshotRestore(input: SnapshotRestoreInput, ctx: ProcedureContext): Promise<SnapshotRestoreOutput>;
//# sourceMappingURL=restore.d.ts.map