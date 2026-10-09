/**
 * snapshot.list procedure
 *
 * List available snapshots in S3 bucket.
 */

import type { ProcedureContext } from "@mark1russell7/client";
import type {
  SnapshotListInput,
  SnapshotListOutput,
  SnapshotListEntry,
  SnapshotMetadata,
} from "../../types.js";
import { listAllObjects } from "./s3-lookup.js";

/**
 * List snapshots in S3 bucket
 */
export async function snapshotList(
  input: SnapshotListInput,
  ctx: ProcedureContext
): Promise<SnapshotListOutput> {
  const prefix = input.prefix
    ? `snapshots/${input.prefix}`
    : "snapshots/";

  // List the metadata files of all pages. Sort them by the time of the write (newest first),
  // then cut. Before, the procedure read one page (S3 lists by key, not by time) and cut it
  // before the sort, so it returned the oldest snapshots (deep dive DATA-16).
  const objects = await listAllObjects(ctx, input.bucket, prefix);
  const metadataKeys = objects
    .filter((obj) => obj.key.endsWith(".metadata.json"))
    .sort((a, b) => timeOf(b.lastModified) - timeOf(a.lastModified))
    .slice(0, input.maxResults);

  // Fetch metadata for each snapshot
  const snapshots: SnapshotListEntry[] = [];

  for (const obj of metadataKeys) {
    try {
      const downloadResult = await ctx.client.call<
        { bucket: string; key: string; encoding?: string },
        { body: string }
      >(["s3", "download"], {
        bucket: input.bucket,
        key: obj.key,
        encoding: "utf8",
      });

      const metadata: SnapshotMetadata = JSON.parse(downloadResult.body);

      snapshots.push({
        id: metadata.id,
        name: metadata.name,
        preset: metadata.preset,
        createdAt: metadata.createdAt,
        size: metadata.archiveSize,
        os: metadata.environment.os,
      });
    } catch {
      // Skip invalid metadata
    }
  }

  // Sort by creation date (newest first)
  snapshots.sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return {
    snapshots,
    count: snapshots.length,
  };
}

/** A time in milliseconds. A missing or invalid time is 0, so it sorts last. */
function timeOf(iso: string | undefined): number {
  const time = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(time) ? 0 : time;
}
