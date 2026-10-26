/**
 * A caller of the transport contract over an MCP client (CLI-85). The MCP faces of `client-mcp`
 * and of a host in `client-server` use it. It has no import of the MCP SDK: the face gives the
 * client, so the caller works with the copy of the SDK of each package.
 *
 * An MCP tool call is one result. A stream comes back as one result with a text block for each
 * item. An error result has `isError`, its code and its flag in `_meta`, and its message in the
 * last text block.
 */

import { contractDescription, type ContractCaller } from "./transport-contract.js";

/** The parts of an MCP client of the SDK that the caller uses. */
export interface McpClientLike {
  listTools(): Promise<{ tools: Array<{ name: string; description?: string | undefined }> }>;
  callTool(params: { name: string; arguments?: Record<string, unknown> }, resultSchema?: undefined, options?: { signal?: AbortSignal }): Promise<unknown>;
  close(): Promise<void>;
}

type ToolResult = { content?: Array<{ type: string; text?: string }>; isError?: boolean; _meta?: Record<string, unknown> };

/** The value of a text block: JSON, or the text itself. */
function valueOf(text: string | undefined): unknown {
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * The error of an error result: the code and the flag of `_meta`, and the message of the last text
 * block. The blocks of a stream that fails are its items, then the message of the error.
 */
function errorOf(result: ToolResult): Error {
  const meta = result._meta ?? {};
  return Object.assign(new Error(result.content?.at(-1)?.text ?? ""), { code: meta["code"], retryable: meta["retryable"] === true, metadata: meta });
}

/**
 * The error of a refusal of the HTTP endpoint, before the tool call: the SDK puts the JSON-RPC
 * body of the refusal in its message. Its `data.code` is the code of the refusal.
 */
function refusalOf(error: unknown): unknown {
  const message = error instanceof Error ? error.message : String(error);
  const start = message.indexOf("{");
  if (start < 0) return error;
  try {
    const body = JSON.parse(message.slice(start)) as { error?: { message?: string; data?: { code?: string; retryable?: boolean } } };
    const code = body.error?.data?.code;
    if (code === undefined) return error;
    return Object.assign(new Error(body.error?.message ?? message), { code, retryable: body.error?.data?.retryable === true });
  } catch {
    return error;
  }
}

/**
 * A caller of an MCP client. It finds the tool of a path by the description of the procedure, so
 * it does not depend on the form of a tool name. The client connects at its first call, so a
 * refusal of the connection is the error of that call.
 */
export function mcpCaller(open: () => Promise<McpClientLike>): ContractCaller {
  let client: Promise<{ mcp: McpClientLike; names: Map<string, string> }> | undefined;
  const connect = () =>
    (client ??= (async () => {
      const mcp = await open();
      const { tools } = await mcp.listTools();
      return { mcp, names: new Map(tools.map((tool) => [tool.description ?? "", tool.name])) };
    })());
  const call = async (path: readonly string[], input: unknown, signal?: AbortSignal): Promise<ToolResult> => {
    try {
      const { mcp, names } = await connect();
      const name = names.get(contractDescription(path)) ?? path.join(".");
      return (await mcp.callTool({ name, arguments: input as Record<string, unknown> }, undefined, signal ? { signal } : {})) as ToolResult;
    } catch (error) {
      throw refusalOf(error);
    }
  };
  return {
    async call(path, input, options) {
      const result = await call(path, input, options?.signal);
      if (result.isError) throw errorOf(result);
      return valueOf(result.content?.[0]?.text);
    },
    async *stream(path, input, options) {
      const result = await call(path, input, options?.signal);
      if (result.isError) throw errorOf(result);
      // A stream without items gives one block "(no items)" for the reader of the result
      const blocks = result.content ?? [];
      if (blocks.length === 1 && blocks[0]!.text === "(no items)") return;
      for (const block of blocks) yield valueOf(block.text);
    },
    async close() {
      if (client) await (await client.catch(() => undefined))?.mcp.close();
    },
  };
}
