/**
 * Type definitions for client-fs procedures
 */
import { z } from "zod";
// =============================================================================
// read Types - Read file contents
// =============================================================================
export const ReadInputSchema = z.object({
    /** Path to file to read */
    path: z.string(),
    /** File encoding (default: utf8) */
    encoding: z.string().optional().default("utf8"),
});
// =============================================================================
// write Types - Write content to file
// =============================================================================
export const WriteInputSchema = z.object({
    /** Path to file to write */
    path: z.string(),
    /** Content to write */
    content: z.string(),
    /** File encoding (default: utf8) */
    encoding: z.string().optional().default("utf8"),
    /** Write mode: write (overwrite) or append (default: write) */
    mode: z.enum(["write", "append"]).optional().default("write"),
});
export const FileTypeInputSchema = z.object({
    /** Path to check */
    path: z.string(),
});
// =============================================================================
// exists Types - Check if file or directory exists
// =============================================================================
export const ExistsInputSchema = z.object({
    /** Path to check */
    path: z.string(),
});
export var FileType;
(function (FileType) {
    FileType["File"] = "file";
    FileType["Directory"] = "directory";
    FileType["Other"] = "other";
})(FileType || (FileType = {}));
// =============================================================================
// mkdir Types - Create directory
// =============================================================================
export const MkdirInputSchema = z.object({
    /** Path of directory to create */
    path: z.string(),
    /** Create parent directories if needed (default: true) */
    recursive: z.boolean().optional().default(true),
});
// =============================================================================
// rm Types - Remove file or directory
// =============================================================================
export const RmInputSchema = z.object({
    /** Path to remove */
    path: z.string(),
    /** Remove directories and contents recursively (default: false) */
    recursive: z.boolean().optional().default(false),
    /** Ignore errors if path doesn't exist (default: false) */
    force: z.boolean().optional().default(false),
});
// =============================================================================
// readdir Types - Read directory contents
// =============================================================================
export const ReaddirInputSchema = z.object({
    /** Path of directory to read */
    path: z.string(),
    /** Read subdirectories recursively (default: false) */
    recursive: z.boolean().optional().default(false),
    /** Include file stats with each entry (default: false) */
    includeStats: z.boolean().optional().default(false),
});
// =============================================================================
// stat Types - Get file or directory stats
// =============================================================================
export const StatInputSchema = z.object({
    /** Path to get stats for */
    path: z.string(),
});
// =============================================================================
// copy Types - Copy file or directory
// =============================================================================
export const CopyInputSchema = z.object({
    /** Source path */
    src: z.string(),
    /** Destination path */
    dest: z.string(),
    /** Copy directories recursively (default: true) */
    recursive: z.boolean().optional().default(true),
    /** Overwrite existing files (default: false) */
    overwrite: z.boolean().optional().default(false),
});
// =============================================================================
// move Types - Move or rename file/directory
// =============================================================================
export const MoveInputSchema = z.object({
    /** Source path */
    src: z.string(),
    /** Destination path */
    dest: z.string(),
    /** Overwrite existing files (default: false) */
    overwrite: z.boolean().optional().default(false),
});
// =============================================================================
// glob Types - Find files matching glob pattern
// =============================================================================
export const GlobInputSchema = z.object({
    /** Glob pattern to match */
    pattern: z.string(),
    /** Working directory (default: process.cwd()) */
    cwd: z.string().optional(),
    /** Return absolute paths (default: false) */
    absolute: z.boolean().optional().default(false),
    /** Include dotfiles (default: false) */
    dot: z.boolean().optional().default(false),
});
// =============================================================================
// read.json Types - Read and parse JSON file
// =============================================================================
export const ReadJsonInputSchema = z.object({
    /** Path to JSON file */
    path: z.string(),
});
//# sourceMappingURL=types.js.map