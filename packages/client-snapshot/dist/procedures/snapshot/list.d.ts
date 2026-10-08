/**
 * snapshot.list procedure
 *
 * List available snapshots in S3 bucket.
 */
import type { ProcedureContext } from "@mark1russell7/client";
import type { SnapshotListInput, SnapshotListOutput } from "../../types.js";
/**
 * List snapshots in S3 bucket
 */
export declare function snapshotList(input: SnapshotListInput, ctx: ProcedureContext): Promise<SnapshotListOutput>;
//# sourceMappingURL=list.d.ts.map