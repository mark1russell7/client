/**
 * Type definitions for client-snapshot procedures
 *
 * Environment snapshot/restore for testing and recovery.
 * Supports light/medium/heavy presets for different capture levels.
 */

import { z } from "zod";

// =============================================================================
// Snapshot Presets
// =============================================================================

export type SnapshotPreset = "light" | "medium" | "heavy";

export const SnapshotPresetSchema: z.ZodEnum<{ light: "light"; medium: "medium"; heavy: "heavy" }> = z.enum(["light", "medium", "heavy"]);

/**
 * Preset descriptions:
 * - light: Git repos only (.git, working tree, branches, stashes) ~500MB
 * - medium: + node_modules + pnpm lockfiles ~2GB
 * - heavy: + pnpm store + global installs + configs ~10GB+
 */

// =============================================================================
// Repository Info
// =============================================================================

export interface RepositoryInfo {
  /** Repository path relative to snapshot root */
  path: string;
  /** Package name from package.json */
  name: string;
  /** Current branch */
  branch: string;
  /** HEAD commit hash */
  commit: string;
  /** Whether working tree is dirty */
  dirty: boolean;
  /** Number of stashes */
  stashCount: number;
  /** Remote URL */
  remoteUrl?: string | undefined;
  /** Commits ahead of remote */
  ahead: number;
  /** Commits behind remote */
  behind: number;
}

// =============================================================================
// Snapshot Metadata
// =============================================================================

export interface SnapshotMetadata {
  /** Unique snapshot ID */
  id: string;
  /** Human-readable name */
  name: string;
  /** Snapshot preset used */
  preset: SnapshotPreset;
  /** Creation timestamp (ISO string) */
  createdAt: string;
  /** Environment info */
  environment: {
    /** Operating system (win32, darwin, linux) */
    os: string;
    /** Node.js version */
    nodeVersion: string;
    /** pnpm version */
    pnpmVersion: string;
    /** Username who created snapshot */
    username: string;
    /** Hostname */
    hostname: string;
  };
  /** List of repositories in snapshot */
  repositories: RepositoryInfo[];
  /** Archive checksum (SHA-256) */
  checksum: string;
  /** Compressed archive size in bytes */
  archiveSize: number;
  /** Optional description */
  description?: string | undefined;
}

// =============================================================================
// snapshot.create Types
// =============================================================================

export const SnapshotCreateInputSchema: z.ZodObject<{
  name: z.ZodString;
  preset: z.ZodDefault<z.ZodEnum<{ light: "light"; medium: "medium"; heavy: "heavy" }>>;
  bucket: z.ZodString;
  paths: z.ZodOptional<z.ZodArray<z.ZodString>>;
  description: z.ZodOptional<z.ZodString>;
}> = z.object({
  /** Snapshot name (used in S3 key and metadata) */
  name: z.string().describe("Snapshot name (used in S3 key and metadata)"),
  /** Capture preset (default: medium) */
  preset: SnapshotPresetSchema.default("medium").describe("Capture preset (default: medium)"),
  /** S3 bucket for storage */
  bucket: z.string().describe("S3 bucket for storage"),
  /** Specific paths to include (default: all repos in ecosystem) */
  paths: z.array(z.string()).optional().describe("Specific paths to include (default: all repos in ecosystem)"),
  /** Optional description */
  description: z.string().optional().describe("Optional description"),
});

export type SnapshotCreateInput = z.infer<typeof SnapshotCreateInputSchema>;

export interface SnapshotCreateOutput {
  /** Snapshot ID */
  id: string;
  /** S3 location */
  location: string;
  /** Metadata */
  metadata: SnapshotMetadata;
  /** Upload duration in ms */
  uploadDuration: number;
}

// =============================================================================
// snapshot.restore Types
// =============================================================================

export const SnapshotRestoreInputSchema: z.ZodObject<{
  id: z.ZodString;
  bucket: z.ZodString;
  targetPath: z.ZodString;
  overwrite: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
}> = z.object({
  /** Snapshot ID to restore */
  id: z.string().describe("Snapshot ID to restore"),
  /** S3 bucket containing snapshot */
  bucket: z.string().describe("S3 bucket containing snapshot"),
  /**
   * Destination directory the snapshot is extracted into. Required: restore
   * must never fall back to a temporary scratch directory, because that
   * scratch directory is deleted on cleanup and would wipe the restored files.
   */
  targetPath: z.string().describe("Destination directory the snapshot is extracted into. Required: restore must never fall back to a temporary scratch directory, because that scratch directory is deleted on cleanup and would wipe the restored files."),
  /** Overwrite existing files (default: false) */
  overwrite: z.boolean().optional().default(false).describe("Overwrite existing files (default: false)"),
});

