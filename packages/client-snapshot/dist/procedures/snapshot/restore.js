/**
 * snapshot.restore procedure
 *
 * Restore an environment snapshot from S3.
 */
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import * as tar from "tar";
import { listAllObjects, findSnapshotKey } from "./s3-lookup.js";
/**
 * Restore a snapshot from S3
 */
export async function snapshotRestore(input, ctx) {
    // Scratch directory used solely to hold the downloaded archive; it is always
    // safe to delete. The extraction target is `input.targetPath` (required) and
    // is never removed — that is the fix for the self-deleting-restore bug where
    // targetPath defaulted to workDir and the `finally` then wiped it.
    const workDir = join(tmpdir(), `restore-${input.id}`);
    try {
        mkdirSync(workDir, { recursive: true });
        // First, download metadata to get archive location
        const downloadStart = Date.now();
        // Find the snapshot by ID (paginated listing, exact basename match).
        const objects = await listAllObjects(ctx, input.bucket, "snapshots/");
        const metadataKey = findSnapshotKey(objects, input.id, ".metadata.json");
        if (!metadataKey) {
            throw new Error(`Snapshot not found: ${input.id}`);
        }
        // Download metadata
        const metadataResult = await ctx.client.call(["s3", "download"], {
            bucket: input.bucket,
            key: metadataKey,
            encoding: "utf8",
        });
        const metadata = JSON.parse(metadataResult.body);
        // Download archive
        const archiveKey = metadataKey.replace(".metadata.json", ".tar.gz");
        const archivePath = join(workDir, `${input.id}.tar.gz`);
        const archiveResult = await ctx.client.call(["s3", "download"], {
            bucket: input.bucket,
            key: archiveKey,
        });
        // Write archive (base64 decoded)
        writeFileSync(archivePath, Buffer.from(archiveResult.body, "base64"));
        // Verify the downloaded archive against the checksum recorded at snapshot
        // creation time. Do this before extracting so a corrupted or tampered
        // archive never reaches the target directory.
        if (metadata.checksum) {
            const actualChecksum = createHash("sha256")
                .update(readFileSync(archivePath))
                .digest("hex");
            if (actualChecksum !== metadata.checksum) {
                throw new Error(`Checksum mismatch for snapshot ${input.id}: expected ${metadata.checksum}, got ${actualChecksum}`);
            }
        }
        const downloadDuration = Date.now() - downloadStart;
        // Extract archive into the caller-provided target directory.
        const extractStart = Date.now();
        const targetPath = input.targetPath;
        if (!existsSync(targetPath)) {
            mkdirSync(targetPath, { recursive: true });
        }
        // Check for existing files if not overwriting
        if (!input.overwrite) {
            for (const repo of metadata.repositories) {
                const repoPath = join(targetPath, repo.name);
                if (existsSync(repoPath)) {
                    throw new Error(`Target path already exists: ${repoPath}. Use overwrite: true to replace.`);
                }
            }
        }
        // Extract archive
        await tar.extract({
            file: archivePath,
            cwd: targetPath,
        });
        const extractDuration = Date.now() - extractStart;
        // Restore stashes if available
        const restoredPaths = [];
        for (const repo of metadata.repositories) {
            const repoPath = join(targetPath, repo.name);
            if (existsSync(repoPath)) {
                restoredPaths.push(repoPath);
            }
        }
        return {
            success: true,
            metadata,
            restoredPaths,
            downloadDuration,
            extractDuration,
        };
    }
    finally {
        // Only ever remove the scratch download directory — never the extraction
        // target. The `workDir !== input.targetPath` guard is belt-and-suspenders:
        // targetPath is required and distinct from the temp scratch dir.
        if (existsSync(workDir) && workDir !== input.targetPath) {
            rmSync(workDir, { recursive: true, force: true });
        }
    }
}
//# sourceMappingURL=restore.js.map