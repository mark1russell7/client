/**
 * MCP Server Transport
 *
 * Implements ServerTransport interface for MCP protocol.
 * Maps PROCEDURE_REGISTRY to MCP tools.
 */

import { Server as McpServer } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type ServerNotification,
} from "@modelcontextprotocol/sdk/types.js";
import type { ServerTransport, Server, ProcedureRegistry } from "@mark1russell7/client";
import { PROCEDURE_REGISTRY } from "@mark1russell7/client";
import {
  proceduresToMcpTools,
  toToolDefinition,
  decodePath,
  type McpTool,
} from "@mark1russell7/mcp";
import type { McpServerTransportOptions, McpServerTransportState } from "../types.js";
import { createStdioTransport } from "./stdio.js";
import { createSseTransport } from "./sse.js";

/**
 * Generate a unique request ID.
 */
/** The most text blocks of a stream result: the last items of a long stream. */
const MAX_STREAM_BLOCKS = 100;

function toText(value: unknown): string {
  return typeof value === "string" ? value : (JSON.stringify(value, null, 2) ?? String(value));
}

function generateRequestId(): string {
  return `mcp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * MCP Server Transport
 *
 * Implements the ServerTransport interface for MCP (Model Context Protocol).
 * Maps procedures from PROCEDURE_REGISTRY to MCP tools, handling:
 * - ListToolsRequest: Returns all registered procedures as tools
 * - CallToolRequest: Executes the corresponding procedure
 *
 * @example
 * ```typescript
 * const server = new ProcedureServer({ autoRegister: true });
 * const mcpTransport = new McpServerTransport(server, {
 *   transport: "stdio",
 *   serverInfo: { name: "my-server", version: "1.0.0" }
 * });
 * server.addTransport(mcpTransport);
 * await server.start();
 * ```
 */
export class McpServerTransport implements ServerTransport {
  readonly name = "mcp";

  private mcpServer: McpServer;
  private server: Server;
  private registry: ProcedureRegistry;
  private options: Required<Pick<McpServerTransportOptions, "transport" | "serverInfo">> &
    McpServerTransportOptions;
  private running = false;
  private tools: Map<string, McpTool> = new Map();
  private registerListener: ((procedure: unknown) => void) | undefined;
  private unregisterListener: ((procedure: unknown) => void) | undefined;

  constructor(server: Server, options: McpServerTransportOptions = {}) {
    this.server = server;
    this.options = {
      transport: options.transport ?? "stdio",
      serverInfo: options.serverInfo ?? {
        name: "procedure-server",
        version: "1.0.0",
      },
      ...options,
    };
    this.registry = options.registry ?? PROCEDURE_REGISTRY;

    // Create MCP server with capabilities
    this.mcpServer = new McpServer(this.options.serverInfo, {
      capabilities: {
        tools: {},
      },
    });

    // Setup request handlers
    this.setupHandlers();

    // The registry listeners are attached in start() and removed in stop(): attaching them here
    // leaked them for a transport that never started or failed to start (BUGS-2026-07 L28)
  }

  /**
   * Setup MCP request handlers.
   */
  private setupHandlers(): void {
    // ListToolsRequestSchema -> List all procedures as tools
    this.mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
      this.log("ListToolsRequest received");

      const tools = Array.from(this.tools.values()).map(toToolDefinition);

      this.log(`Returning ${tools.length} tools`);

      return { tools };
    });

    // CallToolRequestSchema -> Execute procedure
    this.mcpServer.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
      const { name, arguments: args } = request.params;

      this.log(`CallToolRequest: ${name}`);

      // Find tool
      const tool = this.tools.get(name);
      if (!tool) {
        this.log(`Tool not found: ${name}`);
        return {
          content: [{ type: "text" as const, text: `Tool not found: ${name}` }],
          isError: true,
        };
      }

      // Decode path from tool name
      const path = decodePath(name);
      const operation = path[path.length - 1];
      const service = path.slice(0, -1).join(".");

      // Build ServerRequest
      const serverRequest = {
        id: generateRequestId(),
        method: {
          service: service || path[0]!,
          operation: operation!,
        },
        payload: args ?? {},
        metadata: {
          transport: "mcp" as const,
          mcpRequestId: generateRequestId(),
        },
        // A cancelled tool call (notifications/cancelled) aborts the procedure
        signal: extra.signal,
      };

      try {
        // Process through universal server
        const response = await this.server.handle(serverRequest);

        this.log(`Tool ${name} completed: ${response.status.type}`);

        // Convert to MCP result
        if (response.status.type === "success" && response.stream) {
          return await this.streamResult(response.stream, extra);
        }
        if (response.status.type === "success") {
          return {
            content: [{ type: "text" as const, text: toText(response.payload) }],
          };
        } else {
          return {
            content: [
              {
                type: "text" as const,
                text: response.status.message ?? "Unknown error",
              },
            ],
            isError: true,
          };
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.log(`Tool ${name} error: ${message}`);

        return {
          content: [{ type: "text" as const, text: message }],
          isError: true,
        };
      }
    });
  }

  /**
   * Setup registry event listeners for dynamic tool updates.
   */
  /**
   * The result of a streaming procedure. An MCP tool result is one message, so the transport
   * reads the whole stream. Each item becomes a text block (the last MAX_STREAM_BLOCKS items),
   * and a progress notification when the caller sent a progress token, so a client can show
   * the items while the stream runs.
   */
  private async streamResult(
    stream: AsyncIterable<unknown>,
    extra: {
      _meta?: { progressToken?: string | number | undefined } | undefined;
      sendNotification: (notification: ServerNotification) => Promise<void>;
    }
  ): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
    const progressToken = extra._meta?.progressToken;
    const blocks: Array<{ type: "text"; text: string }> = [];
    let count = 0;
    try {
      for await (const item of stream) {
        count++;
        const text = toText(item);
        blocks.push({ type: "text", text });
        if (blocks.length > MAX_STREAM_BLOCKS) blocks.shift();
        if (progressToken !== undefined) {
          await extra
            .sendNotification({
              method: "notifications/progress",
              params: { progressToken, progress: count, message: text.slice(0, 1000) },
            })
            .catch(() => undefined);
        }
      }
    } catch (error) {
      blocks.push({ type: "text", text: error instanceof Error ? error.message : String(error) });
      return { content: blocks, isError: true };
    }
    if (count > MAX_STREAM_BLOCKS) {
      blocks.unshift({ type: "text", text: `(${count} items: the first ${count - MAX_STREAM_BLOCKS} are not shown)` });
    }
    if (count === 0) blocks.push({ type: "text", text: "(no items)" });
    return { content: blocks };
  }

  private setupRegistryListeners(): void {
    // Create listener functions that we can later remove
    this.registerListener = () => {
      this.log("Procedure registered, refreshing tools");
      this.refreshTools();
    };

    this.unregisterListener = () => {
      this.log("Procedure unregistered, refreshing tools");
      this.refreshTools();
    };

    // Refresh tools when procedures are registered/unregistered
    this.registry.on("register", this.registerListener);
    this.registry.on("unregister", this.unregisterListener);
  }

  /**
   * Remove the registry event listeners, if attached.
   */
  private removeRegistryListeners(): void {
    if (this.registerListener) {
      this.registry.off("register", this.registerListener);
      this.registerListener = undefined;
    }
    if (this.unregisterListener) {
      this.registry.off("unregister", this.unregisterListener);
      this.unregisterListener = undefined;
    }
  }

  /**
   * Refresh the tool list from the registry.
   */
  private refreshTools(): void {
    const procedures = this.registry.getAll();
    const mcpTools = proceduresToMcpTools(procedures, this.options.toolFilter);

    this.tools.clear();
    for (const tool of mcpTools) {
      this.tools.set(tool.name, tool);
    }

    this.log(`Refreshed tools: ${this.tools.size} available`);
  }

  /**
   * Log a debug message if debug mode is enabled.
   */
  private log(message: string): void {
    if (this.options.debug) {
      // MUST be stderr: the stdio MCP transport uses stdout for JSON-RPC framing, so any
      // stdout write here corrupts the protocol stream. See documentation/BUGS-2026-07.md (M39/Bug4).
      console.error(`[${this.name}] ${message}`);
    }
  }

  /**
   * Start the MCP transport.
   */
  async start(): Promise<void> {
    if (this.running) {
      this.log("Already running");
      return;
    }

    // Refresh tools before starting, and keep them current while running
    this.refreshTools();
    this.setupRegistryListeners();

    try {
      // Create appropriate transport
      let transport;
      if (this.options.transport === "stdio") {
        transport = createStdioTransport();
        this.log("Using stdio transport");
      } else if (this.options.transport === "sse") {
        transport = createSseTransport(this.options.sseOptions);
        this.log(`Using SSE transport on ${this.options.sseOptions?.path ?? "/mcp/sse"}`);
      } else {
        throw new Error(`Unknown MCP transport: ${this.options.transport}`);
      }

      // Connect MCP server to transport
      await this.mcpServer.connect(transport);
    } catch (error) {
      this.removeRegistryListeners();
      throw error;
    }

    this.running = true;
    this.log(`MCP server started (${this.options.transport}), ${this.tools.size} tools available`);
  }

  /**
   * Stop the MCP transport.
   */
  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    // Cleanup registry listeners
    this.removeRegistryListeners();

    await this.mcpServer.close();
    this.running = false;
    this.log("MCP server stopped");
  }

  /**
   * Check if the transport is running.
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Get current transport state.
   */
  getState(): McpServerTransportState {
    return {
      running: this.running,
      toolCount: this.tools.size,
      transport: this.options.transport,
    };
  }

  /**
   * Get the list of available tools.
   */
  getTools(): McpTool[] {
    return Array.from(this.tools.values());
  }
}
