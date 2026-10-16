/**
 * Type definitions for client-fs procedures
 */

import type { Stats } from "node:fs";
import { z } from "zod";

// =============================================================================
// read Types - Read file contents
// =============================================================================

export const ReadInputSchema: z.ZodObject<{
  path: z.ZodString;
  encoding: z.ZodDefault<z.ZodOptional<z.ZodString>>;
}> = z.object({
  /** Path to file to read */
  path: z.string().describe("Path to file to read"),
  /** File encoding (default: utf8) */
  encoding: z.string().optional().default("utf8").describe("File encoding (default: utf8)"),
});

export type ReadInput = z.infer<typeof ReadInputSchema>;

export interface ReadOutput {
  /** File content */
  content: string;
  /** File path */
  path: string;
  /** File size in bytes */
  stats: StatOutput;
}

// =============================================================================
// write Types - Write content to file
// =============================================================================

export const WriteInputSchema: z.ZodObject<{
  path: z.ZodString;
  content: z.ZodString;
  encoding: z.ZodDefault<z.ZodOptional<z.ZodString>>;
  mode: z.ZodDefault<z.ZodOptional<z.ZodEnum<{ write: "write"; append: "append" }>>>;
}> = z.object({
  /** Path to file to write */
  path: z.string().describe("Path to file to write"),
  /** Content to write */
  content: z.string().describe("Content to write"),
  /** File encoding (default: utf8) */
  encoding: z.string().optional().default("utf8").describe("File encoding (default: utf8)"),
  /** Write mode: write (overwrite) or append (default: write) */
  mode: z.enum(["write", "append"]).optional().default("write").describe("Write mode: write (overwrite) or append (default: write)"),
});

export type WriteInput = z.infer<typeof WriteInputSchema>;

export interface WriteOutput {
  /** File path that was written */
  path: string;
  /** Bytes written */
  bytesWritten: number;
}


export const FileTypeInputSchema : z.ZodObject<{
  path: z.ZodString;
}> = z.object({
  /** Path to check */
  path: z.string().describe("Path to check"),
});

export type FileTypeInput = z.infer<typeof FileTypeInputSchema>;
export interface FileTypeOutput {
  /** Path that was checked */
  path : string;
  /** Type if exists: file, directory, or other */
  type : FileType;
  stats : Stats
}


// =============================================================================
// exists Types - Check if file or directory exists
// =============================================================================

export const ExistsInputSchema: z.ZodObject<{
  path: z.ZodString;
}> = z.object({
  /** Path to check */
  path: z.string().describe("Path to check"),
});

export type ExistsInput = z.infer<typeof ExistsInputSchema>;
export enum FileType {
  File = "file",
  Directory = "directory",
  Other = "other",
}

export type ExistsOutput = {exists : false} | {exists : true, stats : StatOutput};

// =============================================================================
// mkdir Types - Create directory
// =============================================================================

export const MkdirInputSchema: z.ZodObject<{
  path: z.ZodString;
  recursive: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
}> = z.object({
  /** Path of directory to create */
  path: z.string().describe("Path of directory to create"),
  /** Create parent directories if needed (default: true) */
  recursive: z.boolean().optional().default(true).describe("Create parent directories if needed (default: true)"),
});

export type MkdirInput = z.infer<typeof MkdirInputSchema>;

export interface MkdirOutput {
  /** Path that was created */
  path: string;
  /** Whether the directory was created (false if already existed) */
  created: boolean;
}

// =============================================================================
// rm Types - Remove file or directory
// =============================================================================

export const RmInputSchema: z.ZodObject<{
  path: z.ZodString;
  recursive: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
  force: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
}> = z.object({
  /** Path to remove */
  path: z.string().describe("Path to remove"),
  /** Remove directories and contents recursively (default: false) */
  recursive: z.boolean().optional().default(false).describe("Remove directories and contents recursively (default: false)"),
  /** Ignore errors if path doesn't exist (default: false) */
  force: z.boolean().optional().default(false).describe("Ignore errors if path doesn't exist (default: false)"),
});

export type RmInput = z.infer<typeof RmInputSchema>;

