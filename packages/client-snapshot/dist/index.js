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
// Re-export schemas
export { SnapshotPresetSchema, SnapshotCreateInputSchema, SnapshotRestoreInputSchema, SnapshotListInputSchema, SnapshotDiffInputSchema, SnapshotDeleteInputSchema, } from "./types.js";
// Re-export procedure implementations
export { snapshotCreate, snapshotList, snapshotRestore, snapshotDiff, snapshotDelete, } from "./procedures/snapshot/index.js";
//# sourceMappingURL=index.js.map