/**
 * s3.listAll procedure
 *
 * List ALL objects in an S3 bucket, transparently following the
 * ListObjectsV2 continuation token so that buckets/prefixes with more than
 * 1000 keys are fully reachable in a single call.
 */
import { s3List } from "./list.js";
/**
 * List every object under a bucket/prefix, following pagination automatically.
 *
 * Unlike `s3.list` (which returns at most one page — up to 1000 keys — and
 * exposes `nextContinuationToken` for manual paging), `s3.listAll` loops until
 * the result is no longer truncated and returns the aggregated contents.
 *
 * @example
 * const { contents, keyCount } = await client.call(["s3", "listAll"], {
 *   bucket: "my-bucket",
 *   prefix: "snapshots/",
 * });
 * console.log(keyCount); // e.g. 4213, not clamped to 1000
 */
export async function s3ListAll(input) {
    const contents = [];
    const commonPrefixes = [];
    const seenPrefixes = new Set();
    let continuationToken = undefined;
    let pageCount = 0;
    do {
        const page = await s3List({
            bucket: input.bucket,
            prefix: input.prefix,
            delimiter: input.delimiter,
            maxKeys: input.maxKeys,
            continuationToken,
        });
        pageCount += 1;
        for (const object of page.contents) {
            contents.push(object);
        }
        for (const prefix of page.commonPrefixes) {
            if (!seenPrefixes.has(prefix)) {
                seenPrefixes.add(prefix);
                commonPrefixes.push(prefix);
            }
        }
        // Only continue while S3 reports more results AND hands back a token.
        continuationToken = page.isTruncated ? page.nextContinuationToken : undefined;
    } while (continuationToken);
    return {
        contents,
        commonPrefixes,
        keyCount: contents.length,
        pageCount,
    };
}
//# sourceMappingURL=list-all.js.map