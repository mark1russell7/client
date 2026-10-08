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
/**
 * List every object under `prefix`, following S3 pagination via
 * continuationToken until the listing is no longer truncated.
 */
export declare function listAllObjects(ctx: ProcedureContext, bucket: string, prefix: string): Promise<S3ListedObject[]>;
/**
 * Find the single object whose basename is exactly `${id}${suffix}`.
 *
 * Matching is by exact basename equality, never substring, so an id that is a
 * substring of a different snapshot's id can never resolve to the wrong file.
 */
export declare function findSnapshotKey(objects: S3ListedObject[], id: string, suffix: string): string | undefined;
/**
 * All object keys belonging to snapshot `id` (archive + metadata), matched by
 * exact basename so delete can never remove a different snapshot's files.
 */
export declare function findSnapshotKeys(objects: S3ListedObject[], id: string): string[];
//# sourceMappingURL=s3-lookup.d.ts.map