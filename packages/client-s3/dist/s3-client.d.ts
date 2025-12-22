/**
 * S3 Client Factory
 *
 * Creates S3 client with credentials from environment variables.
 * NEVER hardcode credentials - always use environment variables.
 */
import { S3Client } from "@aws-sdk/client-s3";
import type { S3Config } from "./types.js";
/**
 * Get S3 configuration from environment variables
 * @throws Error if required credentials are missing
 */
export declare function getS3Config(): S3Config;
/**
 * Create an S3 client with credentials from environment
 * @throws Error if credentials are not configured
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