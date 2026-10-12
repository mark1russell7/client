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
  bucket: z.string().describe("S3 bucket name"),
  /** Object key (path in bucket) */
  key: z.string().describe("Object key (path in bucket)"),
  /** Content to upload - string or base64 encoded binary */
  body: z.string().describe("Content to upload - string or base64 encoded binary"),
  /** Content type (e.g., "application/json", "text/plain") */
  contentType: z.string().optional().describe("Content type (e.g., \"application/json\", \"text/plain\")"),
  /** If true, body is base64 encoded binary data */
  base64: z.boolean().optional().describe("If true, body is base64 encoded binary data"),
  /** Optional metadata key-value pairs */
  metadata: z.record(z.string(), z.string()).optional().describe("Optional metadata key-value pairs"),
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
  destPath: z.ZodOptional<z.ZodString>;
  maxBytes: z.ZodOptional<z.ZodNumber>;
}> = z.object({
  /** S3 bucket name */
  bucket: z.string().describe("S3 bucket name"),
  /** Object key (path in bucket) */
  key: z.string().describe("Object key (path in bucket)"),
  /** Encoding for text content (utf8, ascii, etc.) - omit for base64 binary */
  encoding: z.string().optional().describe("Encoding for text content (utf8, ascii, etc.) - omit for base64 binary"),
  /** Specific version to download */
  versionId: z.string().optional().describe("Specific version to download"),
  /** Write the object to this file instead of returning it (streams to disk: no size limit, no base64) */
  destPath: z.string().optional().describe("Write the object to this file instead of returning it (streams to disk: no size limit, no base64)"),
  /** Largest object to load into memory when destPath is not set (default: 64 MiB) */
  maxBytes: z.number().int().positive().optional().describe("Largest object to load into memory when destPath is not set (default: 64 MiB)"),
});

export type S3DownloadInput = z.infer<typeof S3DownloadInputSchema>;

export interface S3DownloadOutput {
  /** Object content (string if encoding specified, base64 otherwise); empty when destPath was given */
  body: string;
  /** The file the object was written to, when destPath was given */
  path?: string | undefined;
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
  bucket: z.string().describe("S3 bucket name"),
  /** Filter objects by prefix */
  prefix: z.string().optional().describe("Filter objects by prefix"),
  /** Maximum number of keys to return (default 1000) */
  maxKeys: z.number().optional().describe("Maximum number of keys to return (default 1000)"),
  /** Continuation token for pagination */
  continuationToken: z.string().optional().describe("Continuation token for pagination"),
  /** Delimiter for hierarchical listing (e.g., "/") */
  delimiter: z.string().optional().describe("Delimiter for hierarchical listing (e.g., \"/\")"),
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
// s3.listAll Types
// =============================================================================

export const S3ListAllInputSchema: z.ZodObject<{
  bucket: z.ZodString;
  prefix: z.ZodOptional<z.ZodString>;
  maxKeys: z.ZodOptional<z.ZodNumber>;
  delimiter: z.ZodOptional<z.ZodString>;
}> = z.object({
  /** S3 bucket name */
  bucket: z.string().describe("S3 bucket name"),
  /** Filter objects by prefix */
  prefix: z.string().optional().describe("Filter objects by prefix"),
  /** Page size for each underlying request (default/max 1000); paging is automatic */
  maxKeys: z.number().optional().describe("Page size for each underlying request (default/max 1000); paging is automatic"),
  /** Delimiter for hierarchical listing (e.g., "/") */
  delimiter: z.string().optional().describe("Delimiter for hierarchical listing (e.g., \"/\")"),
});

export type S3ListAllInput = z.infer<typeof S3ListAllInputSchema>;

export interface S3ListAllOutput {
  /** All objects across every page (not capped at 1000) */
  contents: S3ListObject[];
  /** Deduplicated common prefixes across all pages (when using delimiter) */
  commonPrefixes: string[];
  /** Total number of keys returned */
  keyCount: number;
  /** Number of underlying ListObjectsV2 requests made */
  pageCount: number;
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
  bucket: z.string().describe("S3 bucket name"),
  /** Object key (path in bucket) */
  key: z.string().describe("Object key (path in bucket)"),
  /** Specific version to delete */
  versionId: z.string().optional().describe("Specific version to delete"),
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
  bucket: z.string().describe("S3 bucket name"),
  /** Object key (path in bucket) */
  key: z.string().describe("Object key (path in bucket)"),
  /** Content type */
  contentType: z.string().optional().describe("Content type"),
  /** Optional metadata */
  metadata: z.record(z.string(), z.string()).optional().describe("Optional metadata"),
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
  bucket: z.string().describe("S3 bucket name"),
  /** Object key */
  key: z.string().describe("Object key"),
  /** Upload ID from init */
  uploadId: z.string().describe("Upload ID from init"),
  /** Part number (1-10000) */
  partNumber: z.number().min(1).max(10000).describe("Part number (1-10000)"),
  /** Part content - base64 encoded */
  body: z.string().describe("Part content - base64 encoded"),
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
  bucket: z.string().describe("S3 bucket name"),
  /** Object key */
  key: z.string().describe("Object key"),
  /** Upload ID from init */
  uploadId: z.string().describe("Upload ID from init"),
  /** Parts to complete (etag and partNumber) */
  parts: z.array(
    z.object({
      etag: z.string(),
      partNumber: z.number(),
    })
  ).describe("Parts to complete (etag and partNumber)"),
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
  bucket: z.string().describe("S3 bucket name"),
  /** Object key */
  key: z.string().describe("Object key"),
  /** Upload ID to abort */
  uploadId: z.string().describe("Upload ID to abort"),
});

