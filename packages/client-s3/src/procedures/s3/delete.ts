/**
 * s3.delete procedure
 *
 * Delete object from S3 bucket.
 */

import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getS3Client } from "../../s3-client.js";
import type { S3DeleteInput, S3DeleteOutput } from "../../types.js";

/**
 * Delete object from S3
 *
 * @example
 * // Delete an object
 * await client.call(["s3", "delete"], {
 *   bucket: "my-bucket",
 *   key: "path/to/file.json",
 * });
 *
 * @example
 * // Delete specific version
 * await client.call(["s3", "delete"], {
 *   bucket: "my-bucket",
 *   key: "path/to/file.json",
 *   versionId: "abc123",
 * });
 */
export async function s3Delete(input: S3DeleteInput): Promise<S3DeleteOutput> {
  const client = getS3Client();

  const command = new DeleteObjectCommand({
    Bucket: input.bucket,
    Key: input.key,
    VersionId: input.versionId,
  });

  const response = await client.send(command);

  return {
    deleted: true,
    deleteMarker: response.DeleteMarker,
    versionId: response.VersionId,
  };
}
