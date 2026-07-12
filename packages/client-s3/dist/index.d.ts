/**
 * client-s3 - AWS S3 procedures for the client ecosystem
 *
 * Provides upload, download, list, delete, and multipart upload operations.
 * Credentials are loaded from environment variables (all optional — when the
 * static keys are absent the AWS SDK default credential provider chain is used):
 * - AWS_ACCESS_KEY_ID (optional; pair with AWS_SECRET_ACCESS_KEY)
 * - AWS_SECRET_ACCESS_KEY (optional)
 * - AWS_SESSION_TOKEN (optional, for STS/SSO temporary credentials)
 * - AWS_REGION (optional, defaults to us-east-1)
 * - S3_ENDPOINT (optional, for MinIO/LocalStack)
 */
export type { S3Config, S3UploadInput, S3UploadOutput, S3DownloadInput, S3DownloadOutput, S3ListInput, S3ListOutput, S3ListObject, S3ListAllInput, S3ListAllOutput, S3DeleteInput, S3DeleteOutput, S3MultipartInitInput, S3MultipartInitOutput, S3MultipartUploadInput, S3MultipartUploadOutput, S3MultipartCompleteInput, S3MultipartCompleteOutput, S3MultipartAbortInput, S3MultipartAbortOutput, } from "./types.js";
export { S3UploadInputSchema, S3DownloadInputSchema, S3ListInputSchema, S3ListAllInputSchema, S3DeleteInputSchema, S3MultipartInitInputSchema, S3MultipartUploadInputSchema, S3MultipartCompleteInputSchema, S3MultipartAbortInputSchema, } from "./types.js";
export { getS3Config, createS3Client, getS3Client, resetS3Client, } from "./s3-client.js";
export { s3Upload, s3Download, s3List, s3ListAll, s3Delete, s3MultipartInit, s3MultipartUpload, s3MultipartComplete, s3MultipartAbort, } from "./procedures/s3/index.js";
//# sourceMappingURL=index.d.ts.map