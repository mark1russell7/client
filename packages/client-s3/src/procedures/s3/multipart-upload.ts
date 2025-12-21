/**
 * s3.multipart.upload procedure
 *
 * Upload a part in a multipart upload.
 */

import { UploadPartCommand } from "@aws-sdk/client-s3";
import { getS3Client } from "../../s3-client.js";
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
export async function s3MultipartUpload(
  input: S3MultipartUploadInput
): Promise<S3MultipartUploadOutput> {
  const client = getS3Client();

  // Body is always base64 encoded for multipart
  const body = Buffer.from(input.body, "base64");

  const command = new UploadPartCommand({
    Bucket: input.bucket,
    Key: input.key,
    UploadId: input.uploadId,
    PartNumber: input.partNumber,
    Body: body,
  });

  const response = await client.send(command);

  if (!response.ETag) {
    throw new Error(`Failed to upload part ${input.partNumber}: no ETag returned`);
  }

  return {
    etag: response.ETag.replace(/"/g, ""),
    partNumber: input.partNumber,
  };
}
