/**
 * Procedure to MCP Tool Mapper
 *
 * Converts procedures from PROCEDURE_REGISTRY to MCP tool definitions.
 */
import type { AnyProcedure, ProcedurePath } from "@mark1russell7/client";
import type { McpTool, McpToolDefinition, McpToolFilter } from "../types.js";
/**
 * Convert a single procedure to an MCP tool definition.
 *
 * @param procedure - Procedure to convert
 * @returns MCP tool with procedure metadata
 */
export declare function procedureToMcpTool(procedure: AnyProcedure): McpTool;
/**
 * Convert an MCP tool to the minimal definition format (for ListToolsRequest).
 *
 * @param tool - Full MCP tool with metadata
 * @returns Minimal tool definition for MCP protocol
 */
export declare function toToolDefinition(tool: McpTool): McpToolDefinition;
/**
 * Convert multiple procedures to MCP tools.
 *
 * Filters out procedures without handlers and applies optional filters.
 *
 * @param procedures - Procedures to convert
 * @param filter - Optional filter options
 * @returns Array of MCP tools
 */
export declare function proceduresToMcpTools(procedures: AnyProcedure[], filter?: McpToolFilter): McpTool[];
/**
 * Create a lookup map from tool name to MCP tool.
 *
 * @param tools - Array of MCP tools
 * @returns Map for O(1) lookup by tool name
 */
export declare function createToolMap(tools: McpTool[]): Map<string, McpTool>;
/**
 * Find a tool by procedure path.
 *
 * @param tools - Array or map of MCP tools
 * @param path - Procedure path to find
 * @returns Tool if found, undefined otherwise
 */
export declare function findToolByPath(tools: McpTool[] | Map<string, McpTool>, path: ProcedurePath): McpTool | undefined;
//# sourceMappingURL=procedure-to-tool.d.ts.map