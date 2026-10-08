/**
 * Shared S3 lookup helpers for snapshot procedures.
 *
 * Snapshot objects are stored under keys of the form
 *   snapshots/<name>/<id>.tar.gz
 *   snapshots/<name>/<id>.metadata.json
 * where <id> already embeds <name>, a timestamp and a random suffix, so the
 * final path segment (basename) of a key uniquely identifies a snapshot file.
 *
 * These helpers replace the previous "single s3.list + key.includes(id)"
 * approach, which (a) missed snapshots once a bucket held more than 1000
 * objects (S3 truncates and requires continuation), and (b) matched by
 * substring, so an id that is a substring of a different snapshot's id could
 * resolve to — and, for delete, remove — the wrong files.
 */

import type { ProcedureContext } from "@mark1russell7/client";

export interface S3ListedObject {
  key: string;
}

interface S3ListResult {
  contents: S3ListedObject[];
  isTruncated: boolean;
  nextContinuationToken?: string;
}

/**
 * List every object under `prefix`, following S3 pagination via
 * continuationToken until the listing is no longer truncated.
 */
export async function listAllObjects(
  ctx: ProcedureContext,
  bucket: string,
  prefix: string
): Promise<S3ListedObject[]> {
  const all: S3ListedObject[] = [];
  let continuationToken: string | undefined;

  do {
    const result = await ctx.client.call<
      { bucket: string; prefix?: string; continuationToken?: string },
      S3ListResult
    >(["s3", "list"], {
      bucket,
      prefix,
      ...(continuationToken ? { continuationToken } : {}),
    });

    all.push(...result.contents);
    continuationToken = result.isTruncated ? result.nextContinuationToken : undefined;
  } while (continuationToken);

  return all;
}

/** Final path segment of an S3 key. */
function basenameOf(key: string): string {
  const idx = key.lastIndexOf("/");
  return idx === -1 ? key : key.slice(idx + 1);
}

/**
 * Find the single object whose basename is exactly `${id}${suffix}`.
 *
 * Matching is by exact basename equality, never substring, so an id that is a
 * substring of a different snapshot's id can never resolve to the wrong file.
 */
export function findSnapshotKey(
  objects: S3ListedObject[],
  id: string,
  suffix: string
): string | undefined {
  const target = `${id}${suffix}`;
  return objects.find((obj) => basenameOf(obj.key) === target)?.key;
}

/**
 * All object keys belonging to snapshot `id` (archive + metadata), matched by
 * exact basename so delete can never remove a different snapshot's files.
 */
export function findSnapshotKeys(objects: S3ListedObject[], id: string): string[] {
  const targets = new Set([`${id}.tar.gz`, `${id}.metadata.json`]);
  return objects.filter((obj) => targets.has(basenameOf(obj.key))).map((obj) => obj.key);
}
