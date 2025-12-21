/**
 * Type definitions for client-snapshot procedures
 *
 * Environment snapshot/restore for testing and recovery.
 * Supports light/medium/heavy presets for different capture levels.
 */
import { z } from "zod";
export type SnapshotPreset = "light" | "medium" | "heavy";
export declare const SnapshotPresetSchema: z.ZodEnum<["light", "medium", "heavy"]>;
/**
 * Preset descriptions:
 * - light: Git repos only (.git, working tree, branches, stashes) ~500MB
 * - medium: + node_modules + pnpm lockfiles ~2GB
 * - heavy: + pnpm store + global installs + configs ~10GB+
 */
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
export declare const SnapshotCreateInputSchema: z.ZodObject<{
    name: z.ZodString;
    preset: z.ZodDefault<z.ZodEnum<["light", "medium", "heavy"]>>;
    bucket: z.ZodString;
    paths: z.ZodOptional<z.ZodArray<z.ZodString>>;
    description: z.ZodOptional<z.ZodString>;
}>;
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
export declare const SnapshotRestoreInputSchema: z.ZodObject<{
    id: z.ZodString;
    bucket: z.ZodString;
    targetPath: z.ZodOptional<z.ZodString>;
    overwrite: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
}>;
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
export declare const SnapshotListInputSchema: z.ZodObject<{
    bucket: z.ZodString;
    prefix: z.ZodOptional<z.ZodString>;
    maxResults: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
}>;
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
export declare const SnapshotDiffInputSchema: z.ZodObject<{
    id: z.ZodString;
    bucket: z.ZodString;
    paths: z.ZodOptional<z.ZodArray<z.ZodString>>;
}>;
export type SnapshotDiffInput = z.infer<typeof SnapshotDiffInputSchema>;
export interface SnapshotDiffRepository {
    /** Repository path */
    path: string;
    /** Branch difference (current vs snapshot) */
    branchDiff?: {
        current: string;
        snapshot: string;
    } | undefined;
    /** Commit difference */
    commitDiff?: {
        current: string;
        snapshot: string;
    } | undefined;
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
export declare const SnapshotDeleteInputSchema: z.ZodObject<{
    id: z.ZodString;
    bucket: z.ZodString;
}>;
export type SnapshotDeleteInput = z.infer<typeof SnapshotDeleteInputSchema>;
export interface SnapshotDeleteOutput {
    /** Whether deletion succeeded */
    deleted: boolean;
    /** Deleted snapshot ID */
    id: string;
}
//# sourceMappingURL=types.d.ts.map