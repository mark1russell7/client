/**
 * s3.multipart.complete procedure
 *
 * Complete a multipart upload by assembling parts.
 */

import { CompleteMultipartUploadCommand } from "@aws-sdk/client-s3";
import { getS3Client } from "../../s3-client.js";
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
export async function s3MultipartComplete(
  input: S3MultipartCompleteInput
): Promise<S3MultipartCompleteOutput> {
  const client = getS3Client();

  const command = new CompleteMultipartUploadCommand({
    Bucket: input.bucket,
    Key: input.key,
    UploadId: input.uploadId,
    MultipartUpload: {
      Parts: input.parts.map((part) => ({
        ETag: `"${part.etag}"`,
        PartNumber: part.partNumber,
      })),
    },
  });

  const response = await client.send(command);

  return {
    location: response.Location || `s3://${input.bucket}/${input.key}`,
    bucket: response.Bucket || input.bucket,
    key: response.Key || input.key,
    etag: response.ETag?.replace(/"/g, "") || "",
  };
}
