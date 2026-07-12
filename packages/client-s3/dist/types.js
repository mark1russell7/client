/**
 * Type definitions for client-s3 procedures
 *
 * AWS S3 operations: upload, download, list, delete, multipart upload
 * Credentials are loaded from environment variables (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)
 */
import { z } from "zod";
// =============================================================================
// s3.upload Types
// =============================================================================
export const S3UploadInputSchema = z.object({
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
// =============================================================================
// s3.download Types
// =============================================================================
export const S3DownloadInputSchema = z.object({
    /** S3 bucket name */
    bucket: z.string(),
    /** Object key (path in bucket) */
    key: z.string(),
    /** Encoding for text content (utf8, ascii, etc.) - omit for base64 binary */
    encoding: z.string().optional(),
    /** Specific version to download */
    versionId: z.string().optional(),
});
// =============================================================================
// s3.list Types
// =============================================================================
export const S3ListInputSchema = z.object({
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
// =============================================================================
// s3.listAll Types
// =============================================================================
export const S3ListAllInputSchema = z.object({
    /** S3 bucket name */
    bucket: z.string(),
    /** Filter objects by prefix */
    prefix: z.string().optional(),
    /** Page size for each underlying request (default/max 1000); paging is automatic */
    maxKeys: z.number().optional(),
    /** Delimiter for hierarchical listing (e.g., "/") */
    delimiter: z.string().optional(),
});
// =============================================================================
// s3.delete Types
// =============================================================================
export const S3DeleteInputSchema = z.object({
    /** S3 bucket name */
    bucket: z.string(),
    /** Object key (path in bucket) */
    key: z.string(),
    /** Specific version to delete */
    versionId: z.string().optional(),
});
// =============================================================================
// s3.multipart.init Types
// =============================================================================
export const S3MultipartInitInputSchema = z.object({
    /** S3 bucket name */
    bucket: z.string(),
    /** Object key (path in bucket) */
    key: z.string(),
    /** Content type */
    contentType: z.string().optional(),
    /** Optional metadata */
    metadata: z.record(z.string()).optional(),
});
// =============================================================================
// s3.multipart.upload Types
// =============================================================================
export const S3MultipartUploadInputSchema = z.object({
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
// =============================================================================
// s3.multipart.complete Types
// =============================================================================
export const S3MultipartCompleteInputSchema = z.object({
    /** S3 bucket name */
    bucket: z.string(),
    /** Object key */
    key: z.string(),
    /** Upload ID from init */
    uploadId: z.string(),
    /** Parts to complete (etag and partNumber) */
    parts: z.array(z.object({
        etag: z.string(),
        partNumber: z.number(),
    })),
});
// =============================================================================
// s3.multipart.abort Types
// =============================================================================
export const S3MultipartAbortInputSchema = z.object({
    /** S3 bucket name */
    bucket: z.string(),
    /** Object key */
    key: z.string(),
    /** Upload ID to abort */
    uploadId: z.string(),
});
//# sourceMappingURL=types.js.map