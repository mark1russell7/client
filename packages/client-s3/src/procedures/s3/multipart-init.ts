/**
 * s3.multipart.init procedure
 *
 * Initialize a multipart upload for large files.
 */

import { CreateMultipartUploadCommand } from "@aws-sdk/client-s3";
import { getS3Client } from "../../s3-client.js";
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
export async function s3MultipartInit(
  input: S3MultipartInitInput
): Promise<S3MultipartInitOutput> {
  const client = getS3Client();

  const command = new CreateMultipartUploadCommand({
    Bucket: input.bucket,
    Key: input.key,
    ContentType: input.contentType,
    Metadata: input.metadata,
  });

  const response = await client.send(command);

  if (!response.UploadId) {
    throw new Error("Failed to initialize multipart upload: no UploadId returned");
  }

  return {
    uploadId: response.UploadId,
    bucket: input.bucket,
    key: input.key,
  };
}
