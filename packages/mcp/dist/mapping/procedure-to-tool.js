/**
 * Procedure to MCP Tool Mapper
 *
 * Converts procedures from PROCEDURE_REGISTRY to MCP tool definitions.
 */
import { cachedZodToJsonSchema } from "../schema/zod-to-json-schema.js";
import { encodePath } from "./path-encoder.js";
/**
 * Extract metadata from a procedure.
 */
function extractMetadata(procedure) {
    const meta = procedure.metadata;
    return {
        description: meta?.["description"],
        tags: meta?.["tags"],
        internal: meta?.["internal"],
    };
}
/**
 * Convert a single procedure to an MCP tool definition.
 *
 * @param procedure - Procedure to convert
 * @returns MCP tool with procedure metadata
 */
export function procedureToMcpTool(procedure) {
    const toolName = encodePath(procedure.path);
    const cacheKey = procedure.path.join(".");
    const meta = extractMetadata(procedure);
    const tool = {
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
export function toToolDefinition(tool) {
    const def = {
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
function matchesFilter(procedure, filter) {
    if (!filter)
        return true;
    const meta = extractMetadata(procedure);
    // Check internal filter
    if (filter.excludeInternal !== false && meta.internal) {
        return false;
    }
    // Check path prefix
    if (filter.pathPrefix) {
        const matches = filter.pathPrefix.every((segment, i) => procedure.path[i] === segment);
        if (!matches)
            return false;
    }
    // Check tag inclusion
    if (filter.includeTags?.length) {
        const hasTags = meta.tags?.some((t) => filter.includeTags.includes(t));
        if (!hasTags)
            return false;
    }
    // Check tag exclusion
    if (filter.excludeTags?.length) {
        const hasExcludedTag = meta.tags?.some((t) => filter.excludeTags.includes(t));
        if (hasExcludedTag)
            return false;
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
export function proceduresToMcpTools(procedures, filter) {
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
export function createToolMap(tools) {
    const map = new Map();
    for (const tool of tools) {
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
export function findToolByPath(tools, path) {
    const toolName = encodePath(path);
    if (tools instanceof Map) {
        return tools.get(toolName);
    }
    return tools.find((t) => t.name === toolName);
}
//# sourceMappingURL=procedure-to-tool.js.map