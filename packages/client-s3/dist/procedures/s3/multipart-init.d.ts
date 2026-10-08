/**
 * s3.multipart.init procedure
 *
 * Initialize a multipart upload for large files.
 */
import type { S3MultipartInitInput, S3MultipartInitOutput } from "../../types.js";
/**
 * Initialize multipart upload
 *
 * Use this for files larger than 5MB. Workflow:
 * 1. s3.multipart.init - get uploadId
 * 2. s3.multipart.upload - upload each part (5MB min, except last)
 * 3. s3.multipart.complete - finalize with part ETags
 *
 * @example
 * const init = await client.call(["s3", "multipart", "init"], {
 *   bucket: "my-bucket",
 *   key: "large-file.tar.gz",
 *   contentType: "application/gzip",
 * });
 * console.log(init.uploadId); // Use for subsequent part uploads
 */
export declare function s3MultipartInit(input: S3MultipartInitInput): Promise<S3MultipartInitOutput>;
//# sourceMappingURL=multipart-init.d.ts.map