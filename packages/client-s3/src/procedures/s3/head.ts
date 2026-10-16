/**
 * s3.head procedure (roadmap R44)
 *
 * The metadata of an object, without its content (a HEAD request). A 404 gives `exists: false`.
 * A HEAD response has no body, so S3 cannot tell a missing key from a missing bucket: the two
 * give `exists: false`.
 */

import { HeadObjectCommand } from "@aws-sdk/client-s3";
import { getS3Client } from "../../s3-client.js";
import type { S3HeadInput, S3HeadOutput } from "../../types.js";

/** True for the answer 404 of S3: the SDK names it `NotFound` (or `NoSuchKey`). */
function isNotFound(error: unknown): boolean {
  const failure = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return failure.name === "NotFound" || failure.name === "NoSuchKey" || failure.$metadata?.httpStatusCode === 404;
}

/**
 * The metadata of an object
 */
export async function s3Head(input: S3HeadInput): Promise<S3HeadOutput> {
  let response;
  try {
    response = await getS3Client().send(new HeadObjectCommand({ Bucket: input.bucket, Key: input.key, VersionId: input.versionId }));
  } catch (error) {
    if (isNotFound(error)) return { exists: false };
    throw error;
  }
  const output: S3HeadOutput = { exists: true };
  if (response.ContentLength !== undefined) output.contentLength = response.ContentLength;
  if (response.ContentType !== undefined) output.contentType = response.ContentType;
  if (response.ETag !== undefined) output.etag = response.ETag.replace(/"/g, "");
  if (response.LastModified !== undefined) output.lastModified = response.LastModified.toISOString();
  if (response.VersionId !== undefined) output.versionId = response.VersionId;
  if (response.StorageClass !== undefined) output.storageClass = response.StorageClass;
  if (response.Metadata !== undefined) output.metadata = response.Metadata;
  return output;
}