export type SnapshotRestoreInput = z.infer<typeof SnapshotRestoreInputSchema>;

export interface SnapshotRestoreOutput {
  /** Whether restore succeeded */
  success: boolean;
  /** Restored snapshot metadata */
  metadata: SnapshotMetadata;
  /** Paths that were restored */
  restoredPaths: string[];
  /** Download duration in ms */
  downloadDuration: number;
  /** Extract duration in ms */
  extractDuration: number;
}

// =============================================================================
// snapshot.list Types
// =============================================================================

export const SnapshotListInputSchema: z.ZodObject<{
  bucket: z.ZodString;
  prefix: z.ZodOptional<z.ZodString>;
  maxResults: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
}> = z.object({
  /** S3 bucket to list */
  bucket: z.string().describe("S3 bucket to list"),
  /** Filter by name prefix */
  prefix: z.string().optional().describe("Filter by name prefix"),
  /** Maximum results (default: 100) */
  maxResults: z.number().optional().default(100).describe("Maximum results (default: 100)"),
});

export type SnapshotListInput = z.infer<typeof SnapshotListInputSchema>;

export interface SnapshotListEntry {
  /** Snapshot ID */
  id: string;
  /** Snapshot name */
  name: string;
  /** Preset used */
  preset: SnapshotPreset;
  /** Creation date */
  createdAt: string;
  /** Archive size in bytes */
  size: number;
  /** OS it was created on */
  os: string;
}

export interface SnapshotListOutput {
  /** List of snapshots */
  snapshots: SnapshotListEntry[];
  /** Total count */
  count: number;
}

// =============================================================================
// snapshot.diff Types
// =============================================================================

export const SnapshotDiffInputSchema: z.ZodObject<{
  id: z.ZodString;
  bucket: z.ZodString;
  paths: z.ZodOptional<z.ZodArray<z.ZodString>>;
}> = z.object({
  /** Snapshot ID to compare against */
  id: z.string().describe("Snapshot ID to compare against"),
  /** S3 bucket containing snapshot */
  bucket: z.string().describe("S3 bucket containing snapshot"),
  /** Specific paths to compare (default: all) */
  paths: z.array(z.string()).optional().describe("Specific paths to compare (default: all)"),
});

export type SnapshotDiffInput = z.infer<typeof SnapshotDiffInputSchema>;

export interface SnapshotDiffRepository {
  /** Repository path */
  path: string;
  /** Branch difference (current vs snapshot) */
  branchDiff?: { current: string; snapshot: string } | undefined;
  /** Commit difference */
  commitDiff?: { current: string; snapshot: string } | undefined;
  /** Files changed since snapshot */
  filesChanged: number;
  /** New stashes since snapshot */
  newStashes: number;
}

export interface SnapshotDiffOutput {
  /** Snapshot metadata for comparison */
  snapshotMetadata: SnapshotMetadata;
  /** Per-repository differences */
  repositories: SnapshotDiffRepository[];
  /** Overall summary */
  summary: {
    /** Total repos with differences */
    reposChanged: number;
    /** Total files changed */
    totalFilesChanged: number;
    /** Whether current state matches snapshot */
    isMatch: boolean;
  };
}

// =============================================================================
// snapshot.delete Types
// =============================================================================

export const SnapshotDeleteInputSchema: z.ZodObject<{
  id: z.ZodString;
  bucket: z.ZodString;
}> = z.object({
  /** Snapshot ID to delete */
  id: z.string().describe("Snapshot ID to delete"),
  /** S3 bucket containing snapshot */
  bucket: z.string().describe("S3 bucket containing snapshot"),
});

export type SnapshotDeleteInput = z.infer<typeof SnapshotDeleteInputSchema>;

export interface SnapshotDeleteOutput {
  /** Whether deletion succeeded */
  deleted: boolean;
  /** Deleted snapshot ID */
  id: string;
}

// =============================================================================
// Output schemas (roadmap 2.1)
// =============================================================================

// Loose objects: a field that a schema does not name stays in the result (a strict schema would
// remove it when the output is validated).
//
// The metadata of a snapshot comes back from S3, where an older version of this package can have
// written it with fewer fields. A schema that required each field of today's type would turn a
// restore that worked into a validation error, so the metadata parts require only the id. The
// casts say that these schemas are more lenient than the types on purpose.

