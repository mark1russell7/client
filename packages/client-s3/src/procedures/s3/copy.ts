/**
 * s3.copy procedure (roadmap R44)
 *
 * Copy an object inside S3 (CopyObject): the bytes do not pass through the host. The copy
 * replaces the object of the destination key, as S3 does. With `overwrite: false`, the request
 * has `If-None-Match: *`, and S3 refuses it with 412 when the destination key exists.
 *
 * One CopyObject request copies an object of at most 5 GiB. A larger object needs a multipart
 * copy, which this procedure does not do.
 */

import { CopyObjectCommand } from "@aws-sdk/client-s3";
import { getS3Client } from "../../s3-client.js";
import type { S3CopyInput, S3CopyOutput } from "../../types.js";

/**
 * The value of the header `x-amz-copy-source`: the bucket and the URL-encoded key, with the
 * version id of the source when the input gives one.
 */
export function copySource(bucket: string, key: string, versionId?: string): string {
  const encodedKey = key.split("/").map(encodeURIComponent).join("/");
  return `${bucket}/${encodedKey}${versionId ? `?versionId=${encodeURIComponent(versionId)}` : ""}`;
}

/**
 * Copy an object
 */
export async function s3Copy(input: S3CopyInput): Promise<S3CopyOutput> {
  const replace = input.contentType !== undefined || input.metadata !== undefined;
  const response = await getS3Client().send(
    new CopyObjectCommand({
      Bucket: input.bucket,
      Key: input.key,
      CopySource: copySource(input.sourceBucket ?? input.bucket, input.sourceKey, input.sourceVersionId),
      ...(input.overwrite === false ? { IfNoneMatch: "*" } : {}),
      ...(replace ? { MetadataDirective: "REPLACE" as const, ContentType: input.contentType, Metadata: input.metadata } : {}),
    }),
  );
  const output: S3CopyOutput = {
    etag: response.CopyObjectResult?.ETag?.replace(/"/g, "") ?? "",
    location: `s3://${input.bucket}/${input.key}`,
  };
  const lastModified = response.CopyObjectResult?.LastModified;
  if (lastModified !== undefined) output.lastModified = lastModified.toISOString();
  if (response.VersionId !== undefined) output.versionId = response.VersionId;
  if (response.CopySourceVersionId !== undefined) output.sourceVersionId = response.CopySourceVersionId;
  return output;
}
