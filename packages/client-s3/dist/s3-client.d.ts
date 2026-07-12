/**
 * S3 Client Factory
 *
 * Creates an S3 client. Static credentials are read from environment variables
 * when present; otherwise the AWS SDK's default credential provider chain
 * (SSO, IAM roles/IMDS, shared config profiles, env, etc.) resolves them.
 * NEVER hardcode credentials - always use environment variables or an IAM role.
 */
import { S3Client } from "@aws-sdk/client-s3";
import type { S3Config } from "./types.js";
/**
 * Get S3 configuration from environment variables.
 *
 * Static credentials are optional: when `AWS_ACCESS_KEY_ID` /
 * `AWS_SECRET_ACCESS_KEY` are absent, the returned config carries no
 * credentials and the AWS SDK default provider chain is used instead.
 * `AWS_SESSION_TOKEN` is included when present (STS/SSO temporary creds).
 */
export declare function getS3Config(): S3Config;
/**
 * Create an S3 client.
 *
 * Explicit credentials are passed ONLY when both `AWS_ACCESS_KEY_ID` and
 * `AWS_SECRET_ACCESS_KEY` are set (including `AWS_SESSION_TOKEN` when present).
 * Otherwise `credentials` is omitted so the AWS SDK default credential
 * provider chain resolves SSO / IAM-role / profile credentials.
 */
export declare function createS3Client(): S3Client;
/**
 * Get singleton S3 client instance
 * Creates client on first call, reuses on subsequent calls
 */
export declare function getS3Client(): S3Client;
/**
 * Reset the singleton client (useful for testing or credential refresh)
 */
export declare function resetS3Client(): void;
//# sourceMappingURL=s3-client.d.ts.map