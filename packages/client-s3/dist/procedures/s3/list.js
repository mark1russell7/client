/**
 * s3.list procedure
 *
 * List objects in S3 bucket.
 */
import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import { getS3Client } from "../../s3-client.js";
/**
 * List objects in S3 bucket
 *
 * @example
 * // List all objects with prefix
 * const result = await client.call(["s3", "list"], {
 *   bucket: "my-bucket",
 *   prefix: "snapshots/",
 *   maxKeys: 100,
 * });
 *
 * @example
 * // Hierarchical listing with delimiter
 * const result = await client.call(["s3", "list"], {
 *   bucket: "my-bucket",
 *   prefix: "data/",
 *   delimiter: "/",
 * });
 * console.log(result.commonPrefixes); // ["data/2024/", "data/2025/"]
 */
export async function s3List(input) {
    const client = getS3Client();
    const command = new ListObjectsV2Command({
        Bucket: input.bucket,
        Prefix: input.prefix,
        MaxKeys: input.maxKeys || 1000,
        ContinuationToken: input.continuationToken,
        Delimiter: input.delimiter,
    });
    const response = await client.send(command);
    const contents = (response.Contents || []).map((obj) => ({
        key: obj.Key || "",
        size: obj.Size || 0,
        lastModified: obj.LastModified?.toISOString() || "",
        etag: obj.ETag?.replace(/"/g, "") || "",
        storageClass: obj.StorageClass,
    }));
    const commonPrefixes = (response.CommonPrefixes || [])
        .map((cp) => cp.Prefix || "")
        .filter(Boolean);
    return {
        contents,
        commonPrefixes,
        isTruncated: response.IsTruncated || false,
        nextContinuationToken: response.NextContinuationToken,
        keyCount: response.KeyCount || contents.length,
    };
}
//# sourceMappingURL=list.js.map