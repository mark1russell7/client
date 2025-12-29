/**
 * MCP Core Package
 *
 * Core types and utilities for MCP (Model Context Protocol) integration
 * with the procedure system.
 *
 * @packageDocumentation
 */

// Types
export type {
  JsonSchema,
  McpToolDefinition,
  McpTool,
  McpContentItem,
  McpToolResult,
  McpTransportType,
  McpServerInfo,
  McpToolFilter,
} from "./types.js";

// Schema utilities
export {
  zodToJsonSchema,
  cachedZodToJsonSchema,
  clearSchemaCache,
  getSchemaCacheSize,
  type ZodToJsonSchemaOptions,
} from "./schema/index.js";

// Mapping utilities
export {
  encodePath,
  decodePath,
  isValidPathSegment,
  isValidPath,
  sanitizePathSegment,
  sanitizePath,
  procedureToMcpTool,
  proceduresToMcpTools,
  toToolDefinition,
  createToolMap,
  findToolByPath,
} from "./mapping/index.js";

// Context utilities
export {
  isMcpContext,
  getMcpContext,
  type McpCallContext,
  type McpProcedureContext,
} from "./context/index.js";
