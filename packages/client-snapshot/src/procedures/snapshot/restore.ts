/**
 * snapshot.restore procedure
 *
 * Restore an environment snapshot from S3.
 */

import { existsSync, mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync } from "node:fs";
import { basename, join } from "node:path";
import { tmpdir } from "node:os";
import * as tar from "tar";
import type { ProcedureContext } from "@mark1russell7/client";
import type {
  SnapshotRestoreInput,
  SnapshotRestoreOutput,
  SnapshotMetadata,
} from "../../types.js";
import { listAllObjects, findSnapshotKey } from "./s3-lookup.js";
import { assertSnapshotName } from "./names.js";
import { sha256File } from "./archive-io.js";

/**
 * Restore a snapshot from S3
 */
export async function snapshotRestore(
  input: SnapshotRestoreInput,
  ctx: ProcedureContext
): Promise<SnapshotRestoreOutput> {
  // Scratch directory used solely to hold the downloaded archive; it is always
  // safe to delete. The extraction target is `input.targetPath` (required) and
  // is never removed — that is the fix for the self-deleting-restore bug where
  // targetPath defaulted to workDir and the `finally` then wiped it.
  //
  // The id must be a plain name, and the scratch folder is a new unique folder: before, the id
  // went into the path, so `x/../../<dir>` made the `finally` delete <dir>, even when the S3
  // lookup failed (deep dive DATA-1).
  assertSnapshotName("id", input.id);
  const workDir = mkdtempSync(join(tmpdir(), "restore-"));

  try {

    // First, download metadata to get archive location
    const downloadStart = Date.now();

    // Find the snapshot by ID (paginated listing, exact basename match).
    const objects = await listAllObjects(ctx, input.bucket, "snapshots/");
    const metadataKey = findSnapshotKey(objects, input.id, ".metadata.json");

    if (!metadataKey) {
      throw new Error(`Snapshot not found: ${input.id}`);
    }

    // Download metadata
    const metadataResult = await ctx.client.call<
      { bucket: string; key: string; encoding?: string },
      { body: string }
    >(["s3", "download"], {
      bucket: input.bucket,
      key: metadataKey,
      encoding: "utf8",
    });

    const metadata: SnapshotMetadata = JSON.parse(metadataResult.body);

    // Download archive
    const archiveKey = metadataKey.replace(".metadata.json", ".tar.gz");
    const archivePath = join(workDir, `${input.id}.tar.gz`);

    // Stream the archive to disk: an archive can be large, and loading it into memory as
    // base64 was a third larger again (BUGS-2026-07 M22)
    await ctx.client.call<
      { bucket: string; key: string; destPath: string },
      { path?: string }
    >(["s3", "download"], {
      bucket: input.bucket,
      key: archiveKey,
      destPath: archivePath,
    });

    // Verify the downloaded archive against the checksum recorded at snapshot
    // creation time. Do this before extracting so a corrupted or tampered
    // archive never reaches the target directory.
    if (metadata.checksum) {
      const actualChecksum = await sha256File(archivePath);
      if (actualChecksum !== metadata.checksum) {
        throw new Error(
          `Checksum mismatch for snapshot ${input.id}: expected ${metadata.checksum}, got ${actualChecksum}`
        );
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
      // The archive stores each repository under the base name of its path (createArchive), not
      // under its package name: before, the guard checked the package name, so an existing working
      // copy was overwritten with overwrite: false (deep dive DATA-2)
      for (const repo of metadata.repositories) {
        const repoPath = join(targetPath, basename(repo.path));
        if (existsSync(repoPath)) {
          throw new Error(
            `Target path already exists: ${repoPath}. Use overwrite: true to replace.`
          );
        }
      }
    }

    // Extract into a staging folder in the target, then move each top-level folder into place.
    // With overwrite: true, a restored folder replaces the existing one: before, the archive
    // was extracted over it, and files that the snapshot does not hold stayed. A failed
    // extraction leaves the target as it was.
    const staging = mkdtempSync(join(targetPath, ".snapshot-restore-"));
    try {
      await tar.extract({
        file: archivePath,
        cwd: staging,
      });
      for (const entry of readdirSync(staging)) {
        const destination = join(targetPath, entry);
        if (existsSync(destination)) {
          if (!input.overwrite) {
            throw new Error(`Target path already exists: ${destination}. Use overwrite: true to replace.`);
          }
          rmSync(destination, { recursive: true, force: true });
        }
        renameSync(join(staging, entry), destination);
      }
    } finally {
      rmSync(staging, { recursive: true, force: true });
    }

    const extractDuration = Date.now() - extractStart;

    // Restore stashes if available
    const restoredPaths: string[] = [];
    for (const repo of metadata.repositories) {
      const repoPath = join(targetPath, basename(repo.path));
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
  } finally {
    // Only ever remove the scratch download directory — never the extraction
    // target. The `workDir !== input.targetPath` guard is belt-and-suspenders:
    // targetPath is required and distinct from the temp scratch dir.
    if (existsSync(workDir) && workDir !== input.targetPath) {
      rmSync(workDir, { recursive: true, force: true });
    }
  }
}