export interface RmOutput {
  /** Path that was removed */
  path: string;
  /** Whether something was removed (false if didn't exist with force=true) */
  removed: boolean;
}

// =============================================================================
// readdir Types - Read directory contents
// =============================================================================

export const ReaddirInputSchema: z.ZodObject<{
  path: z.ZodString;
  recursive: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
  includeStats: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
}> = z.object({
  /** Path of directory to read */
  path: z.string().describe("Path of directory to read"),
  /** Read subdirectories recursively (default: false) */
  recursive: z.boolean().optional().default(false).describe("Read subdirectories recursively (default: false)"),
  /** Include file stats with each entry (default: false) */
  includeStats: z.boolean().optional().default(false).describe("Include file stats with each entry (default: false)"),
});

export type ReaddirInput = z.infer<typeof ReaddirInputSchema>;

export interface ReaddirEntry {
  /** Entry name */
  name: string;
  /** Full path */
  path: string;
  /** Type: file, directory, or other */
  type: FileType;
  /** Stats if includeStats was true */
  stats?: StatOutput | undefined;
}

export interface ReaddirOutput {
  /** Directory path */
  path: string;
  /** Directory entries */
  entries: ReaddirEntry[];
}

// =============================================================================
// stat Types - Get file or directory stats
// =============================================================================

export const StatInputSchema: z.ZodObject<{
  path: z.ZodString;
}> = z.object({
  /** Path to get stats for */
  path: z.string().describe("Path to get stats for"),
});

export type StatInput = z.infer<typeof StatInputSchema>;

export interface StatOutput {
  /** Path */
  path: string;
  /** Type: file, directory, or other */
  type: FileType;
  /** Size in bytes */
  size: number;
  /** Last modified time (ISO string) */
  mtime: string;
  /** Creation time (ISO string) */
  ctime: string;
  /** Last access time (ISO string) */
  atime: string;
  /** Unix mode/permissions */
  mode: number;
}

// =============================================================================
// copy Types - Copy file or directory
// =============================================================================

export const CopyInputSchema: z.ZodObject<{
  src: z.ZodString;
  dest: z.ZodString;
  recursive: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
  overwrite: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
}> = z.object({
  /** Source path */
  src: z.string().describe("Source path"),
  /** Destination path */
  dest: z.string().describe("Destination path"),
  /** Copy directories recursively (default: true) */
  recursive: z.boolean().optional().default(true).describe("Copy directories recursively (default: true)"),
  /** Replace an existing destination (default: false). Without it, an existing destination is an error. */
  overwrite: z
    .boolean()
    .optional()
    .default(false)
    .describe("Replace an existing destination (default: false). Without it, an existing destination is an error (EEXIST), and the copy changes nothing."),
});

export type CopyInput = z.infer<typeof CopyInputSchema>;

export interface CopyOutput {
  /** Source path */
  src: string;
  /** Destination path */
  dest: string;
}

// =============================================================================
// move Types - Move or rename file/directory
// =============================================================================

export const MoveInputSchema: z.ZodObject<{
  src: z.ZodString;
  dest: z.ZodString;
  overwrite: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
}> = z.object({
  /** Source path */
  src: z.string().describe("Source path"),
  /** Destination path */
  dest: z.string().describe("Destination path"),
  /** Overwrite existing files (default: false) */
  overwrite: z.boolean().optional().default(false).describe("Overwrite existing files (default: false)"),
});

export type MoveInput = z.infer<typeof MoveInputSchema>;

export interface MoveOutput {
  /** Source path (original) */
  src: string;
  /** Destination path (new location) */
  dest: string;
}

// =============================================================================
// glob Types - Find files matching glob pattern
// =============================================================================

