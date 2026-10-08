/**
 * S3 Client Factory
 *
 * Creates an S3 client. Static credentials are read from environment variables
 * when present; otherwise the AWS SDK's default credential provider chain
 * (SSO, IAM roles/IMDS, shared config profiles, env, etc.) resolves them.
 * NEVER hardcode credentials - always use environment variables or an IAM role.
 */
import { S3Client } from "@aws-sdk/client-s3";
/**
 * Get S3 configuration from environment variables.
 *
 * Static credentials are optional: when `AWS_ACCESS_KEY_ID` /
 * `AWS_SECRET_ACCESS_KEY` are absent, the returned config carries no
 * credentials and the AWS SDK default provider chain is used instead.
 * `AWS_SESSION_TOKEN` is included when present (STS/SSO temporary creds).
 */
export function getS3Config() {
    const accessKeyId = process.env["AWS_ACCESS_KEY_ID"];
    const secretAccessKey = process.env["AWS_SECRET_ACCESS_KEY"];
    const sessionToken = process.env["AWS_SESSION_TOKEN"];
    const region = process.env["AWS_REGION"] || "us-east-1";
    const endpoint = process.env["S3_ENDPOINT"];
    return {
        region,
        endpoint,
        accessKeyId,
        secretAccessKey,
        sessionToken,
    };
}
/**
 * Create an S3 client.
 *
 * Explicit credentials are passed ONLY when both `AWS_ACCESS_KEY_ID` and
 * `AWS_SECRET_ACCESS_KEY` are set (including `AWS_SESSION_TOKEN` when present).
 * Otherwise `credentials` is omitted so the AWS SDK default credential
 * provider chain resolves SSO / IAM-role / profile credentials.
 */
export function createS3Client() {
    const config = getS3Config();
    const clientConfig = {
        region: config.region,
    };
    // Only supply static credentials when the env keys actually exist; otherwise
    // let the SDK resolve credentials from its default chain (SSO/IMDS/profile).
    if (config.accessKeyId && config.secretAccessKey) {
        clientConfig.credentials = {
            accessKeyId: config.accessKeyId,
            secretAccessKey: config.secretAccessKey,
            // Session token is required for STS/SSO temporary credentials.
            ...(config.sessionToken ? { sessionToken: config.sessionToken } : {}),
        };
    }
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