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
/**
 * List every object under `prefix`, following S3 pagination via
 * continuationToken until the listing is no longer truncated.
 */
export async function listAllObjects(ctx, bucket, prefix) {
    const all = [];
    let continuationToken;
    do {
        const result = await ctx.client.call(["s3", "list"], {
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
function basenameOf(key) {
    const idx = key.lastIndexOf("/");
    return idx === -1 ? key : key.slice(idx + 1);
}
/**
 * Find the single object whose basename is exactly `${id}${suffix}`.
 *
 * Matching is by exact basename equality, never substring, so an id that is a
 * substring of a different snapshot's id can never resolve to the wrong file.
 */
export function findSnapshotKey(objects, id, suffix) {
    const target = `${id}${suffix}`;
    return objects.find((obj) => basenameOf(obj.key) === target)?.key;
}
/**
 * All object keys belonging to snapshot `id` (archive + metadata), matched by
 * exact basename so delete can never remove a different snapshot's files.
 */
export function findSnapshotKeys(objects, id) {
    const targets = new Set([`${id}.tar.gz`, `${id}.metadata.json`]);
    return objects.filter((obj) => targets.has(basenameOf(obj.key))).map((obj) => obj.key);
}
//# sourceMappingURL=s3-lookup.js.map