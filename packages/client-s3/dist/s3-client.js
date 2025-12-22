/**
 * S3 Client Factory
 *
 * Creates S3 client with credentials from environment variables.
 * NEVER hardcode credentials - always use environment variables.
 */
import { S3Client } from "@aws-sdk/client-s3";
/**
 * Get S3 configuration from environment variables
 * @throws Error if required credentials are missing
 */
export function getS3Config() {
    const accessKeyId = process.env["AWS_ACCESS_KEY_ID"];
    const secretAccessKey = process.env["AWS_SECRET_ACCESS_KEY"];
    const region = process.env["AWS_REGION"] || "us-east-1";
    const endpoint = process.env["S3_ENDPOINT"];
    if (!accessKeyId) {
        throw new Error("AWS_ACCESS_KEY_ID environment variable is required. " +
            "See .env.example for configuration.");
    }
    if (!secretAccessKey) {
        throw new Error("AWS_SECRET_ACCESS_KEY environment variable is required. " +
            "See .env.example for configuration.");
    }
    return {
        region,
        endpoint,
        accessKeyId,
        secretAccessKey,
    };
}
/**
 * Create an S3 client with credentials from environment
 * @throws Error if credentials are not configured
 */
export function createS3Client() {
    const config = getS3Config();
    const clientConfig = {
        region: config.region,
        credentials: {
            accessKeyId: config.accessKeyId,
            secretAccessKey: config.secretAccessKey,
        },
    };
    // Custom endpoint for MinIO, LocalStack, etc.
    if (config.endpoint) {
        clientConfig.endpoint = config.endpoint;
        clientConfig.forcePathStyle = true; // Required for non-AWS S3
    }
    return new S3Client(clientConfig);
}
// Singleton client instance (lazy initialized)
let s3ClientInstance = null;
/**
 * Get singleton S3 client instance
 * Creates client on first call, reuses on subsequent calls
 */
export function getS3Client() {
    if (!s3ClientInstance) {
        s3ClientInstance = createS3Client();
    }
    return s3ClientInstance;
}
/**
 * Reset the singleton client (useful for testing or credential refresh)
 */
export function resetS3Client() {
    if (s3ClientInstance) {
        s3ClientInstance.destroy();
        s3ClientInstance = null;
    }
}
//# sourceMappingURL=s3-client.js.map