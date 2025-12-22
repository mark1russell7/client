/**
 * s3.multipart.abort procedure
 *
 * Abort a multipart upload and clean up parts.
 */
import type { S3MultipartAbortInput, S3MultipartAbortOutput } from "../../types.js";
/**
 * Abort multipart upload
 *
 * Use to cancel an in-progress multipart upload.
 * This cleans up any parts that were already uploaded.
 *
 * @example
 * await client.call(["s3", "multipart", "abort"], {
 *   bucket: "my-bucket",
 *   key: "large-file.tar.gz",
 *   uploadId: "abc123",
 * });
 */
export declare function s3MultipartAbort(input: S3MultipartAbortInput): Promise<S3MultipartAbortOutput>;
//# sourceMappingURL=multipart-abort.d.ts.map