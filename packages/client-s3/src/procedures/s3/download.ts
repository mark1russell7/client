/**
 * s3.download procedure
 *
 * Download content from S3 bucket.
 */

import { createWriteStream } from "node:fs";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getS3Client } from "../../s3-client.js";
import type { S3DownloadInput, S3DownloadOutput } from "../../types.js";

/** Largest object loaded into memory by default (the base64 body is a third larger again) */
const DEFAULT_MAX_BYTES = 64 * 1024 * 1024;

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
 *
 * @example
 * // Download a large object straight to a file
 * await client.call(["s3", "download"], {
 *   bucket: "my-bucket",
 *   key: "backups/archive.tar.gz",
 *   destPath: "/tmp/archive.tar.gz",
 * });
 */
export async function s3Download(input: S3DownloadInput): Promise<S3DownloadOutput> {
  const client = getS3Client();

  const command = new GetObjectCommand({
    Bucket: input.bucket,
    Key: input.key,
    VersionId: input.versionId,
  });

  const response = await client.send(command);

  // To a file: stream the body, nothing is held in memory (BUGS-2026-07 M22)
  if (input.destPath) {
    if (!response.Body) {
      throw new Error("Empty response body");
    }
    await pipeline(response.Body as Readable, createWriteStream(input.destPath));
    return {
      body: "",
      path: input.destPath,
      contentLength: response.ContentLength ?? 0,
      contentType: response.ContentType,
      etag: response.ETag?.replace(/"/g, ""),
      lastModified: response.LastModified?.toISOString(),
    };
  }

  // Into memory: refuse an object that is too large before reading it (BUGS-2026-07 M22)
  const maxBytes = input.maxBytes ?? DEFAULT_MAX_BYTES;
  if (response.ContentLength !== undefined && response.ContentLength > maxBytes) {
    (response.Body as Readable | undefined)?.destroy?.();
    throw new Error(
      `Object is ${response.ContentLength} bytes, more than maxBytes (${maxBytes}). Use destPath to download it to a file.`
    );
  }

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
