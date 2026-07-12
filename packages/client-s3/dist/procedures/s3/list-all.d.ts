/**
 * s3.listAll procedure
 *
 * List ALL objects in an S3 bucket, transparently following the
 * ListObjectsV2 continuation token so that buckets/prefixes with more than
 * 1000 keys are fully reachable in a single call.
 */
import type { S3ListAllInput, S3ListAllOutput } from "../../types.js";
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
export declare function s3ListAll(input: S3ListAllInput): Promise<S3ListAllOutput>;
//# sourceMappingURL=list-all.d.ts.map