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
  McpToolAnnotations,
  McpTool,
  McpContentItem,
  McpToolResult,
  McpTransportType,
  McpServerInfo,
  McpToolFilter,
} from "./types.js";

// Schema utilities
export {
  toolInputSchema,
  cachedToolInputSchema,
  toolOutputSchema,
  cachedToolOutputSchema,
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
  toolDescription,
  effectsSentence,
  toToolDefinition,
  createToolMap,
  findToolByPath,
  withUntrustedFields,
  UNTRUSTED_FIELD_DESCRIPTION,
} from "./mapping/index.js";

// Context utilities
export {
  isMcpContext,
  getMcpContext,
  type McpCallContext,
  type McpProcedureContext,
} from "./context/index.js";
