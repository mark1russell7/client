/**
 * snapshot.create procedure
 *
 * Create an environment snapshot and upload to S3.
 */
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join, basename } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import * as tar from "tar";
/**
 * Create a snapshot of the environment
 */
export async function snapshotCreate(input, ctx) {
    const id = `${input.name}-${Date.now()}-${randomUUID().slice(0, 8)}`;
    const workDir = join(tmpdir(), `snapshot-${id}`);
    try {
        mkdirSync(workDir, { recursive: true });
        // Get repository paths to snapshot
        const repoPaths = input.paths || (await getEcosystemPaths(ctx));
        // Gather repository info
        const repositories = await Promise.all(repoPaths.map((path) => getRepositoryInfo(path, ctx)));
        // Get environment info
        const environment = await getEnvironmentInfo();
        // Create metadata
        const metadata = {
            id,
            name: input.name,
            preset: input.preset,
            createdAt: new Date().toISOString(),
            environment,
            repositories,
            checksum: "", // Will be calculated after archive creation
            archiveSize: 0,
            description: input.description,
        };
        // Write metadata to work directory
        const metadataPath = join(workDir, "metadata.json");
        require("fs").writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
        // Create archive based on preset
        const archivePath = join(workDir, `${id}.tar.gz`);
        await createArchive(archivePath, repoPaths, input.preset, workDir);
        // Calculate checksum
        const checksum = calculateChecksum(archivePath);
        const archiveSize = require("fs").statSync(archivePath).size;
        // Update metadata with checksum
        metadata.checksum = checksum;
        metadata.archiveSize = archiveSize;
        require("fs").writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
        // Upload to S3
        const uploadStart = Date.now();
        const s3Key = `snapshots/${input.name}/${id}.tar.gz`;
        // Read archive as base64 for upload
        const archiveContent = readFileSync(archivePath);
        // Use multipart upload for large files (> 5MB)
        if (archiveSize > 5 * 1024 * 1024) {
            await multipartUpload(ctx, input.bucket, s3Key, archiveContent);
        }
        else {
            await ctx.client.call(["s3", "upload"], {
                bucket: input.bucket,
                key: s3Key,
                body: archiveContent.toString("base64"),
                base64: true,
                contentType: "application/gzip",
                metadata: {
                    snapshotId: id,
                    snapshotName: input.name,
                    preset: input.preset,
                    checksum,
                },
            });
        }
        // Also upload metadata separately for quick listing
        await ctx.client.call(["s3", "upload"], {
            bucket: input.bucket,
            key: `snapshots/${input.name}/${id}.metadata.json`,
            body: JSON.stringify(metadata, null, 2),
            contentType: "application/json",
        });
        const uploadDuration = Date.now() - uploadStart;
        return {
            id,
            location: `s3://${input.bucket}/${s3Key}`,
            metadata,
            uploadDuration,
        };
    }
    finally {
        // Cleanup work directory
        if (existsSync(workDir)) {
            rmSync(workDir, { recursive: true, force: true });
        }
    }
}
/**
 * Get ecosystem repository paths from manifest
 */
async function getEcosystemPaths(_ctx) {
    // TODO: Read from ecosystem manifest
    // For now, return current working directory
    return [process.cwd()];
}
/**
 * Get repository info for a path
 */
