/**
 * snapshot.delete procedure
 *
 * Delete a snapshot from S3.
 */
/**
 * Delete a snapshot from S3
 */
export async function snapshotDelete(input, ctx) {
    // Find snapshot files
    const listResult = await ctx.client.call(["s3", "list"], {
        bucket: input.bucket,
        prefix: `snapshots/`,
    });
    // Find all files for this snapshot ID
    const snapshotFiles = listResult.contents.filter((obj) => obj.key.includes(input.id));
    if (snapshotFiles.length === 0) {
        throw new Error(`Snapshot not found: ${input.id}`);
    }
    // Delete each file
    for (const file of snapshotFiles) {
        await ctx.client.call(["s3", "delete"], {
            bucket: input.bucket,
            key: file.key,
        });
    }
    return {
        deleted: true,
        id: input.id,
    };
}
//# sourceMappingURL=delete.js.map