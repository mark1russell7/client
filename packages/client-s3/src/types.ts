/**
 * Type definitions for client-s3 procedures
 *
 * AWS S3 operations: upload, download, list, delete, multipart upload
 * Credentials are loaded from environment variables (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)
 */

import { z } from "zod";

// =============================================================================
// S3 Client Configuration (from environment)
// =============================================================================

export interface S3Config {
  /** AWS region (from AWS_REGION env var, defaults to us-east-1) */
  region: string;
  /** Optional custom endpoint (for MinIO, LocalStack, etc.) */
  endpoint?: string | undefined;
  /**
   * Access key ID (from AWS_ACCESS_KEY_ID env var).
   * Optional: when absent, the AWS SDK default credential provider chain
   * (SSO, IAM roles/IMDS, shared config profiles, etc.) is used instead.
   */
  accessKeyId?: string | undefined;
  /** Secret access key (from AWS_SECRET_ACCESS_KEY env var). Optional; see accessKeyId. */
  secretAccessKey?: string | undefined;
  /**
   * Session token (from AWS_SESSION_TOKEN env var) for STS/SSO temporary
   * credentials. Present only alongside a temporary access key/secret pair.
   */
  sessionToken?: string | undefined;
}

// =============================================================================
// s3.upload Types
// =============================================================================

export const S3UploadInputSchema: z.ZodObject<{
  bucket: z.ZodString;
  key: z.ZodString;
  body: z.ZodString;
  contentType: z.ZodOptional<z.ZodString>;
  base64: z.ZodOptional<z.ZodBoolean>;
  metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
}> = z.object({
  /** S3 bucket name */
  bucket: z.string(),
  /** Object key (path in bucket) */
  key: z.string(),
  /** Content to upload - string or base64 encoded binary */
  body: z.string(),
  /** Content type (e.g., "application/json", "text/plain") */
  contentType: z.string().optional(),
  /** If true, body is base64 encoded binary data */
  base64: z.boolean().optional(),
  /** Optional metadata key-value pairs */
  metadata: z.record(z.string()).optional(),
});

export type S3UploadInput = z.infer<typeof S3UploadInputSchema>;

export interface S3UploadOutput {
  /** ETag of uploaded object */
  etag: string;
  /** Version ID if bucket versioning is enabled */
  versionId?: string | undefined;
  /** Full S3 URI */
  location: string;
}

// =============================================================================
// s3.download Types
// =============================================================================

export const S3DownloadInputSchema: z.ZodObject<{
  bucket: z.ZodString;
  key: z.ZodString;
  encoding: z.ZodOptional<z.ZodString>;
  versionId: z.ZodOptional<z.ZodString>;
}> = z.object({
  /** S3 bucket name */
  bucket: z.string(),
  /** Object key (path in bucket) */
  key: z.string(),
  /** Encoding for text content (utf8, ascii, etc.) - omit for base64 binary */
  encoding: z.string().optional(),
  /** Specific version to download */
  versionId: z.string().optional(),
});

export type S3DownloadInput = z.infer<typeof S3DownloadInputSchema>;

export interface S3DownloadOutput {
  /** Object content (string if encoding specified, base64 otherwise) */
  body: string;
  /** Content length in bytes */
  contentLength: number;
  /** Content type */
  contentType?: string | undefined;
  /** ETag of object */
  etag?: string | undefined;
  /** Last modified date as ISO string */
  lastModified?: string | undefined;
}

// =============================================================================
// s3.list Types
// =============================================================================

export const S3ListInputSchema: z.ZodObject<{
  bucket: z.ZodString;
  prefix: z.ZodOptional<z.ZodString>;
  maxKeys: z.ZodOptional<z.ZodNumber>;
  continuationToken: z.ZodOptional<z.ZodString>;
  delimiter: z.ZodOptional<z.ZodString>;
}> = z.object({
  /** S3 bucket name */
  bucket: z.string(),
  /** Filter objects by prefix */
  prefix: z.string().optional(),
  /** Maximum number of keys to return (default 1000) */
  maxKeys: z.number().optional(),
  /** Continuation token for pagination */
  continuationToken: z.string().optional(),
  /** Delimiter for hierarchical listing (e.g., "/") */
  delimiter: z.string().optional(),
});

export type S3ListInput = z.infer<typeof S3ListInputSchema>;

export interface S3ListObject {
  /** Object key */
  key: string;
  /** Size in bytes */
  size: number;
  /** Last modified date as ISO string */
  lastModified: string;
  /** ETag */
  etag: string;
  /** Storage class */
  storageClass?: string | undefined;
}

