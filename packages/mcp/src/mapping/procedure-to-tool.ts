/**
 * Procedure to MCP Tool Mapper
 *
 * Converts procedures from PROCEDURE_REGISTRY to MCP tool definitions.
 */

import type { AnyProcedure, ProcedurePath } from "@mark1russell7/client";
import type { McpTool, McpToolDefinition, McpToolFilter } from "../types.js";
import { cachedZodToJsonSchema } from "../schema/zod-to-json-schema.js";
import { encodePath, sanitizePath } from "./path-encoder.js";

// This package's tsconfig only pulls in the `esnext` lib (no DOM/node types),
// so `console` isn't in the ambient type environment. It always exists at
// runtime under Node/MCP hosts; declare the minimal surface we use to emit a
// diagnostic to stderr (stdout is reserved for the MCP stdio protocol stream).
declare const console: { error: (...args: unknown[]) => void };

/**
 * Metadata extracted from a procedure.
 */
interface ProcedureMetadata {
  description: string | undefined;
  tags: string[] | undefined;
  internal: boolean | undefined;
}

/**
 * Extract metadata from a procedure.
 */
function extractMetadata(procedure: AnyProcedure): ProcedureMetadata {
  const meta = procedure.metadata as Record<string, unknown> | undefined;
  return {
    description: meta?.["description"] as string | undefined,
    tags: meta?.["tags"] as string[] | undefined,
    internal: meta?.["internal"] as boolean | undefined,
  };
}

/**
 * Convert a single procedure to an MCP tool definition.
 *
 * @param procedure - Procedure to convert
 * @returns MCP tool with procedure metadata
 */
export function procedureToMcpTool(procedure: AnyProcedure): McpTool {
  // Sanitize each path segment (replacing chars outside [A-Za-z0-9_-], e.g. a
  // literal "." inside a single segment) before dot-joining. This keeps the
  // dot-joined shape valid segments already have (["shell","run"] -> "shell.run",
  // which the Claude client aliases to "shell_run"), while ensuring two distinct
  // paths that would otherwise encode to the same string no longer collide.
  const toolName = encodePath(sanitizePath(procedure.path));
  const cacheKey = procedure.path.join(".");
  const meta = extractMetadata(procedure);

  const tool: McpTool = {
    name: toolName,
    description: meta.description ?? `Call ${cacheKey}`,
    inputSchema: cachedZodToJsonSchema(procedure.input, cacheKey),
    procedurePath: procedure.path,
  };

  // Only add optional properties if they have values
  if (procedure.streaming !== undefined) {
    tool.streaming = procedure.streaming;
  }
  if (meta.tags !== undefined) {
    tool.tags = meta.tags;
  }

  return tool;
}

/**
 * Convert an MCP tool to the minimal definition format (for ListToolsRequest).
 *
 * @param tool - Full MCP tool with metadata
 * @returns Minimal tool definition for MCP protocol
 */
export function toToolDefinition(tool: McpTool): McpToolDefinition {
  const def: McpToolDefinition = {
    name: tool.name,
    inputSchema: tool.inputSchema,
  };

  if (tool.description !== undefined) {
    def.description = tool.description;
  }

  return def;
}

/**
 * Check if a procedure matches the given filter.
 */
function matchesFilter(procedure: AnyProcedure, filter?: McpToolFilter): boolean {
  if (!filter) return true;

  const meta = extractMetadata(procedure);

  // Check internal filter
  if (filter.excludeInternal !== false && meta.internal) {
    return false;
  }

  // Check path prefix
  if (filter.pathPrefix) {
    const matches = filter.pathPrefix.every(
      (segment, i) => procedure.path[i] === segment
    );
    if (!matches) return false;
  }

  // Check tag inclusion
  if (filter.includeTags?.length) {
    const hasTags = meta.tags?.some((t) => filter.includeTags!.includes(t));
    if (!hasTags) return false;
  }

  // Check tag exclusion
  if (filter.excludeTags?.length) {
    const hasExcludedTag = meta.tags?.some((t) => filter.excludeTags!.includes(t));
    if (hasExcludedTag) return false;
  }

  return true;
}

/**
 * Convert multiple procedures to MCP tools.
 *
 * Filters out procedures without handlers and applies optional filters.
 *
 * @param procedures - Procedures to convert
 * @param filter - Optional filter options
 * @returns Array of MCP tools
 */
export function proceduresToMcpTools(
  procedures: AnyProcedure[],
  filter?: McpToolFilter
): McpTool[] {
  return procedures
    .filter((p) => p.handler !== undefined)
    .filter((p) => matchesFilter(p, filter))
    .map(procedureToMcpTool);
}

/**
 * Create a lookup map from tool name to MCP tool.
 *
 * @param tools - Array of MCP tools
 * @returns Map for O(1) lookup by tool name
 */
export function createToolMap(tools: McpTool[]): Map<string, McpTool> {
  const map = new Map<string, McpTool>();
  for (const tool of tools) {
    const existing = map.get(tool.name);
    if (existing !== undefined) {
      // Two distinct procedure paths encoded to the same MCP tool name. The
      // Map preserves last-wins semantics (for backward compatibility), but
      // this silently shadowed a tool before — warn on stderr so the collision
      // is visible. stderr is used because stdout is reserved for the MCP
      // stdio protocol stream.
      console.error(
        `[mcp] Tool-name collision: "${tool.name}" is produced by both ` +
          `[${existing.procedurePath.join(", ")}] and ` +
          `[${tool.procedurePath.join(", ")}]; keeping the latter (last-wins).`
      );
    }
    map.set(tool.name, tool);
  }
  return map;
}

/**
 * Find a tool by procedure path.
 *
 * @param tools - Array or map of MCP tools
 * @param path - Procedure path to find
 * @returns Tool if found, undefined otherwise
 */
export function findToolByPath(
  tools: McpTool[] | Map<string, McpTool>,
  path: ProcedurePath
): McpTool | undefined {
  // Must match the sanitization applied in procedureToMcpTool so lookups by
  // path resolve to the same tool name that was stored.
  const toolName = encodePath(sanitizePath(path));

  if (tools instanceof Map) {
    return tools.get(toolName);
  }

  return tools.find((t) => t.name === toolName);
}
