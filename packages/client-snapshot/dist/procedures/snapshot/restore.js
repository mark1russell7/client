/**
 * snapshot.restore procedure
 *
 * Restore an environment snapshot from S3.
 */
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import * as tar from "tar";
/**
 * Restore a snapshot from S3
 */
export async function snapshotRestore(input, ctx) {
    const workDir = join(tmpdir(), `restore-${input.id}`);
    try {
        mkdirSync(workDir, { recursive: true });
        // First, download metadata to get archive location
        const downloadStart = Date.now();
        // Find the snapshot by ID
        const listResult = await ctx.client.call(["s3", "list"], {
            bucket: input.bucket,
            prefix: `snapshots/`,
        });
        // Find metadata file for this ID
        const metadataKey = listResult.contents.find((obj) => obj.key.includes(input.id) && obj.key.endsWith(".metadata.json"))?.key;
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
        const downloadDuration = Date.now() - downloadStart;
        // Extract archive
        const extractStart = Date.now();
        const targetPath = input.targetPath || workDir;
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
        // Cleanup work directory (but not target path)
        if (existsSync(workDir) && workDir !== input.targetPath) {
            rmSync(workDir, { recursive: true, force: true });
        }
    }
}
//# sourceMappingURL=restore.js.map