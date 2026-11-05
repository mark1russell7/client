/**
 * s3.upload procedure
 *
 * Upload content to S3 bucket, from a string in memory or from a file.
 */

import { open, type FileHandle } from "node:fs/promises";
import type { Stats } from "node:fs";
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  PutObjectCommand,
  UploadPartCommand,
  type CompletedPart,
} from "@aws-sdk/client-s3";
import { getS3Client } from "../../s3-client.js";
import type { S3UploadInput, S3UploadOutput } from "../../types.js";

/** The size of one part of a file, in bytes. A file of this size or less goes in one put. */
export const PART_BYTES: number = 8 * 1024 * 1024;

/** The largest number of parts that S3 takes in one multipart upload. */
export const MOST_PARTS = 10_000;

/**
 * This function gives the size of the parts of a file. A very large file has larger parts, because
 * S3 takes at most `MOST_PARTS` parts. The peak memory of an upload is one part of this size.
 */
export function partBytesOf(size: number): number {
  return Math.max(PART_BYTES, Math.ceil(size / MOST_PARTS));
}

/** This function gives the error of a file that changed after the upload started. */
function changed(sourcePath: string): Error {
  return new Error(`The file ${sourcePath} changed during the upload, so the object is not complete. Upload the file again.`);
}

/** This function fills the start of `buffer` from the file. A short file fails, because a short part is not the file. */
async function readPart(file: FileHandle, buffer: Buffer, length: number, position: number, sourcePath: string): Promise<void> {
  let done = 0;
  while (done < length) {
    const { bytesRead } = await file.read(buffer, done, length - done, position + done);
    if (bytesRead === 0) throw changed(sourcePath);
    done += bytesRead;
  }
}

/** This function fails when the size or the time of the file is not the same as at the start. */
async function assertSame(file: FileHandle, start: Stats, sourcePath: string): Promise<void> {
  const now = await file.stat();
  if (now.size !== start.size || now.mtimeMs !== start.mtimeMs) throw changed(sourcePath);
}

/**
 * This function sends the file part by part, one part at a time, with one buffer. On a failure it
 * aborts the upload, so S3 keeps no object and no parts. The first error stays the error of the
 * call, also when the abort fails.
 */
async function uploadParts(file: FileHandle, start: Stats, partBytes: number, input: S3UploadInput, sourcePath: string): Promise<S3UploadOutput> {
  const client = getS3Client();
  const target = { Bucket: input.bucket, Key: input.key };
  const created = await client.send(
    new CreateMultipartUploadCommand({ ...target, ContentType: input.contentType, Metadata: input.metadata }),
  );
  const UploadId = created.UploadId;
  if (UploadId === undefined) throw new Error(`S3 gave no upload id for ${input.key}`);
  try {
    const buffer = Buffer.allocUnsafeSlow(partBytes);
    const parts: CompletedPart[] = [];
    for (let position = 0; position < start.size; position += partBytes) {
      const length = Math.min(partBytes, start.size - position);
      await readPart(file, buffer, length, position, sourcePath);
      const PartNumber = parts.length + 1;
      const sent = await client.send(new UploadPartCommand({ ...target, UploadId, PartNumber, Body: buffer.subarray(0, length) }));
      parts.push({ ETag: sent.ETag, PartNumber });
    }
    await assertSame(file, start, sourcePath);
    const done = await client.send(new CompleteMultipartUploadCommand({ ...target, UploadId, MultipartUpload: { Parts: parts } }));
    return { etag: done.ETag?.replace(/"/g, "") || "", versionId: done.VersionId, location: `s3://${input.bucket}/${input.key}` };
  } catch (error) {
    await client.send(new AbortMultipartUploadCommand({ ...target, UploadId })).catch(() => undefined);
    throw error;
  }
}

/** This function uploads a file: in one put up to the size of one part, and in parts above it. */
async function uploadFile(input: S3UploadInput, sourcePath: string): Promise<S3UploadOutput> {
  const file = await open(sourcePath, "r");
  try {
    const start = await file.stat();
    if (!start.isFile()) throw new Error(`${sourcePath} is not a file`);
    const partBytes = partBytesOf(start.size);
    if (start.size > partBytes) return await uploadParts(file, start, partBytes, input, sourcePath);
    const body = Buffer.allocUnsafeSlow(start.size);
    await readPart(file, body, start.size, 0, sourcePath);
    await assertSame(file, start, sourcePath);
    return await put(input, body);
  } finally {
    await file.close();
  }
}

/** This function sends one put. */
async function put(input: S3UploadInput, body: Buffer | string): Promise<S3UploadOutput> {
  const response = await getS3Client().send(
    new PutObjectCommand({
      Bucket: input.bucket,
      Key: input.key,
      Body: body,
      ContentType: input.contentType,
      Metadata: input.metadata,
    }),
  );
  return {
    etag: response.ETag?.replace(/"/g, "") || "",
    versionId: response.VersionId,
    location: `s3://${input.bucket}/${input.key}`,
  };
}

/**
 * Upload content to S3
 *
 * @example
 * // Upload text content
 * await client.call(["s3", "upload"], {
 *   bucket: "my-bucket",
 *   key: "path/to/file.json",
 *   body: JSON.stringify({ data: "value" }),
 *   contentType: "application/json",
 * });
 *
 * @example
 * // Upload base64 binary
 * await client.call(["s3", "upload"], {
 *   bucket: "my-bucket",
 *   key: "path/to/image.png",
 *   body: base64EncodedData,
 *   base64: true,
 *   contentType: "image/png",
 * });
 *
 * @example
 * // Upload a large file in bounded memory: the object is whole or absent
 * await client.call(["s3", "upload"], {
 *   bucket: "my-bucket",
 *   key: "backups/archive.tar.gz",
 *   sourcePath: "/tmp/archive.tar.gz",
 * });
 */
export async function s3Upload(input: S3UploadInput): Promise<S3UploadOutput> {
  if (input.sourcePath !== undefined) {
    if (input.body !== undefined) throw new Error("Give body or sourcePath, and not the two");
    return uploadFile(input, input.sourcePath);
  }
  if (input.body === undefined) throw new Error("Give body or sourcePath, and not the two");
  return put(input, input.base64 ? Buffer.from(input.body, "base64") : input.body);
}
