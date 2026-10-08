/**
 * s3.download procedure
 *
 * Download content from S3 bucket.
 */

import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getS3Client } from "../../s3-client.js";
import type { S3DownloadInput, S3DownloadOutput } from "../../types.js";

/**
 * Download content from S3
 *
 * @example
 * // Download text file
 * const result = await client.call(["s3", "download"], {
 *   bucket: "my-bucket",
 *   key: "path/to/file.json",
 *   encoding: "utf8",
 * });
 * console.log(result.body); // JSON string
 *
 * @example
 * // Download binary as base64
 * const result = await client.call(["s3", "download"], {
 *   bucket: "my-bucket",
 *   key: "path/to/image.png",
 * });
 * console.log(result.body); // base64 encoded
 */
export async function s3Download(input: S3DownloadInput): Promise<S3DownloadOutput> {
  const client = getS3Client();

  const command = new GetObjectCommand({
    Bucket: input.bucket,
    Key: input.key,
    VersionId: input.versionId,
  });

  const response = await client.send(command);

  // Read body as bytes
  const bodyBytes = await response.Body?.transformToByteArray();
  if (!bodyBytes) {
    throw new Error("Empty response body");
  }

  // Convert to string based on encoding
  let body: string;
  if (input.encoding) {
    body = Buffer.from(bodyBytes).toString(input.encoding as BufferEncoding);
  } else {
    body = Buffer.from(bodyBytes).toString("base64");
  }

  return {
    body,
    contentLength: response.ContentLength || bodyBytes.length,
    contentType: response.ContentType,
    etag: response.ETag?.replace(/"/g, ""),
    lastModified: response.LastModified?.toISOString(),
  };
}