const repositoryInfo = z.looseObject({
  path: z.string().optional().describe("The repository folder, relative to the snapshot root"),
  name: z.string().optional().describe("The package name"),
  branch: z.string().optional().describe("The branch at the time of the snapshot"),
  commit: z.string().optional().describe("The HEAD commit at the time of the snapshot"),
  dirty: z.boolean().optional().describe("True when the working tree had changes"),
  stashCount: z.number().optional().describe("The number of stashes"),
  remoteUrl: z.string().optional().describe("The remote URL"),
  ahead: z.number().optional().describe("The commits that the remote did not have"),
  behind: z.number().optional().describe("The commits of the remote that the branch did not have"),
});

const snapshotMetadata = z
  .looseObject({
    id: z.string().describe("The snapshot id"),
    name: z.string().optional().describe("The name of the snapshot"),
    preset: z.string().optional().describe("The preset: light, medium or heavy"),
    createdAt: z.string().optional().describe("The time of the snapshot (ISO 8601)"),
    environment: z
      .looseObject({
        os: z.string().optional().describe("The operating system"),
        nodeVersion: z.string().optional().describe("The Node.js version"),
        pnpmVersion: z.string().optional().describe("The pnpm version"),
        username: z.string().optional().describe("The user who made the snapshot"),
        hostname: z.string().optional().describe("The host name"),
      })
      .optional()
      .describe("The environment of the snapshot"),
    repositories: z.array(repositoryInfo).optional().describe("The repositories in the snapshot"),
    checksum: z.string().optional().describe("The SHA-256 checksum of the archive"),
    archiveSize: z.number().optional().describe("The size of the compressed archive, in bytes"),
    description: z.string().optional().describe("The description"),
  })
  .describe("The metadata of the snapshot");

export const SnapshotCreateOutputSchema: z.ZodType<SnapshotCreateOutput> = z.looseObject({
  id: z.string().describe("The snapshot id"),
  location: z.string().describe("The S3 location of the archive"),
  metadata: snapshotMetadata,
  uploadDuration: z.number().describe("The time of the upload, in milliseconds"),
}) as unknown as z.ZodType<SnapshotCreateOutput>;

export const SnapshotRestoreOutputSchema: z.ZodType<SnapshotRestoreOutput> = z.looseObject({
  success: z.boolean().describe("True when the restore succeeded"),
  metadata: snapshotMetadata,
  restoredPaths: z.array(z.string()).describe("The folders that the restore wrote"),
  downloadDuration: z.number().describe("The time of the download, in milliseconds"),
  extractDuration: z.number().describe("The time of the extraction, in milliseconds"),
}) as unknown as z.ZodType<SnapshotRestoreOutput>;

export const SnapshotListOutputSchema: z.ZodType<SnapshotListOutput> = z.looseObject({
  snapshots: z
    .array(
      z.looseObject({
        id: z.string().describe("The snapshot id"),
        name: z.string().optional().describe("The name of the snapshot"),
        preset: z.string().optional().describe("The preset"),
        createdAt: z.string().optional().describe("The time of the snapshot (ISO 8601)"),
        size: z.number().optional().describe("The size of the archive, in bytes"),
        os: z.string().optional().describe("The operating system of the snapshot"),
      })
    )
    .describe("The snapshots, newest first"),
  count: z.number().describe("The number of snapshots"),
}) as unknown as z.ZodType<SnapshotListOutput>;

const pair = z.looseObject({
  current: z.string().describe("The value now"),
  snapshot: z.string().describe("The value in the snapshot"),
});

export const SnapshotDiffOutputSchema: z.ZodType<SnapshotDiffOutput> = z.looseObject({
  snapshotMetadata,
  repositories: z
    .array(
      z.looseObject({
        path: z.string().describe("The repository folder"),
        branchDiff: pair.optional().describe("The branch now and in the snapshot, when they differ"),
        commitDiff: pair.optional().describe("The commit now and in the snapshot, when they differ"),
        filesChanged: z.number().describe("The files changed since the snapshot"),
        newStashes: z.number().describe("The stashes made since the snapshot"),
      })
    )
    .describe("The differences of each repository"),
  summary: z
    .looseObject({
      reposChanged: z.number().describe("The repositories with differences"),
      totalFilesChanged: z.number().describe("The files changed in all repositories"),
      isMatch: z.boolean().describe("True when the current state matches the snapshot"),
    })
    .describe("The summary"),
}) as unknown as z.ZodType<SnapshotDiffOutput>;

export const SnapshotDeleteOutputSchema: z.ZodType<SnapshotDeleteOutput> = z.looseObject({
  deleted: z.boolean().describe("True when the snapshot was deleted"),
  id: z.string().describe("The snapshot id"),
});
