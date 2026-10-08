/**
 * Path Encoder
 *
 * Converts procedure paths to/from MCP tool names.
 * MCP tool names should be valid identifiers (alphanumeric with dots/underscores).
 */
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
export function encodePath(path) {
    return path.join(".");
}
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
export function decodePath(toolName) {
    return toolName.split(".");
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
export function isValidPathSegment(segment) {
    return /^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(segment);
}
/**
 * Validate that an entire path is MCP-compatible.
 *
 * @param path - Procedure path to validate
 * @returns True if all segments are valid
 */
export function isValidPath(path) {
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
export function sanitizePathSegment(segment) {
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
export function sanitizePath(path) {
    return path.map(sanitizePathSegment);
}
//# sourceMappingURL=path-encoder.js.map