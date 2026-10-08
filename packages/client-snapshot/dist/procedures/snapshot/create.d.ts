/**
 * snapshot.create procedure
 *
 * Create an environment snapshot and upload to S3.
 */
import type { ProcedureContext } from "@mark1russell7/client";
import type { SnapshotCreateInput, SnapshotCreateOutput } from "../../types.js";
/**
 * Create a snapshot of the environment
 */
export declare function snapshotCreate(input: SnapshotCreateInput, ctx: ProcedureContext): Promise<SnapshotCreateOutput>;
//# sourceMappingURL=create.d.ts.map