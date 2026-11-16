/**
 * s3.read procedure
 *
 * This procedure reads an S3 object into memory, with a size limit. It writes no file.
 */

import type { S3ReadInput, S3ReadOutput } from "../../types.js";
import { s3Download } from "./download.js";

/**
 * This function reads an S3 object into memory. `maxBytes` is the limit (64 MiB by default). The
 * body is text with an encoding, and base64 without one.
 *
 * `s3.download` writes a file with `destPath`, so its declared effects include the writes of `fs`.
 * `s3.read` declares no writes. A procedure that only reads an object uses it.
 *
 * @example
 * const result = await client.call(["s3", "read"], {
 *   bucket: "my-bucket",
 *   key: "snapshots/latest.json",
 *   encoding: "utf8",
 * });
 */
export async function s3Read(input: S3ReadInput): Promise<S3ReadOutput> {
  // The function copies the fields: a destPath of a direct call does not get to s3Download
  const { bucket, key, encoding, versionId, maxBytes } = input;
  const { body, contentLength, contentType, etag, lastModified } = await s3Download({ bucket, key, encoding, versionId, maxBytes });
  return { body, contentLength, contentType, etag, lastModified };
}
