/**
 * MCP Core Types
 *
 * Types for MCP (Model Context Protocol) integration with the procedure system.
 * Extends MCP SDK types with procedure-specific metadata.
 */

import type { ProcedurePath } from "@procedures/client";

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
  /** The short name of the tool for people (MCP 2025-06-18): `metadata.title` of the procedure. */
  title?: string;
  /** Human-readable description */
  description?: string;
  /** JSON Schema for tool input */
  inputSchema: JsonSchema;
  /**
   * JSON Schema of the result (MCP 2025-06-18 structured output). Only a tool whose output is
   * an object has it: then each successful result also has `structuredContent`.
   */
  outputSchema?: JsonSchema;
  /**
   * The hints of the tool (MCP 2025-03-26 tool annotations): from the declared effects of the
   * procedure (CAPABILITIES-2026-10). Absent: the MCP defaults (not read only, destructive).
   */
  annotations?: McpToolAnnotations;
  /**
   * How a client can call the tool (MCP 2025-11-25 tasks): `metadata.taskSupport` of the
   * procedure. Absent: the client calls the tool as a normal request, never as a task.
   */
  execution?: McpToolExecution;
}

/**
 * How a client can call a tool (MCP 2025-11-25). `"optional"`: as a task or as a normal request.
 * `"required"`: only as a task. `"forbidden"`: only as a normal request.
 */
export type McpTaskSupport = "forbidden" | "optional" | "required";

/** The execution of a tool: if a client can call it as a task. */
export interface McpToolExecution {
  taskSupport?: McpTaskSupport;
}

/** The hints of a tool. A client reads them. The capability of the host enforces the effects, not the hints. */
export interface McpToolAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
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
  /**
   * The output fields that hold text from outside the host (`metadata.untrusted`, CLI-10). The
   * MCP host shows their texts in envelopes, apart from the data.
   */
  untrusted?: string[];
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
  /** Only include the procedures for which this function gives true */
  include?: (path: ProcedurePath) => boolean;
}
