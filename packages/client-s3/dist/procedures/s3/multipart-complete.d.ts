/**
 * s3.multipart.complete procedure
 *
 * Complete a multipart upload by assembling parts.
 */
import type { S3MultipartCompleteInput, S3MultipartCompleteOutput } from "../../types.js";
/**
 * Complete multipart upload
 *
 * Call after all parts have been uploaded. Parts must be provided
 * in order with their ETags from the upload responses.
 *
 * @example
 * const result = await client.call(["s3", "multipart", "complete"], {
 *   bucket: "my-bucket",
 *   key: "large-file.tar.gz",
 *   uploadId: "abc123",
 *   parts: [
 *     { partNumber: 1, etag: "etag1" },
 *     { partNumber: 2, etag: "etag2" },
 *     { partNumber: 3, etag: "etag3" },
 *   ],
 * });
 */
export declare function s3MultipartComplete(input: S3MultipartCompleteInput): Promise<S3MultipartCompleteOutput>;
//# sourceMappingURL=multipart-complete.d.ts.map