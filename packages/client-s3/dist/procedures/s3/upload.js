/**
 * s3.upload procedure
 *
 * Upload content to S3 bucket.
 */
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getS3Client } from "../../s3-client.js";
/**
 * Upload content to S3
 *
 * @example
 * // Upload text content
 * await client.call(["s3", "upload"], {
 *   bucket: "my-bucket",
 *   key: "path/to/file.json",
 *   body: JSON.stringify({ data: "value" }),
 *   contentType: "application/json",
 * });
 *
 * @example
 * // Upload base64 binary
 * await client.call(["s3", "upload"], {
 *   bucket: "my-bucket",
 *   key: "path/to/image.png",
 *   body: base64EncodedData,
 *   base64: true,
 *   contentType: "image/png",
 * });
 */
export async function s3Upload(input) {
    const client = getS3Client();
    // Convert body to Buffer if base64
    const body = input.base64
        ? Buffer.from(input.body, "base64")
        : input.body;
    const command = new PutObjectCommand({
        Bucket: input.bucket,
        Key: input.key,
        Body: body,
        ContentType: input.contentType,
        Metadata: input.metadata,
    });
    const response = await client.send(command);
    return {
        etag: response.ETag?.replace(/"/g, "") || "",
        versionId: response.VersionId,
        location: `s3://${input.bucket}/${input.key}`,
    };
}
//# sourceMappingURL=upload.js.map