/**
 * s3.download procedure
 *
 * Download content from S3 bucket.
 */
import type { S3DownloadInput, S3DownloadOutput } from "../../types.js";
/**
 * Download content from S3
 *
 * @example
 * // Download text file
 * const result = await client.call(["s3", "download"], {
 *   bucket: "my-bucket",
 *   key: "path/to/file.json",
 *   encoding: "utf8",
 * });
 * console.log(result.body); // JSON string
 *
 * @example
 * // Download binary as base64
 * const result = await client.call(["s3", "download"], {
 *   bucket: "my-bucket",
 *   key: "path/to/image.png",
 * });
 * console.log(result.body); // base64 encoded
 */
export declare function s3Download(input: S3DownloadInput): Promise<S3DownloadOutput>;
//# sourceMappingURL=download.d.ts.map