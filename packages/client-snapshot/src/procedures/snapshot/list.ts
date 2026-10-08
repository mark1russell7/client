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

  // List metadata files
  const listResult = await ctx.client.call<
    { bucket: string; prefix?: string; maxKeys?: number; delimiter?: string },
    { contents: Array<{ key: string; size: number; lastModified: string }>; keyCount: number }
  >(["s3", "list"], {
    bucket: input.bucket,
    prefix,
    maxKeys: input.maxResults * 2, // Account for both archive and metadata files
  });

  // Filter for metadata files only
  const metadataKeys = listResult.contents
    .filter((obj) => obj.key.endsWith(".metadata.json"))
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
