/**
 * The search listing of an MCP server (direction 40, the tool surface). A server with thousands
 * of tools cannot give each tool to the context of the model. With `listing: "search"`, the list
 * of tools has three tools: `search_tools`, `describe_tool` and `call_tool`. The model finds a
 * tool with a search, reads its input schema, and calls it. The expose rule and the call policy
 * of the server stay the same: the search finds only the tools of the server, and `call_tool`
 * calls a tool as a direct call does.
 */

import type { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";
import { SEARCH_LIMIT, SEARCH_MAX_LIMIT, searchDocuments, type SearchDocument } from "@procedures/client";
import { toToolDefinition, type McpTool } from "@procedures/mcp";

/** How the server lists its tools: `"each"` lists each tool, `"search"` lists the three search tools. */
export type McpToolListing = "each" | "search";

/** The names of the three tools of the search listing. */
export const SEARCH_LISTING_NAMES = {
  search: "search_tools",
  describe: "describe_tool",
  call: "call_tool",
} as const;

/** The three tools of the search listing. */
export const SEARCH_LISTING_TOOLS: readonly Tool[] = [
  {
    name: SEARCH_LISTING_NAMES.search,
    description:
      "Search the tools of this server by words. Each hit gives the name of a tool and the first line of its description. Read the input schema of a hit with describe_tool, then call it with call_tool.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", minLength: 1, description: 'The words to find, for example "median interval"' },
        limit: { type: "integer", minimum: 1, maximum: SEARCH_MAX_LIMIT, description: `The most hits. The default is ${SEARCH_LIMIT}.` },
      },
      required: ["query"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: SEARCH_LISTING_NAMES.describe,
    description: "Give the description, the input schema and the output schema of one tool of this server, by the name that search_tools gives.",
    inputSchema: {
      type: "object",
      properties: { name: { type: "string", minLength: 1, description: "The name of the tool" } },
      required: ["name"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: SEARCH_LISTING_NAMES.call,
    description: "Call one tool of this server by its name. The input must agree with the input schema that describe_tool gives.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", minLength: 1, description: "The name of the tool" },
        input: { type: "object", description: "The input of the tool", additionalProperties: true },
      },
      required: ["name"],
      additionalProperties: false,
    },
  },
];

/** The text of a value for a text block: JSON with an indent of 2, or JSON on one line. */
function jsonText(value: unknown, json: "pretty" | "compact" | undefined): string {
  return json === "compact" ? JSON.stringify(value) : JSON.stringify(value, null, 2);
}

/** A result with one text block and the value as structured content. */
function valueResult(value: Record<string, unknown>, json: "pretty" | "compact" | undefined): CallToolResult {
  return { content: [{ type: "text", text: jsonText(value, json) }], structuredContent: value };
}

/** The result of a refused input of a search tool. */
function invalidInput(message: string): CallToolResult {
  return { content: [{ type: "text", text: message }], isError: true, _meta: { code: "INVALID_INPUT", retryable: false } };
}

/** The result of a name that names no tool of the server. */
export function toolNotFound(name: string): CallToolResult {
  return { content: [{ type: "text", text: `Tool not found: ${name}` }], isError: true, _meta: { code: "NOT_FOUND", retryable: false } };
}

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);

/** The name in the arguments of `describe_tool` or `call_tool`, or the result that refuses the arguments. */
function nameOf(args: Record<string, unknown> | undefined): string | CallToolResult {
  const name = args?.["name"];
  return typeof name === "string" && name.length > 0 ? name : invalidInput("The input needs a name: the name of a tool from search_tools");
}

/**
 * This function gives the search document of each tool: its name, the segments of its path, its
 * description and its tags. `search_tools` ranks these documents, and the quality gate measures them.
 */
export function toolSearchDocuments(tools: Iterable<McpTool>): SearchDocument[] {
  return Array.from(tools, (tool) => ({
    name: tool.name,
    words: tool.procedurePath,
    description: tool.description,
    tags: tool.tags,
  }));
}

/** This function gives the result of `search_tools`: the best hits of the query over the tools. */
export function searchToolsResult(tools: Iterable<McpTool>, args: Record<string, unknown> | undefined, json?: "pretty" | "compact"): CallToolResult {
  const query = args?.["query"];
  if (typeof query !== "string" || query.trim().length === 0) return invalidInput("The input needs a query: the words to find");
  const limit = args?.["limit"];
  if (limit !== undefined && (typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 || limit > SEARCH_MAX_LIMIT)) {
    return invalidInput(`The limit is a whole number from 1 to ${SEARCH_MAX_LIMIT}`);
  }
  const result = searchDocuments(toolSearchDocuments(tools), query, { limit: limit as number | undefined });
  // A hit with no description has no field description in JSON
  return valueResult({ hits: result.hits, matched: result.matched, total: result.total }, json);
}

/**
 * This function gives the result of `describe_tool`: the definition of the tool, as the list of
 * each tool gives it. Without tasks, the definition does not say that the tool can run as one.
 */
export function describeToolResult(
  tools: ReadonlyMap<string, McpTool>,
  args: Record<string, unknown> | undefined,
  options: { readonly tasks: boolean; readonly json?: "pretty" | "compact" | undefined },
): CallToolResult {
  const name = nameOf(args);
  if (typeof name !== "string") return name;
  const tool = tools.get(name);
  if (!tool) return toolNotFound(name);
  const definition = toToolDefinition(tool) as Tool & Record<string, unknown>;
  if (!options.tasks) delete definition.execution;
  return valueResult(definition, options.json);
}

/** The target of a `call_tool` call: its tool and input, or the result that refuses its arguments. */
export type CallTarget =
  | { readonly tool: McpTool; readonly input: Record<string, unknown> | undefined }
  | { readonly refused: CallToolResult };

/** This function gives the tool and the input of a `call_tool` call, or the result that refuses its arguments. */
export function callTarget(tools: ReadonlyMap<string, McpTool>, args: Record<string, unknown> | undefined): CallTarget {
  const name = nameOf(args);
  if (typeof name !== "string") return { refused: name };
  const tool = tools.get(name);
  if (!tool) return { refused: toolNotFound(name) };
  const input = args?.["input"];
  if (input !== undefined && !isRecord(input)) return { refused: invalidInput("The input of the tool is an object") };
  return { tool, input };
}
