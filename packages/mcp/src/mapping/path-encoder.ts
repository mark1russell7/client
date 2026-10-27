/**
 * Path Encoder
 *
 * Converts procedure paths to/from MCP tool names.
 * An MCP tool name is a valid identifier: letters, digits, dots and underscores.
 */

import { keyToPath, pathToKey, type ProcedurePath } from "@procedures/client";

/**
 * Encode a procedure path to an MCP tool name.
 *
 * The name is the key of the path (`pathToKey()`): the segments with dots between them.
 * A segment with a dot keeps its dot as `%2E`, so `decodePath()` gives the path again.
 * An MCP tool name cannot have `%`. Thus give a sanitized path (`sanitizePath()`): it has no dot in a segment.
 *
 * @param path - Procedure path array
 * @returns MCP tool name string
 *
 * @example
 * encodePath(["fs", "read"]) // "fs.read"
 * encodePath(["mongo", "collections", "list"]) // "mongo.collections.list"
 */
export function encodePath(path: ProcedurePath): string {
  return pathToKey(path);
}

/**
 * Decode an MCP tool name back to procedure path.
 *
 * The path is the path of the key (`keyToPath()`). For each path, `decodePath(encodePath(path))` gives the path.
 *
 * @param toolName - MCP tool name string
 * @returns Procedure path array
 *
 * @example
 * decodePath("fs.read") // ["fs", "read"]
 * decodePath("mongo.collections.list") // ["mongo", "collections", "list"]
 */
export function decodePath(toolName: string): ProcedurePath {
  return keyToPath(toolName);
}

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
export function isValidPathSegment(segment: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(segment);
}

/**
 * Validate that an entire path is MCP-compatible.
 *
 * @param path - Procedure path to validate
 * @returns True if all segments are valid
 */
export function isValidPath(path: ProcedurePath): boolean {
  return path.length > 0 && path.every(isValidPathSegment);
}

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
export function sanitizePathSegment(segment: string): string {
  // Replace invalid chars with underscores
  let sanitized = segment.replace(/[^a-zA-Z0-9_-]/g, "_");

  // Prefix if starts with number
  if (/^[0-9]/.test(sanitized)) {
    sanitized = "_" + sanitized;
  }

  // Ensure not empty
  if (!sanitized) {
    sanitized = "_";
  }

  return sanitized;
}

/**
 * Sanitize an entire path for MCP compatibility.
 *
 * @param path - Procedure path to sanitize
 * @returns Sanitized path
 */
export function sanitizePath(path: ProcedurePath): ProcedurePath {
  return path.map(sanitizePathSegment);
}
