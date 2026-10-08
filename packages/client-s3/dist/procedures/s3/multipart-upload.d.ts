/**
 * s3.multipart.upload procedure
 *
 * Upload a part in a multipart upload.
 */
import type { S3MultipartUploadInput, S3MultipartUploadOutput } from "../../types.js";
/**
 * Upload a single part in multipart upload
 *
 * Parts must be at least 5MB (except the last part).
 * Part numbers range from 1 to 10000.
 *
 * @example
 * const part1 = await client.call(["s3", "multipart", "upload"], {
 *   bucket: "my-bucket",
 *   key: "large-file.tar.gz",
 *   uploadId: "abc123",
 *   partNumber: 1,
 *   body: base64EncodedChunk1,
 * });
 * // Store part1.etag for complete call
 */
export declare function s3MultipartUpload(input: S3MultipartUploadInput): Promise<S3MultipartUploadOutput>;
//# sourceMappingURL=multipart-upload.d.ts.map