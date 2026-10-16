/**
 * s3.presign procedure (roadmap R44)
 *
 * A presigned URL for a GET (download) or a PUT (upload) of one object. The procedure signs the
 * URL with the credentials of the S3 client (Signature Version 4). It sends no request to S3.
 *
 * Effects: the procedure changes nothing. It reads the credentials: the environment, the AWS
 * files of the host, or the instance metadata service of the default credential chain. So it
 * declares `reads: ["fs", "network"]` and `writes: []`.
 *
 * A PUT URL lets its holder write the object without the host. So a call that cannot change S3
 * (its capability does not permit the writes of `s3.upload`, or permits no destructive call)
 * gets no PUT URL: the procedure refuses it with FORBIDDEN.
 */

import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { InvocationError, type Capability } from "@procedures/client";
import { getS3Client } from "../../s3-client.js";
import type { S3PresignInput, S3PresignOutput } from "../../types.js";

/** The default expiry of a presigned URL: 15 minutes. */
export const DEFAULT_PRESIGN_SECONDS = 900;

/** The writes of `s3.upload`: a capability must permit them for a PUT URL. */
const UPLOAD_WRITES = ["s3", "network"];

/** True when a capability permits the writes of an upload. No capability: no limit. */
export function permitsUpload(capability: Capability | undefined): boolean {
  const permitted = capability?.effects;
  if (!permitted) return true;
  if (permitted.destructive === false) return false;
  const writes = permitted.writes;
  return writes === undefined || writes === "any" || UPLOAD_WRITES.every((name) => writes.includes(name));
}

/**
 * A presigned URL for a GET or a PUT of an object
 */
export async function s3Presign(input: S3PresignInput, capability?: Capability): Promise<S3PresignOutput> {
  const method = input.method ?? "GET";
  const expiresIn = input.expiresIn ?? DEFAULT_PRESIGN_SECONDS;
  if (method === "PUT" && !permitsUpload(capability)) {
    throw new InvocationError(
      "FORBIDDEN",
      "s3.presign: a PUT URL lets its holder write the object, and this call cannot change s3",
      ["s3", "presign"],
      "effects-exceeded",
    );
  }
  const command =
    method === "PUT"
      ? new PutObjectCommand({ Bucket: input.bucket, Key: input.key, ContentType: input.contentType })
      : new GetObjectCommand({ Bucket: input.bucket, Key: input.key, VersionId: input.versionId });
  // The time of the signature: the URL expires expiresIn seconds after it
  const signedAt = new Date();
  signedAt.setMilliseconds(0);
  const url = await getSignedUrl(getS3Client(), command, { expiresIn, signingDate: signedAt });
  return { url, method, expiresIn, expiresAt: new Date(signedAt.getTime() + expiresIn * 1000).toISOString() };
}
