/**
 * MCP Core Types
 *
 * Types for MCP (Model Context Protocol) integration with the procedure system.
 * Extends MCP SDK types with procedure-specific metadata.
 */
import type { ProcedurePath } from "@mark1russell7/client";
/**
 * JSON Schema type for MCP tool inputSchema.
 * Simplified representation of JSON Schema 7.
 */
export interface JsonSchema {
    type?: string | string[];
    properties?: Record<string, JsonSchema>;
    items?: JsonSchema | JsonSchema[];
    required?: string[];
    additionalProperties?: boolean | JsonSchema;
    description?: string;
    default?: unknown;
    enum?: unknown[];
    const?: unknown;
    oneOf?: JsonSchema[];
    anyOf?: JsonSchema[];
    allOf?: JsonSchema[];
    $ref?: string;
    definitions?: Record<string, JsonSchema>;
    [key: string]: unknown;
}
/**
 * MCP Tool definition as used in ListToolsRequest response.
 */
export interface McpToolDefinition {
    /** Tool name (procedure path joined with dots) */
    name: string;
    /** Human-readable description */
    description?: string;
    /** JSON Schema for tool input */
    inputSchema: JsonSchema;
}
/**
 * Extended MCP Tool with procedure metadata.
 * Used internally for mapping and introspection.
 */
export interface McpTool extends McpToolDefinition {
    /** Original procedure path */
    procedurePath: ProcedurePath;
    /** Whether the procedure supports streaming output */
    streaming?: boolean;
    /** Procedure tags for filtering */
    tags?: string[];
}
/**
 * MCP tool call result content item.
 */
export interface McpContentItem {
    type: "text" | "image" | "resource";
    text?: string;
    data?: string;
    mimeType?: string;
}
/**
 * MCP tool call result.
 */
export interface McpToolResult {
    content: McpContentItem[];
    isError?: boolean;
}
/**
 * MCP transport types.
 */
export type McpTransportType = "stdio" | "sse";
/**
 * MCP server information.
 */
export interface McpServerInfo {
    name: string;
    version: string;
}
/**
 * MCP tool filter options.
 */
export interface McpToolFilter {
    /** Only include procedures with these tags */
    includeTags?: string[];
    /** Exclude procedures with these tags */
    excludeTags?: string[];
    /** Exclude procedures marked as internal */
    excludeInternal?: boolean;
    /** Only include procedures under this path prefix */
    pathPrefix?: ProcedurePath;
}
//# sourceMappingURL=types.d.ts.map