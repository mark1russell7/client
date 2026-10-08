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
  path: z.string(),
  /** File encoding (default: utf8) */
  encoding: z.string().optional().default("utf8"),
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
  mode: z.ZodDefault<z.ZodOptional<z.ZodEnum<["write", "append"]>>>;
}> = z.object({
  /** Path to file to write */
  path: z.string(),
  /** Content to write */
  content: z.string(),
  /** File encoding (default: utf8) */
  encoding: z.string().optional().default("utf8"),
  /** Write mode: write (overwrite) or append (default: write) */
  mode: z.enum(["write", "append"]).optional().default("write"),
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
  path: z.string(),
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
  path: z.string(),
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
  path: z.string(),
  /** Create parent directories if needed (default: true) */
  recursive: z.boolean().optional().default(true),
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
  path: z.string(),
  /** Remove directories and contents recursively (default: false) */
  recursive: z.boolean().optional().default(false),
  /** Ignore errors if path doesn't exist (default: false) */
  force: z.boolean().optional().default(false),
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
  path: z.string(),
  /** Read subdirectories recursively (default: false) */
  recursive: z.boolean().optional().default(false),
  /** Include file stats with each entry (default: false) */
  includeStats: z.boolean().optional().default(false),
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
  stats?: StatOutput;
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
  path: z.string(),
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
  src: z.string(),
  /** Destination path */
  dest: z.string(),
  /** Copy directories recursively (default: true) */
  recursive: z.boolean().optional().default(true),
  /** Overwrite existing files (default: false) */
  overwrite: z.boolean().optional().default(false),
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
  src: z.string(),
  /** Destination path */
  dest: z.string(),
  /** Overwrite existing files (default: false) */
  overwrite: z.boolean().optional().default(false),
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
}> = z.object({
  /** Glob pattern to match */
  pattern: z.string(),
  /** Working directory (default: process.cwd()) */
  cwd: z.string().optional(),
  /** Return absolute paths (default: false) */
  absolute: z.boolean().optional().default(false),
  /** Include dotfiles (default: false) */
  dot: z.boolean().optional().default(false),
});

export type GlobInput = z.infer<typeof GlobInputSchema>;

export interface GlobOutput {
  /** Glob pattern used */
  pattern: string;
  /** Matching paths */
  matches: string[];
}

// =============================================================================
// read.json Types - Read and parse JSON file
// =============================================================================

export const ReadJsonInputSchema: z.ZodObject<{
  path: z.ZodString;
}> = z.object({
  /** Path to JSON file */
  path: z.string(),
});

export type ReadJsonInput = z.infer<typeof ReadJsonInputSchema>;

export interface ReadJsonOutput {
  /** File path */
  path: string;
  /** Parsed JSON data */
  data: unknown;
  stats : StatOutput
}
