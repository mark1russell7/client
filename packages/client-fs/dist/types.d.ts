/**
 * Type definitions for client-fs procedures
 */
import { z } from "zod";
export declare const ReadInputSchema: z.ZodObject<{
    path: z.ZodString;
    encoding: z.ZodDefault<z.ZodOptional<z.ZodString>>;
}>;
export type ReadInput = z.infer<typeof ReadInputSchema>;
export interface ReadOutput {
    /** File content */
    content: string;
    /** File path */
    path: string;
    /** File size in bytes */
    size: number;
}
export declare const WriteInputSchema: z.ZodObject<{
    path: z.ZodString;
    content: z.ZodString;
    encoding: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    mode: z.ZodDefault<z.ZodOptional<z.ZodEnum<["write", "append"]>>>;
}>;
export type WriteInput = z.infer<typeof WriteInputSchema>;
export interface WriteOutput {
    /** File path that was written */
    path: string;
    /** Bytes written */
    bytesWritten: number;
}
export declare const ExistsInputSchema: z.ZodObject<{
    path: z.ZodString;
}>;
export type ExistsInput = z.infer<typeof ExistsInputSchema>;
export interface ExistsOutput {
    /** Whether the path exists */
    exists: boolean;
    /** Path that was checked */
    path: string;
    /** Type if exists: file, directory, or other */
    type?: "file" | "directory" | "other";
}
export declare const MkdirInputSchema: z.ZodObject<{
    path: z.ZodString;
    recursive: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
}>;
export type MkdirInput = z.infer<typeof MkdirInputSchema>;
export interface MkdirOutput {
    /** Path that was created */
    path: string;
    /** Whether the directory was created (false if already existed) */
    created: boolean;
}
export declare const RmInputSchema: z.ZodObject<{
    path: z.ZodString;
    recursive: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    force: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
}>;
export type RmInput = z.infer<typeof RmInputSchema>;
export interface RmOutput {
    /** Path that was removed */
    path: string;
    /** Whether something was removed (false if didn't exist with force=true) */
    removed: boolean;
}
export declare const ReaddirInputSchema: z.ZodObject<{
    path: z.ZodString;
    recursive: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    includeStats: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
}>;
export type ReaddirInput = z.infer<typeof ReaddirInputSchema>;
export interface ReaddirEntry {
    /** Entry name */
    name: string;
    /** Full path */
    path: string;
    /** Type: file, directory, or other */
    type: "file" | "directory" | "other";
    /** Stats if includeStats was true */
    stats?: {
        size: number;
        mtime: string;
        ctime: string;
    };
}
export interface ReaddirOutput {
    /** Directory path */
    path: string;
    /** Directory entries */
    entries: ReaddirEntry[];
}
export declare const StatInputSchema: z.ZodObject<{
    path: z.ZodString;
}>;
export type StatInput = z.infer<typeof StatInputSchema>;
export interface StatOutput {
    /** Path */
    path: string;
    /** Type: file, directory, or other */
    type: "file" | "directory" | "other";
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
export declare const CopyInputSchema: z.ZodObject<{
    src: z.ZodString;
    dest: z.ZodString;
    recursive: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    overwrite: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
}>;
export type CopyInput = z.infer<typeof CopyInputSchema>;
export interface CopyOutput {
    /** Source path */
    src: string;
    /** Destination path */
    dest: string;
}
export declare const MoveInputSchema: z.ZodObject<{
    src: z.ZodString;
    dest: z.ZodString;
    overwrite: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
}>;
export type MoveInput = z.infer<typeof MoveInputSchema>;
export interface MoveOutput {
    /** Source path (original) */
    src: string;
    /** Destination path (new location) */
    dest: string;
}
export declare const GlobInputSchema: z.ZodObject<{
    pattern: z.ZodString;
    cwd: z.ZodOptional<z.ZodString>;
    absolute: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    dot: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
}>;
export type GlobInput = z.infer<typeof GlobInputSchema>;
export interface GlobOutput {
    /** Glob pattern used */
    pattern: string;
    /** Matching paths */
    matches: string[];
}
export declare const ReadJsonInputSchema: z.ZodObject<{
    path: z.ZodString;
}>;
export type ReadJsonInput = z.infer<typeof ReadJsonInputSchema>;
export interface ReadJsonOutput {
    /** File path */
    path: string;
    /** Parsed JSON data */
    data: unknown;
}
//# sourceMappingURL=types.d.ts.map