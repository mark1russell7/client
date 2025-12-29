/**
 * Path Encoder
 *
 * Converts procedure paths to/from MCP tool names.
 * MCP tool names should be valid identifiers (alphanumeric with dots/underscores).
 */
import type { ProcedurePath } from "@mark1russell7/client";
/**
 * Encode a procedure path to an MCP tool name.
 *
 * Strategy: Join path segments with dots.
 * Most procedure paths are already MCP-compatible (lowercase, alphanumeric).
 *
 * @param path - Procedure path array
 * @returns MCP tool name string
 *
 * @example
 * encodePath(["fs", "read"]) // "fs.read"
 * encodePath(["mongo", "collections", "list"]) // "mongo.collections.list"
 */
export declare function encodePath(path: ProcedurePath): string;
/**
 * Decode an MCP tool name back to procedure path.
 *
 * @param toolName - MCP tool name string
 * @returns Procedure path array
 *
 * @example
 * decodePath("fs.read") // ["fs", "read"]
 * decodePath("mongo.collections.list") // ["mongo", "collections", "list"]
 */
export declare function decodePath(toolName: string): ProcedurePath;
/**
 * Validate that a path segment is MCP-compatible.
 *
 * Valid segments:
 * - Start with letter or underscore
 * - Contain only letters, numbers, underscores, hyphens
 *
 * @param segment - Path segment to validate
 * @returns True if segment is valid for MCP tool names
 */
export declare function isValidPathSegment(segment: string): boolean;
/**
 * Validate that an entire path is MCP-compatible.
 *
 * @param path - Procedure path to validate
 * @returns True if all segments are valid
 */
export declare function isValidPath(path: ProcedurePath): boolean;
/**
 * Sanitize a path segment for MCP compatibility.
 *
 * Replaces invalid characters with underscores.
 *
 * @param segment - Path segment to sanitize
 * @returns Sanitized segment
 *
 * @example
 * sanitizePathSegment("my-func") // "my-func" (valid)
 * sanitizePathSegment("123abc") // "_123abc" (prefix if starts with number)
 * sanitizePathSegment("my.func") // "my_func" (replace dots)
 */
export declare function sanitizePathSegment(segment: string): string;
/**
 * Sanitize an entire path for MCP compatibility.
 *
 * @param path - Procedure path to sanitize
 * @returns Sanitized path
 */
export declare function sanitizePath(path: ProcedurePath): ProcedurePath;
//# sourceMappingURL=path-encoder.d.ts.map