async function getRepositoryInfo(repoPath, ctx) {
    try {
        const result = await ctx.client.call(["git", "status"], { cwd: repoPath });
        // Get commit hash
        const commit = execSync("git rev-parse HEAD", {
            cwd: repoPath,
            encoding: "utf8",
        }).trim();
        // Get remote URL
        let remoteUrl;
        try {
            remoteUrl = execSync("git remote get-url origin", {
                cwd: repoPath,
                encoding: "utf8",
            }).trim();
        }
        catch {
            // No remote
        }
        // Get stash count
        let stashCount = 0;
        try {
            const stashList = await ctx.client.call(["git", "stash", "list"], { cwd: repoPath });
            stashCount = stashList.count;
        }
        catch {
            // No stashes
        }
        // Get package name from package.json
        let name = basename(repoPath);
        try {
            const pkgPath = join(repoPath, "package.json");
            if (existsSync(pkgPath)) {
                const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
                name = pkg.name || name;
            }
        }
        catch {
            // Use directory name
        }
        return {
            path: repoPath,
            name,
            branch: result.branch,
            commit,
            dirty: !result.clean,
            stashCount,
            remoteUrl,
            ahead: result.ahead,
            behind: result.behind,
        };
    }
    catch (error) {
        // Not a git repo or error
        return {
            path: repoPath,
            name: basename(repoPath),
            branch: "",
            commit: "",
            dirty: false,
            stashCount: 0,
            ahead: 0,
            behind: 0,
        };
    }
}
/**
 * Get environment info
 */
async function getEnvironmentInfo() {
    let pnpmVersion = "unknown";
    try {
        pnpmVersion = execSync("pnpm --version", { encoding: "utf8" }).trim();
    }
    catch {
        // pnpm not installed
    }
    return {
        os: process.platform,
        nodeVersion: process.version,
        pnpmVersion,
        username: process.env["USER"] || process.env["USERNAME"] || "unknown",
        hostname: require("os").hostname(),
    };
}
/**
 * Create tar archive based on preset
 */
async function createArchive(archivePath, repoPaths, preset, workDir) {
    const files = [];
    for (const repoPath of repoPaths) {
        if (!existsSync(repoPath))
            continue;
        // Always include .git directory
        const gitDir = join(repoPath, ".git");
        if (existsSync(gitDir)) {
            files.push(repoPath);
        }
    }
    // Create gzip options based on preset
    const gzipOpts = { level: preset === "heavy" ? 6 : 9 };
    // Build exclude patterns based on preset
    const excludePatterns = [];
    if (preset === "light") {
        // Exclude node_modules and pnpm store
        excludePatterns.push("node_modules", ".pnpm-store", "dist", "*.log");
    }
    else if (preset === "medium") {
        // Include node_modules but exclude pnpm store
        excludePatterns.push(".pnpm-store", "*.log");
    }
    // heavy preset includes everything
    await tar.create({
        gzip: gzipOpts,
        file: archivePath,
        cwd: workDir,
        filter: (path) => {
            for (const pattern of excludePatterns) {
                if (path.includes(pattern))
                    return false;
            }
            return true;
        },
    }, repoPaths.map((p) => basename(p)));
}
/**
 * Calculate SHA-256 checksum
 */
function calculateChecksum(filePath) {
    const content = readFileSync(filePath);
    return createHash("sha256").update(content).digest("hex");
}
/**
 * Multipart upload for large files
 */
async function multipartUpload(ctx, bucket, key, content) {
    const PART_SIZE = 5 * 1024 * 1024; // 5MB minimum part size
    // Initialize multipart upload
    const initResult = await ctx.client.call(["s3", "multipart", "init"], {
        bucket,
        key,
        contentType: "application/gzip",
    });
    const uploadId = initResult.uploadId;
    const parts = [];
    try {
        // Upload parts
        let partNumber = 1;
        for (let offset = 0; offset < content.length; offset += PART_SIZE) {
            const chunk = content.subarray(offset, offset + PART_SIZE);
            const partResult = await ctx.client.call(["s3", "multipart", "upload"], {
                bucket,
                key,
                uploadId,
                partNumber,
                body: chunk.toString("base64"),
            });
            parts.push({
                etag: partResult.etag,
                partNumber: partResult.partNumber,
            });
            partNumber++;
        }
        // Complete multipart upload
        await ctx.client.call(["s3", "multipart", "complete"], {
            bucket,
            key,
            uploadId,
            parts,
        });
    }
    catch (error) {
        // Abort on failure
        await ctx.client.call(["s3", "multipart", "abort"], {
            bucket,
            key,
            uploadId,
        });
        throw error;
    }
}
//# sourceMappingURL=create.js.map