export const GlobInputSchema: z.ZodObject<{
  pattern: z.ZodString;
  cwd: z.ZodOptional<z.ZodString>;
  absolute: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
  dot: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
  ignore: z.ZodOptional<z.ZodArray<z.ZodString>>;
}> = z.object({
  /** Glob pattern to match */
  pattern: z.string().describe("Glob pattern to match"),
  /** Working directory (default: process.cwd()) */
  cwd: z.string().optional().describe("Working directory (default: process.cwd())"),
  /** Return absolute paths (default: false) */
  absolute: z.boolean().optional().default(false).describe("Return absolute paths (default: false)"),
  /** Include dotfiles (default: false) */
  dot: z.boolean().optional().default(false).describe("Include dotfiles (default: false)"),
  /** Glob patterns of the paths to leave out. The search does not enter the folders that they match. */
  ignore: z.array(z.string()).optional().describe("Glob patterns of the paths to leave out. The search does not enter the folders that they match."),
});

export type GlobInput = z.infer<typeof GlobInputSchema>;

export interface GlobOutput {
  /** Glob pattern used */
  pattern: string;
  /** Matching paths, sorted: relative to `cwd` with "/" separators, or absolute with `absolute: true` */
  matches: string[];
}

// =============================================================================
// read.json Types - Read and parse JSON file
// =============================================================================

export const ReadJsonInputSchema: z.ZodObject<{
  path: z.ZodString;
}> = z.object({
  /** Path to JSON file */
  path: z.string().describe("Path to JSON file"),
});

export type ReadJsonInput = z.infer<typeof ReadJsonInputSchema>;

export interface ReadJsonOutput {
  /** File path */
  path: string;
  /** Parsed JSON data */
  data: unknown;
  stats : StatOutput
}

// =============================================================================
// Output schemas (roadmap 2.1)
// =============================================================================

// Loose objects: a field that a schema does not name stays in the result (a strict schema would
// remove it when the output is validated).

const fileType = z.enum(FileType).describe("file, directory or other");

export const StatOutputSchema: z.ZodType<StatOutput> = z.looseObject({
  path: z.string().describe("The path"),
  type: fileType,
  size: z.number().describe("The size, in bytes"),
  mtime: z.string().describe("The time of the last change (ISO 8601)"),
  ctime: z.string().describe("The time of the last status change (ISO 8601)"),
  atime: z.string().describe("The time of the last access (ISO 8601)"),
  mode: z.number().describe("The mode bits (type and permissions)"),
});

export const ReadOutputSchema: z.ZodType<ReadOutput> = z.looseObject({
  content: z.string().describe("The content of the file"),
  path: z.string().describe("The path of the file"),
  stats: StatOutputSchema.describe("The stats of the file"),
});

export const WriteOutputSchema: z.ZodType<WriteOutput> = z.looseObject({
  path: z.string().describe("The path of the file"),
  bytesWritten: z.number().describe("The number of bytes written"),
});

export const ExistsOutputSchema: z.ZodType<ExistsOutput> = z.union([
  z.looseObject({ exists: z.literal(false).describe("The path does not exist") }),
  z.looseObject({
    exists: z.literal(true).describe("The path exists"),
    stats: StatOutputSchema.describe("The stats of the path"),
  }),
]);

export const MkdirOutputSchema: z.ZodType<MkdirOutput> = z.looseObject({
  path: z.string().describe("The path of the folder"),
  created: z.boolean().describe("False when the folder existed already"),
});

export const RmOutputSchema: z.ZodType<RmOutput> = z.looseObject({
  path: z.string().describe("The path"),
  removed: z.boolean().describe("False when the path did not exist (with force)"),
});

export const ReaddirOutputSchema: z.ZodType<ReaddirOutput> = z.looseObject({
  path: z.string().describe("The path of the folder"),
  entries: z
    .array(
      z.looseObject({
        name: z.string().describe("The name of the entry"),
        path: z.string().describe("The full path of the entry"),
        type: fileType,
        stats: StatOutputSchema.optional().describe("The stats, with includeStats"),
      })
    )
    .describe("The entries of the folder"),
});

export const CopyOutputSchema: z.ZodType<CopyOutput> = z.looseObject({
  src: z.string().describe("The source path"),
  dest: z.string().describe("The destination path"),
});

export const MoveOutputSchema: z.ZodType<MoveOutput> = z.looseObject({
  src: z.string().describe("The old path"),
  dest: z.string().describe("The new path"),
});