export type S3MultipartAbortInput = z.infer<typeof S3MultipartAbortInputSchema>;

export interface S3MultipartAbortOutput {
  /** Whether abort was successful */
  aborted: boolean;
}

// =============================================================================
// Output schemas (roadmap 2.1)
// =============================================================================

// Loose objects: a field that a schema does not name stays in the result (a strict schema would
// remove it when the output is validated).

export const S3UploadOutputSchema: z.ZodType<S3UploadOutput> = z.looseObject({
  etag: z.string().describe("The ETag of the object, without quotes"),
  versionId: z.string().optional().describe("The version id, when the bucket has versioning"),
  location: z.string().describe("The S3 URI of the object (s3://bucket/key)"),
});

export const S3DownloadOutputSchema: z.ZodType<S3DownloadOutput> = z.looseObject({
  body: z.string().describe("The content: text with an encoding, base64 without one, empty with destPath"),
  path: z.string().optional().describe("The file that holds the object, with destPath"),
  contentLength: z.number().describe("The size of the object, in bytes"),
  contentType: z.string().optional().describe("The content type"),
  etag: z.string().optional().describe("The ETag of the object, without quotes"),
  lastModified: z.string().optional().describe("The time of the last change (ISO 8601)"),
});

const listObject = z.looseObject({
  key: z.string().describe("The object key"),
  size: z.number().describe("The size, in bytes"),
  lastModified: z.string().describe("The time of the last change (ISO 8601)"),
  etag: z.string().describe("The ETag, without quotes"),
  storageClass: z.string().optional().describe("The storage class"),
});

export const S3ListOutputSchema: z.ZodType<S3ListOutput> = z.looseObject({
  contents: z.array(listObject).describe("The objects of the page"),
  commonPrefixes: z.array(z.string()).describe("The common prefixes (with a delimiter)"),
  isTruncated: z.boolean().describe("True when more pages exist"),
  nextContinuationToken: z.string().optional().describe("The token of the next page"),
  keyCount: z.number().describe("The number of keys on the page"),
});

export const S3ListAllOutputSchema: z.ZodType<S3ListAllOutput> = z.looseObject({
  contents: z.array(listObject).describe("The objects of all pages"),
  commonPrefixes: z.array(z.string()).describe("The common prefixes of all pages (with a delimiter)"),
  keyCount: z.number().describe("The number of keys"),
  pageCount: z.number().describe("The number of list requests"),
});

export const S3DeleteOutputSchema: z.ZodType<S3DeleteOutput> = z.looseObject({
  deleted: z.boolean().describe("True when the delete succeeded"),
  deleteMarker: z.boolean().optional().describe("True when versioning made a delete marker"),
  versionId: z.string().optional().describe("The version id of the delete marker"),
});

export const S3MultipartInitOutputSchema: z.ZodType<S3MultipartInitOutput> = z.looseObject({
  uploadId: z.string().describe("The upload id: the part uploads and complete take it"),
  bucket: z.string().describe("The bucket"),
  key: z.string().describe("The object key"),
});

export const S3MultipartUploadOutputSchema: z.ZodType<S3MultipartUploadOutput> = z.looseObject({
  etag: z.string().describe("The ETag of the part, without quotes: complete takes it"),
  partNumber: z.number().describe("The part number"),
});

export const S3MultipartCompleteOutputSchema: z.ZodType<S3MultipartCompleteOutput> = z.looseObject({
  location: z.string().describe("The location of the object"),
  bucket: z.string().describe("The bucket"),
  key: z.string().describe("The object key"),
  etag: z.string().describe("The ETag of the object, without quotes"),
});

export const S3MultipartAbortOutputSchema: z.ZodType<S3MultipartAbortOutput> = z.looseObject({
  aborted: z.boolean().describe("True when the upload was aborted"),
});