export interface S3ListOutput {
  /** List of objects */
  contents: S3ListObject[];
  /** Common prefixes (when using delimiter) */
  commonPrefixes: string[];
  /** Whether there are more results */
  isTruncated: boolean;
  /** Token for next page of results */
  nextContinuationToken?: string | undefined;
  /** Number of keys returned */
  keyCount: number;
}

// =============================================================================
// s3.delete Types
// =============================================================================

export const S3DeleteInputSchema: z.ZodObject<{
  bucket: z.ZodString;
  key: z.ZodString;
  versionId: z.ZodOptional<z.ZodString>;
}> = z.object({
  /** S3 bucket name */
  bucket: z.string(),
  /** Object key (path in bucket) */
  key: z.string(),
  /** Specific version to delete */
  versionId: z.string().optional(),
});

export type S3DeleteInput = z.infer<typeof S3DeleteInputSchema>;

export interface S3DeleteOutput {
  /** Whether deletion was successful */
  deleted: boolean;
  /** Delete marker if versioning enabled */
  deleteMarker?: boolean | undefined;
  /** Version ID of delete marker */
  versionId?: string | undefined;
}

// =============================================================================
// s3.multipart.init Types
// =============================================================================

export const S3MultipartInitInputSchema: z.ZodObject<{
  bucket: z.ZodString;
  key: z.ZodString;
  contentType: z.ZodOptional<z.ZodString>;
  metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
}> = z.object({
  /** S3 bucket name */
  bucket: z.string(),
  /** Object key (path in bucket) */
  key: z.string(),
  /** Content type */
  contentType: z.string().optional(),
  /** Optional metadata */
  metadata: z.record(z.string()).optional(),
});

export type S3MultipartInitInput = z.infer<typeof S3MultipartInitInputSchema>;

export interface S3MultipartInitOutput {
  /** Upload ID for subsequent part uploads */
  uploadId: string;
  /** Bucket name */
  bucket: string;
  /** Object key */
  key: string;
}

// =============================================================================
// s3.multipart.upload Types
// =============================================================================

export const S3MultipartUploadInputSchema: z.ZodObject<{
  bucket: z.ZodString;
  key: z.ZodString;
  uploadId: z.ZodString;
  partNumber: z.ZodNumber;
  body: z.ZodString;
}> = z.object({
  /** S3 bucket name */
  bucket: z.string(),
  /** Object key */
  key: z.string(),
  /** Upload ID from init */
  uploadId: z.string(),
  /** Part number (1-10000) */
  partNumber: z.number().min(1).max(10000),
  /** Part content - base64 encoded */
  body: z.string(),
});

export type S3MultipartUploadInput = z.infer<typeof S3MultipartUploadInputSchema>;

export interface S3MultipartUploadOutput {
  /** ETag of uploaded part */
  etag: string;
  /** Part number */
  partNumber: number;
}

// =============================================================================
// s3.multipart.complete Types
// =============================================================================

export const S3MultipartCompleteInputSchema: z.ZodObject<{
  bucket: z.ZodString;
  key: z.ZodString;
  uploadId: z.ZodString;
  parts: z.ZodArray<z.ZodObject<{
    etag: z.ZodString;
    partNumber: z.ZodNumber;
  }>>;
}> = z.object({
  /** S3 bucket name */
  bucket: z.string(),
  /** Object key */
  key: z.string(),
  /** Upload ID from init */
  uploadId: z.string(),
  /** Parts to complete (etag and partNumber) */
  parts: z.array(
    z.object({
      etag: z.string(),
      partNumber: z.number(),
    })
  ),
});

export type S3MultipartCompleteInput = z.infer<typeof S3MultipartCompleteInputSchema>;

export interface S3MultipartCompleteOutput {
  /** Location URL of completed object */
  location: string;
  /** Bucket name */
  bucket: string;
  /** Object key */
  key: string;
  /** ETag of completed object */
  etag: string;
}

// =============================================================================
// s3.multipart.abort Types
// =============================================================================

export const S3MultipartAbortInputSchema: z.ZodObject<{
  bucket: z.ZodString;
  key: z.ZodString;
  uploadId: z.ZodString;
}> = z.object({
  /** S3 bucket name */
  bucket: z.string(),
  /** Object key */
  key: z.string(),
  /** Upload ID to abort */
  uploadId: z.string(),
});

export type S3MultipartAbortInput = z.infer<typeof S3MultipartAbortInputSchema>;

export interface S3MultipartAbortOutput {
  /** Whether abort was successful */
  aborted: boolean;
}
