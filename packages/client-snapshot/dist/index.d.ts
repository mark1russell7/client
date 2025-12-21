/**
 * client-snapshot - Environment snapshot/restore procedures
 *
 * Provides procedures for capturing and restoring environment snapshots
 * including git repositories, node_modules, and pnpm stores.
 *
 * Presets:
 * - light: Git repos only (~500MB)
 * - medium: + node_modules (~2GB)
 * - heavy: + pnpm store (~10GB+)
 */
export type { SnapshotPreset, RepositoryInfo, SnapshotMetadata, SnapshotCreateInput, SnapshotCreateOutput, SnapshotRestoreInput, SnapshotRestoreOutput, SnapshotListInput, SnapshotListOutput, SnapshotListEntry, SnapshotDiffInput, SnapshotDiffOutput, SnapshotDiffRepository, SnapshotDeleteInput, SnapshotDeleteOutput, } from "./types.js";
export { SnapshotPresetSchema, SnapshotCreateInputSchema, SnapshotRestoreInputSchema, SnapshotListInputSchema, SnapshotDiffInputSchema, SnapshotDeleteInputSchema, } from "./types.js";
export { snapshotCreate, snapshotList, snapshotRestore, snapshotDiff, snapshotDelete, } from "./procedures/snapshot/index.js";
//# sourceMappingURL=index.d.ts.map