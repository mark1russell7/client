/**
 * s3.download procedure
 *
 * Download content from S3 bucket.
 */

import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { rename, rm } from "node:fs/promises";
import { Transform, type Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getS3Client } from "../../s3-client.js";
import type { S3DownloadInput, S3DownloadOutput } from "../../types.js";

/** Largest object loaded into memory by default (the base64 body is a third larger again) */
const DEFAULT_MAX_BYTES = 64 * 1024 * 1024;

function tooLarge(bytes: number | string, maxBytes: number): Error {
  return new Error(
    `Object is ${bytes} bytes, more than maxBytes (${maxBytes}). Use destPath to download it to a file.`
  );
}

/** A stream step that counts the bytes and fails past `maxBytes`. */
function byteLimit(maxBytes: number): Transform {
  let total = 0;
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      total += chunk.length;
      if (total > maxBytes) {
        callback(tooLarge(`more than ${maxBytes}`, maxBytes));
        return;
      }
      callback(null, chunk);
    },
  });
}

/**
 * Read a body into memory, counting the bytes. `Content-Length` can be missing or wrong, so the
 * count is the limit (deep dive DATA-14).
 */
async function readLimited(body: Readable, maxBytes: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of body) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    total += buffer.length;
    if (total > maxBytes) {
      body.destroy();
      throw tooLarge(`more than ${maxBytes}`, maxBytes);
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

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
    // Write a part file, then rename it. A failed transfer leaves the previous file
    // (createWriteStream on destPath truncated it first: deep dive DATA-14).
    const partPath = `${input.destPath}.${randomUUID().slice(0, 8)}.part`;
    const source = response.Body as Readable;
    try {
      if (input.maxBytes !== undefined) {
        await pipeline(source, byteLimit(input.maxBytes), createWriteStream(partPath));
      } else {
        await pipeline(source, createWriteStream(partPath));
      }
      await rename(partPath, input.destPath);
    } catch (error) {
      await rm(partPath, { force: true });
      throw error;
    }
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
    throw tooLarge(response.ContentLength, maxBytes);
  }

  if (!response.Body) {
    throw new Error("Empty response body");
  }
  const bodyBytes = await readLimited(response.Body as Readable, maxBytes);

  // Convert to string based on encoding
  let body: string;
  if (input.encoding) {
    body = bodyBytes.toString(input.encoding as BufferEncoding);
  } else {
    body = bodyBytes.toString("base64");
  }

  return {
    body,
    contentLength: bodyBytes.length,
    contentType: response.ContentType,
    etag: response.ETag?.replace(/"/g, ""),
    lastModified: response.LastModified?.toISOString(),
  };
}
