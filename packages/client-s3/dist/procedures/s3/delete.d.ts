/**
 * s3.delete procedure
 *
 * Delete object from S3 bucket.
 */
import type { S3DeleteInput, S3DeleteOutput } from "../../types.js";
/**
 * Delete object from S3
 *
 * @example
 * // Delete an object
 * await client.call(["s3", "delete"], {
 *   bucket: "my-bucket",
 *   key: "path/to/file.json",
 * });
 *
 * @example
 * // Delete specific version
 * await client.call(["s3", "delete"], {
 *   bucket: "my-bucket",
 *   key: "path/to/file.json",
 *   versionId: "abc123",
 * });
 */
export declare function s3Delete(input: S3DeleteInput): Promise<S3DeleteOutput>;
//# sourceMappingURL=delete.d.ts.map