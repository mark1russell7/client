/**
 * snapshot.create procedure
 *
 * Create an environment snapshot and upload to S3.
 */

import { existsSync, mkdtempSync, rmSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { open } from "node:fs/promises";
import { join, basename, dirname, resolve } from "node:path";
import { tmpdir, hostname } from "node:os";
import { randomUUID } from "node:crypto";
import { execSync } from "node:child_process";
import * as tar from "tar";
import type { ProcedureContext } from "@mark1russell7/client";
import { assertSnapshotName, isExcluded } from "./names.js";
import { readPart, sha256File } from "./archive-io.js";
import type {
  SnapshotCreateInput,
  SnapshotCreateOutput,
  SnapshotMetadata,
  RepositoryInfo,
  SnapshotPreset,
} from "../../types.js";

/** The size of each part of a multipart upload (the S3 minimum) */
const PART_SIZE = 5 * 1024 * 1024;

/**
 * Create a snapshot of the environment
 */
export async function snapshotCreate(
  input: SnapshotCreateInput,
  ctx: ProcedureContext
): Promise<SnapshotCreateOutput> {
  // A plain name: it goes into S3 keys and the snapshot id (a "/" made ids that restore,
  // diff and delete never found: deep dive DATA-1, DATA-16)
  assertSnapshotName("name", input.name);
  const id = `${input.name}-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const workDir = mkdtempSync(join(tmpdir(), "snapshot-"));

  try {

    // Get repository paths to snapshot
    const repoPaths = input.paths || (await getEcosystemPaths(ctx));

    // Gather repository info
    const repositories = await Promise.all(
      repoPaths.map((path) => getRepositoryInfo(path, ctx))
    );

    // Get environment info
    const environment = await getEnvironmentInfo();

    // Create metadata
    const metadata: SnapshotMetadata = {
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
    writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

    // Create archive based on preset
    const archivePath = join(workDir, `${id}.tar.gz`);
    await createArchive(archivePath, repoPaths, input.preset, workDir);

    // Calculate checksum (a stream: the archive is never in memory as a whole)
    const checksum = await sha256File(archivePath);
    const archiveSize = statSync(archivePath).size;

    // Update metadata with checksum
    metadata.checksum = checksum;
    metadata.archiveSize = archiveSize;
    writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

    // Upload to S3
    const uploadStart = Date.now();
    const s3Key = `snapshots/${input.name}/${id}.tar.gz`;

    // Use multipart upload for large files (> 5MB). The parts are read from the file, one at a
    // time (deep dive DATA-19).
    if (archiveSize > PART_SIZE) {
      await multipartUpload(ctx, input.bucket, s3Key, archivePath, archiveSize);
    } else {
      await ctx.client.call(["s3", "upload"], {
        bucket: input.bucket,
        key: s3Key,
        body: readFileSync(archivePath).toString("base64"),
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
  } finally {
    // Cleanup work directory
    if (existsSync(workDir)) {
      rmSync(workDir, { recursive: true, force: true });
    }
  }
}

/**
 * Get ecosystem repository paths from manifest
 */
async function getEcosystemPaths(_ctx: ProcedureContext): Promise<string[]> {
  // TODO: Read from ecosystem manifest
  // For now, return current working directory
  return [process.cwd()];
}

/**
 * Get repository info for a path
 */
async function getRepositoryInfo(
  repoPath: string,
  ctx: ProcedureContext
): Promise<RepositoryInfo> {
  try {
    const result = await ctx.client.call<
      { cwd?: string },
      { branch: string; ahead: number; behind: number; files: unknown[]; clean: boolean }
    >(["git", "status"], { cwd: repoPath });

    // Get commit hash
    const commit = execSync("git rev-parse HEAD", {
      cwd: repoPath,
      encoding: "utf8",
    }).trim();

    // Get remote URL
    let remoteUrl: string | undefined;
    try {
      remoteUrl = execSync("git remote get-url origin", {
        cwd: repoPath,
        encoding: "utf8",
      }).trim();
    } catch {
      // No remote
    }

    // Get stash count
    let stashCount = 0;
    try {
      const stashList = await ctx.client.call<
        { cwd?: string },
        { stashes: unknown[]; count: number }
      >(["git", "stash", "list"], { cwd: repoPath });
      stashCount = stashList.count;
    } catch {
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
    } catch {
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
  } catch (error) {
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
async function getEnvironmentInfo(): Promise<SnapshotMetadata["environment"]> {
  let pnpmVersion = "unknown";
  try {
    pnpmVersion = execSync("pnpm --version", { encoding: "utf8" }).trim();
  } catch {
    // pnpm not installed
  }

  return {
    os: process.platform,
    nodeVersion: process.version,
    pnpmVersion,
    username: process.env["USER"] || process.env["USERNAME"] || "unknown",
    hostname: hostname(),
  };
}

/**
 * Create tar archive based on preset
 */
async function createArchive(
  archivePath: string,
  repoPaths: string[],
  preset: SnapshotPreset,
  workDir: string
): Promise<void> {
  // Only archive repositories that actually exist on disk.
  const existingRepos = repoPaths.filter((p) => existsSync(p));

  // tar.create accepts a single `cwd`, and each entry is stored relative to it.
  // To store each repository as a top-level `<basename>/...` entry we must run
  // with `cwd` set to the directory that contains the repositories (the
  // ecosystem root), not the fresh temp `workDir` the repos are not inside.
  const parents = new Set(existingRepos.map((p) => resolve(dirname(p))));
  if (parents.size > 1) {
    throw new Error(
      `snapshot.create requires all repositories to share a parent directory; got multiple roots: ${[
        ...parents,
      ].join(", ")}`
    );
  }
  const cwd = existingRepos.length > 0 ? resolve(dirname(existingRepos[0]!)) : workDir;

  // Create gzip options based on preset
  const gzipOpts = { level: preset === "heavy" ? 6 : 9 };

  // Build exclude patterns based on preset
  const excludePatterns: string[] = [];

  if (preset === "light") {
    // Exclude node_modules and pnpm store
    excludePatterns.push("node_modules", ".pnpm-store", "dist", "*.log");
  } else if (preset === "medium") {
    // Include node_modules but exclude pnpm store
    excludePatterns.push(".pnpm-store", "*.log");
  }
  // heavy preset includes everything

  await tar.create(
    {
      gzip: gzipOpts,
      file: archivePath,
      cwd,
      // Whole path segments, and "*.ext" for file endings. (Before, `path.includes("dist")`
      // left out src/distance.ts, and "*.log" matched nothing: deep dive DATA-3.)
      filter: (path) => !isExcluded(path, excludePatterns),
    },
    existingRepos.map((p) => basename(p))
  );
}

/**
 * Multipart upload for large files. Each part is read from the file when it goes up.
 */
async function multipartUpload(
  ctx: ProcedureContext,
  bucket: string,
  key: string,
  archivePath: string,
  archiveSize: number
): Promise<void> {
  // Initialize multipart upload
  const initResult = await ctx.client.call<
    { bucket: string; key: string; contentType?: string },
    { uploadId: string }
  >(["s3", "multipart", "init"], {
    bucket,
    key,
    contentType: "application/gzip",
  });

  const uploadId = initResult.uploadId;
  const parts: Array<{ etag: string; partNumber: number }> = [];
  const file = await open(archivePath, "r");

  try {
    // Upload parts
    let partNumber = 1;
    for (let offset = 0; offset < archiveSize; offset += PART_SIZE) {
      const chunk = await readPart(file, offset, PART_SIZE);

      const partResult = await ctx.client.call<
        { bucket: string; key: string; uploadId: string; partNumber: number; body: string },
        { etag: string; partNumber: number }
      >(["s3", "multipart", "upload"], {
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
  } catch (error) {
    // Abort on failure. The error of the upload stays the error: before, a failed abort
    // replaced it.
    try {
      await ctx.client.call(["s3", "multipart", "abort"], {
        bucket,
        key,
        uploadId,
      });
    } catch (abortError) {
      throw new Error(
        `${messageOf(error)} (the abort of upload ${uploadId} also failed: ${messageOf(abortError)})`,
        { cause: error }
      );
    }
    throw error;
  } finally {
    await file.close();
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
