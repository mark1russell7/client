/**
 * s3.list procedure
 *
 * List objects in S3 bucket.
 */
import type { S3ListInput, S3ListOutput } from "../../types.js";
/**
 * List objects in S3 bucket
 *
 * @example
 * // List all objects with prefix
 * const result = await client.call(["s3", "list"], {
 *   bucket: "my-bucket",
 *   prefix: "snapshots/",
 *   maxKeys: 100,
 * });
 *
 * @example
 * // Hierarchical listing with delimiter
 * const result = await client.call(["s3", "list"], {
 *   bucket: "my-bucket",
 *   prefix: "data/",
 *   delimiter: "/",
 * });
 * console.log(result.commonPrefixes); // ["data/2024/", "data/2025/"]
 */
export declare function s3List(input: S3ListInput): Promise<S3ListOutput>;
//# sourceMappingURL=list.d.ts.map