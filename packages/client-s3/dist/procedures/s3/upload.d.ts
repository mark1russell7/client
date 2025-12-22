/**
 * s3.upload procedure
 *
 * Upload content to S3 bucket.
 */
import type { S3UploadInput, S3UploadOutput } from "../../types.js";
/**
 * Upload content to S3
 *
 * @example
 * // Upload text content
 * await client.call(["s3", "upload"], {
 *   bucket: "my-bucket",
 *   key: "path/to/file.json",
 *   body: JSON.stringify({ data: "value" }),
 *   contentType: "application/json",
 * });
 *
 * @example
 * // Upload base64 binary
 * await client.call(["s3", "upload"], {
 *   bucket: "my-bucket",
 *   key: "path/to/image.png",
 *   body: base64EncodedData,
 *   base64: true,
 *   contentType: "image/png",
 * });
 */
export declare function s3Upload(input: S3UploadInput): Promise<S3UploadOutput>;
//# sourceMappingURL=upload.d.ts.map