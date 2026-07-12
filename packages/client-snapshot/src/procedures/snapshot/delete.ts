/**
 * snapshot.delete procedure
 *
 * Delete a snapshot from S3.
 */

import type { ProcedureContext } from "@mark1russell7/client";
import type { SnapshotDeleteInput, SnapshotDeleteOutput } from "../../types.js";
import { listAllObjects, findSnapshotKeys } from "./s3-lookup.js";

/**
 * Delete a snapshot from S3
 */
export async function snapshotDelete(
  input: SnapshotDeleteInput,
  ctx: ProcedureContext
): Promise<SnapshotDeleteOutput> {
  // Find all files for this snapshot ID (paginated listing, exact basename
  // match). Exact matching is critical here: a substring match could delete a
  // different snapshot whose id contains this id as a substring.
  const objects = await listAllObjects(ctx, input.bucket, "snapshots/");
  const snapshotKeys = findSnapshotKeys(objects, input.id);

  if (snapshotKeys.length === 0) {
    throw new Error(`Snapshot not found: ${input.id}`);
  }

  // Delete each file
  for (const key of snapshotKeys) {
    await ctx.client.call(["s3", "delete"], {
      bucket: input.bucket,
      key,
    });
  }

  return {
    deleted: true,
    id: input.id,
  };
}
