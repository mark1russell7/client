/**
 * s3.multipart.abort procedure
 *
 * Abort a multipart upload and clean up parts.
 */

import { AbortMultipartUploadCommand } from "@aws-sdk/client-s3";
import { getS3Client } from "../../s3-client.js";
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
export async function s3MultipartAbort(
  input: S3MultipartAbortInput
): Promise<S3MultipartAbortOutput> {
  const client = getS3Client();

  const command = new AbortMultipartUploadCommand({
    Bucket: input.bucket,
    Key: input.key,
    UploadId: input.uploadId,
  });

  await client.send(command);

  return {
    aborted: true,
  };
}
