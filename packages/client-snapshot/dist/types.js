/**
 * Type definitions for client-snapshot procedures
 *
 * Environment snapshot/restore for testing and recovery.
 * Supports light/medium/heavy presets for different capture levels.
 */
import { z } from "zod";
export const SnapshotPresetSchema = z.enum(["light", "medium", "heavy"]);
// =============================================================================
// snapshot.create Types
// =============================================================================
export const SnapshotCreateInputSchema = z.object({
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
// =============================================================================
// snapshot.restore Types
// =============================================================================
export const SnapshotRestoreInputSchema = z.object({
    /** Snapshot ID to restore */
    id: z.string(),
    /** S3 bucket containing snapshot */
    bucket: z.string(),
    /** Target path for restoration (default: original paths) */
    targetPath: z.string().optional(),
    /** Overwrite existing files (default: false) */
    overwrite: z.boolean().optional().default(false),
});
// =============================================================================
// snapshot.list Types
// =============================================================================
export const SnapshotListInputSchema = z.object({
    /** S3 bucket to list */
    bucket: z.string(),
    /** Filter by name prefix */
    prefix: z.string().optional(),
    /** Maximum results (default: 100) */
    maxResults: z.number().optional().default(100),
});
// =============================================================================
// snapshot.diff Types
// =============================================================================
export const SnapshotDiffInputSchema = z.object({
    /** Snapshot ID to compare against */
    id: z.string(),
    /** S3 bucket containing snapshot */
    bucket: z.string(),
    /** Specific paths to compare (default: all) */
    paths: z.array(z.string()).optional(),
});
// =============================================================================
// snapshot.delete Types
// =============================================================================
export const SnapshotDeleteInputSchema = z.object({
    /** Snapshot ID to delete */
    id: z.string(),
    /** S3 bucket containing snapshot */
    bucket: z.string(),
});
//# sourceMappingURL=types.js.map