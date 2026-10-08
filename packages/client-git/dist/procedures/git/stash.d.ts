/**
 * git.stash.* procedures
 *
 * Stash operations for saving and restoring work in progress.
 * Includes export/import for snapshot storage.
 */
import type { GitStashListInput, GitStashListOutput, GitStashPushInput, GitStashPushOutput, GitStashPopInput, GitStashPopOutput, GitStashApplyInput, GitStashApplyOutput, GitStashDropInput, GitStashDropOutput, GitStashExportInput, GitStashExportOutput, GitStashImportInput, GitStashImportOutput } from "../../types.js";
/**
 * List all stashes
 */
export declare function gitStashList(input: GitStashListInput): Promise<GitStashListOutput>;
/**
 * Push changes to stash
 */
export declare function gitStashPush(input: GitStashPushInput): Promise<GitStashPushOutput>;
/**
 * Pop stash (apply and remove)
 */
export declare function gitStashPop(input: GitStashPopInput): Promise<GitStashPopOutput>;
/**
 * Apply stash without removing
 */
export declare function gitStashApply(input: GitStashApplyInput): Promise<GitStashApplyOutput>;
/**
 * Drop a stash
 */
export declare function gitStashDrop(input: GitStashDropInput): Promise<GitStashDropOutput>;
/**
 * Export a stash as a patch (for snapshot storage)
 */
export declare function gitStashExport(input: GitStashExportInput): Promise<GitStashExportOutput>;
/**
 * Import a stash from a patch (for snapshot restore)
 * Note: This creates a new stash, it doesn't recreate the exact stash state
 */
export declare function gitStashImport(input: GitStashImportInput): Promise<GitStashImportOutput>;
//# sourceMappingURL=stash.d.ts.map