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

export const SnapshotPresetSchema: z.ZodEnum<["light", "medium", "heavy"]> = z.enum(["light", "medium", "heavy"]);

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
  preset: z.ZodDefault<z.ZodEnum<["light", "medium", "heavy"]>>;
  bucket: z.ZodString;
  paths: z.ZodOptional<z.ZodArray<z.ZodString>>;
  description: z.ZodOptional<z.ZodString>;
}> = z.object({
  /** Snapshot name (used in S3 key and metadata) */
  name: z.string(),
  /** Capture preset (default: medium) */
  preset: SnapshotPresetSchema.default("medium"),
  /** S3 bucket for storage */
  bucket: z.string(),
  /** Specific paths to include (default: all repos in ecosystem) */
  paths: z.array(z.string()).optional(),
  /** Optional description */
  description: z.string().optional(),
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
  targetPath: z.ZodOptional<z.ZodString>;
  overwrite: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
}> = z.object({
  /** Snapshot ID to restore */
  id: z.string(),
  /** S3 bucket containing snapshot */
  bucket: z.string(),
  /** Target path for restoration (default: original paths) */
  targetPath: z.string().optional(),
  /** Overwrite existing files (default: false) */
  overwrite: z.boolean().optional().default(false),
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
  bucket: z.string(),
  /** Filter by name prefix */
  prefix: z.string().optional(),
  /** Maximum results (default: 100) */
  maxResults: z.number().optional().default(100),
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
  id: z.string(),
  /** S3 bucket containing snapshot */
  bucket: z.string(),
  /** Specific paths to compare (default: all) */
  paths: z.array(z.string()).optional(),
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
  id: z.string(),
  /** S3 bucket containing snapshot */
  bucket: z.string(),
});

export type SnapshotDeleteInput = z.infer<typeof SnapshotDeleteInputSchema>;

export interface SnapshotDeleteOutput {
  /** Whether deletion succeeded */
  deleted: boolean;
  /** Deleted snapshot ID */
  id: string;
}