export const GlobOutputSchema: z.ZodType<GlobOutput> = z.looseObject({
  pattern: z.string().describe("The glob pattern"),
  matches: z
    .array(z.string())
    .describe('The matching paths, sorted: relative to cwd with "/" separators, or absolute with absolute: true'),
});

export const ReadJsonOutputSchema: z.ZodType<ReadJsonOutput> = z.looseObject({
  path: z.string().describe("The path of the file"),
  data: z.unknown().describe("The parsed JSON value"),
  stats: StatOutputSchema.describe("The stats of the file"),
});


// =============================================================================
// fs.write.json, fs.hash, fs.temp and fs.watch (roadmap R44)
// =============================================================================

export interface FsWriteJsonInput {
  /** The path of the file */
  path: string;
  /** The value to write (required: null writes null) */
  value: unknown;
  /** The spaces of the indent (default 2) */
  indent?: number | undefined;
}

export interface FsWriteJsonOutput {
  path: string;
  bytesWritten: number;
}

export const FsWriteJsonInputSchema: z.ZodType<FsWriteJsonInput> = z.object({
  path: z.string().describe("The path of the file"),
  value: z.unknown().describe("The value to write as JSON"),
  indent: z.number().int().min(0).max(10).optional().describe("The spaces of the indent (default 2)"),
});

export const FsWriteJsonOutputSchema: z.ZodType<FsWriteJsonOutput> = z.looseObject({
  path: z.string().describe("The path of the file"),
  bytesWritten: z.number().describe("The bytes of the file"),
});

export type HashAlgorithm = "sha256" | "sha512" | "sha1" | "md5";

export interface FsHashInput {
  path: string;
  /** The algorithm (default sha256) */
  algorithm?: HashAlgorithm | undefined;
}

export interface FsHashOutput {
  path: string;
  algorithm: HashAlgorithm;
  /** The hash, as hexadecimal text */
  hash: string;
  /** The bytes of the file */
  size: number;
}

export const FsHashInputSchema: z.ZodType<FsHashInput> = z.object({
  path: z.string().describe("The path of the file"),
  algorithm: z.enum(["sha256", "sha512", "sha1", "md5"]).optional().describe("The algorithm (default sha256)"),
});

export const FsHashOutputSchema: z.ZodType<FsHashOutput> = z.looseObject({
  path: z.string().describe("The path of the file"),
  algorithm: z.enum(["sha256", "sha512", "sha1", "md5"]).describe("The algorithm"),
  hash: z.string().describe("The hash, as hexadecimal text"),
  size: z.number().describe("The bytes of the file"),
});

export interface FsTempInput {
  /** The start of the name of the folder (default "procedures-") */
  prefix?: string | undefined;
}

export interface FsTempOutput {
  /** The path of the new folder */
  path: string;
}

export const FsTempInputSchema: z.ZodType<FsTempInput> = z.object({
  prefix: z
    .string()
    .regex(/^[A-Za-z0-9._-]{0,40}$/, "letters, digits, dot, underscore and hyphen only")
    .optional()
    .describe('The start of the name of the folder (default "procedures-")'),
});

export const FsTempOutputSchema: z.ZodType<FsTempOutput> = z.looseObject({
  path: z.string().describe("The path of the new folder"),
});

export interface FsWatchInput {
  /** The file or folder to watch */
  path: string;
  /** Also the changes in the subfolders */
  recursive?: boolean | undefined;
}

/** One change: an item of the stream of fs.watch. */
export interface FsWatchOutput {
  /** "rename" for a file that appears or goes away, "change" for a change of its content */
  event: "rename" | "change";
  /** The name of the file, relative to the path, when the platform gives it */
  filename: string | null;
}

export const FsWatchInputSchema: z.ZodType<FsWatchInput> = z.object({
  path: z.string().describe("The file or folder to watch"),
  recursive: z.boolean().optional().describe("Also the changes in the subfolders"),
});

export const FsWatchOutputSchema: z.ZodType<FsWatchOutput> = z.looseObject({
  event: z.enum(["rename", "change"]).describe('"rename" for a file that appears or goes away, "change" for its content'),
  filename: z.string().nullable().describe("The name of the file, relative to the path, when the platform gives it"),
});
