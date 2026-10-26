/**
 * MCP Server Transport
 *
 * Implements ServerTransport interface for MCP protocol.
 * Maps PROCEDURE_REGISTRY to MCP tools.
 */

import { Server as McpServer } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
  type CallToolResult,
  type Request,
  type ServerNotification,
  type Task,
} from "@modelcontextprotocol/sdk/types.js";
import type { RequestTaskStore } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type { Transport as SdkTransport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { IncomingMessage, ServerResponse } from "node:http";
import type {
  ServerTransport,
  ProcedureRegistry,
  RequestHandler,
  Credentials,
  Elicit,
  ElicitMode,
  ElicitRequest,
  ElicitResult,
  ElicitOptions,
  Principal,
  ReportProgress,
} from "@procedures/client";
import { LOCAL_CREDENTIALS, NARROWING_METADATA_KEY, PROCEDURE_REGISTRY, addNarrowing, pathToMethod, createElicit, elicitWithPolicy, requestCredentials, retryableOf, untrustedTextsOf } from "@procedures/client";
import {
  proceduresToMcpTools,
  toToolDefinition,
  type McpTool,
} from "@procedures/mcp";
import type { McpServerTransportOptions, McpServerTransportState, McpTextBlock, McpToolContent } from "../types.js";
import { createStdioTransport } from "./stdio.js";
import { createSseTransport } from "./sse.js";
import { createHttpTransport, requestCredentialsOf, type McpHttpTransport } from "./http.js";
import { optionalMs } from "@procedures/client";
import { createUntrustedEnvelopes } from "../untrusted.js";
import { taskStoreOf, type McpTaskStore } from "../tasks.js";

/**
 * The tools with the names of a `toolName` function. Without the function, the tools keep the
 * default names.
 */
export function namedTools(tools: readonly McpTool[], toolName?: ((path: readonly string[]) => string) | undefined): McpTool[] {
  return toolName ? tools.map((tool) => ({ ...tool, name: toolName(tool.procedurePath) })) : [...tools];
}

/**
 * The tools whose name no other tool has (CLI-28). A join of the segments can give two
 * procedures one name, for example `["a_b", "c"]` and `["a", "b_c"]` with `path.join("_")`. Then
 * the function leaves out the two tools, so a call does not reach the wrong procedure.
 * `onCollision` gets each such name and the paths of its procedures.
 */
export function distinctTools(
  tools: readonly McpTool[],
  onCollision?: ((name: string, paths: readonly (readonly string[])[]) => void) | undefined
): McpTool[] {
  const byName = new Map<string, McpTool[]>();
  for (const tool of tools) byName.set(tool.name, [...(byName.get(tool.name) ?? []), tool]);
  const result: McpTool[] = [];
  for (const [name, named] of byName) {
    if (named.length === 1) result.push(named[0]!);
    else onCollision?.(name, named.map((tool) => tool.procedurePath));
  }
  return result;
}

/** The time that the face waits for the answer of the person, when the question gives no time. */
export const DEFAULT_ELICIT_TIMEOUT_MS = 300_000;

/** The parts of the request handler context of the SDK that a tool call uses. */
interface CallExtra {
  signal: AbortSignal;
  requestId: string | number;
  /** The session of the request: undefined for a face without sessions (stdio, an SDK transport) */
  sessionId?: string | undefined;
  _meta?: { progressToken?: string | number | undefined; readonly [key: string]: unknown } | undefined;
  sendNotification: (notification: ServerNotification) => Promise<void>;
  /** The HTTP request of the message: present only for a network transport (Streamable HTTP) */
  requestInfo?: { headers: Record<string, string | string[] | undefined>; url?: URL | undefined } | undefined;
  /** The auth info of the HTTP request: the Streamable HTTP face puts the admitted credentials of the request in it (CLI-2b) */
  authInfo?: { readonly extra?: Record<string, unknown> | undefined } | undefined;
  /** The task store of the request, when the server has tasks (CLI-35) */
  taskStore?: RequestTaskStore | undefined;
  /** The time to keep the task that the client asked for */
  taskRequestedTtl?: number | null | undefined;
}

/** The capability of a server with tasks (MCP 2025-11-25): list, cancel, and tools/call as a task. */
const TASKS_CAPABILITY = { list: {}, cancel: {}, requests: { tools: { call: {} } } };

/** The status message of a task for a progress: only counts, so no text of the work leaves its envelopes. */
function progressMessage(progress: number, total: number | undefined): string {
  return `${String(progress)}${total === undefined ? "" : ` of ${String(total)}`} done`;
}

/**
 * The credentials of a tool call. A call that came over the network has the bearer token, the
 * cookies, the headers and the query of its HTTP request (CLI-10). A call of the Streamable HTTP
 * endpoint of this package also has the connection of its socket (CLI-71). A call of an SDK
 * transport of the application has no connection, for example a call of the legacy SSE transport
 * of the SDK. The SDK gives only the headers and the URL of its request.
 *
 * A call of a local face without an HTTP request has the local marker (CLI-1). The local faces
 * are stdio, whose peer is the parent process, and a given SDK transport, for example the
 * in-memory transport. A session of Streamable HTTP is never local: without its HTTP request, the
 * call presents no credentials. The face admitted the HTTP request of a call one time (CLI-2b):
 * then the call has the admitted credentials of that request, and the server does not run its
 * checks again.
 */
function callCredentials(extra: CallExtra, localFace: boolean): Credentials {
  const fromRequest = requestCredentialsOf(extra.authInfo);
  if (fromRequest) return fromRequest;
  const info = extra.requestInfo;
  if (info) return requestCredentials({ headers: info.headers, url: info.url ? `${info.url.pathname}${info.url.search}` : undefined });
  return localFace ? LOCAL_CREDENTIALS : {};
}

/**
 * The narrowing key of a tool call (CLI-30): the key `procedure-narrowing` of the `_meta` of the
 * request, and the `Procedure-Narrowing` header of a call over Streamable HTTP. They are two
 * sources, and no source replaces the other. The server applies each one, so each one can only
 * make the capability of the call narrower.
 */
function callNarrowing(extra: CallExtra): unknown {
  const meta = extra._meta;
  const fromMeta = meta !== undefined && Object.hasOwn(meta, NARROWING_METADATA_KEY) ? meta[NARROWING_METADATA_KEY] : undefined;
  return addNarrowing(fromMeta, extra.requestInfo?.headers[NARROWING_METADATA_KEY]);
}

/**
 * Generate a unique request ID.
 */
/** The most text blocks of a stream result: the last items of a long stream. */
const MAX_STREAM_BLOCKS = 100;

/**
 * The `_meta` of the error of a stream: its code and its retryable flag, as the error line of
 * NDJSON and the error frame of WebSocket give them (CLI-48). A code that is not a string gives `HANDLER_ERROR`.
 * `items` is the count of the items before the error. An error without a flag gets the flag of its
 * code before the first item (CLI-68). After the first item, it gets false: a retry can send the
 * items again (CLI-58, `retryableOf`, `WIRE-PROTOCOL.md`, section "Error codes").
 */
function streamErrorMeta(error: unknown, items: number): { code: string; retryable: boolean } {
  const code = (error as { code?: unknown } | null | undefined)?.code;
  return { code: typeof code === "string" ? code : "HANDLER_ERROR", retryable: retryableOf(error, items) };
}

/** The text of a value: a string as it is, another value as JSON (pretty, or compact on one line). */
function toText(value: unknown, json: "pretty" | "compact" = "pretty"): string {
  if (typeof value === "string") return value;
  return (json === "compact" ? JSON.stringify(value) : JSON.stringify(value, null, 2)) ?? String(value);
}

/**
 * The structured content of a result: the result as JSON, when it is an object. JSON drops
 * what JSON cannot show (a function, `undefined`) and turns a class instance into its JSON form
 * (an ObjectId into its hex text), as the text block does.
 */
function structuredContentOf(value: unknown): Record<string, unknown> | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  try {
    const json = JSON.parse(JSON.stringify(value)) as unknown;
    return json !== null && typeof json === "object" && !Array.isArray(json) ? (json as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

function generateRequestId(): string {
  return `mcp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * The Streamable HTTP endpoint of each started transport. The stop parts of `mcpFace()` read it,
 * for the stop of the intake (CLI-72). The root of the package does not export it.
 */
const httpEndpoints = new WeakMap<McpServerTransport, McpHttpTransport>();

/** This function gives the Streamable HTTP endpoint of a started transport, else undefined. Only the face of this package uses it. */
export function httpEndpointOf(transport: McpServerTransport): McpHttpTransport | undefined {
  return httpEndpoints.get(transport);
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
  /** The handler of the calls: a server, or the handler of a face of a procedures host (CLI-7). */
  private server: RequestHandler;
  private registry: ProcedureRegistry;
  private options: Required<Pick<McpServerTransportOptions, "transport" | "serverInfo">> &
    McpServerTransportOptions;
  private running = false;
  private tools: Map<string, McpTool> = new Map();
  private registerListener: ((procedure: unknown) => void) | undefined;
  private unregisterListener: ((procedure: unknown) => void) | undefined;
  /** The Streamable HTTP transport and its URL, when the transport is "http" (R26) */
  private http: McpHttpTransport | undefined;
  /** The MCP servers of the sessions of the Streamable HTTP transport */
  private readonly sessionServers = new Set<McpServer>();
  private httpUrl: string | undefined;
  /** A pending list_changed notification: a burst of registrations sends one */
  private listChangedTimer: ReturnType<typeof setTimeout> | undefined;
  /** The limits of a stream that can run without an end, the time in milliseconds (R15) */
  private readonly streamLimits: { items: number; timeMs: number };
  /** This function removes the listener of the end of the stdio input */
  private stdinEnd: (() => void) | undefined;
  /** The store of the tasks (CLI-35), and true when this transport made it (then its stop closes it) */
  private readonly taskStore: McpTaskStore | undefined;
  private readonly ownsTaskStore: boolean;

  constructor(server: RequestHandler, options: McpServerTransportOptions = {}) {
    this.server = server;
    this.options = {
      transport: options.transport ?? "stdio",
      serverInfo: options.serverInfo ?? {
        name: "procedure-server",
        version: "1.0.0",
      },
      ...options,
    };
    this.streamLimits = {
      items: Math.max(1, options.streamLimits?.items ?? 100),
      timeMs: optionalMs(options.streamLimits?.time, "streamLimits.time") ?? 30_000,
    };
    const tasks = taskStoreOf(options.tasks);
    this.taskStore = tasks?.store;
    this.ownsTaskStore = tasks?.owned ?? false;
    // The registry of the server, when it has one (a ProcedureServer with an explicit registry):
    // before, the tools came from the global registry, also when the server served another one
    this.registry =
      options.registry ??
      (server as { getRegistry?: () => ProcedureRegistry }).getRegistry?.() ??
      PROCEDURE_REGISTRY;

    // Create MCP server with capabilities. The tool list follows the registry: when it changes,
    // the server sends notifications/tools/list_changed (deep dive roadmap 0.4)
    this.mcpServer = this.createSdkServer();

    // The registry listeners are attached in start() and removed in stop(): attaching them here
    // leaked them for a transport that never started or failed to start (BUGS-2026-07 L28)
  }

  /**
   * An MCP server of the SDK with the handlers of this transport. The stdio transport has one, and
   * each session of the Streamable HTTP transport has one of its own (roadmap R26).
   */
  private createSdkServer(): McpServer {
    const server = new McpServer(this.options.serverInfo, {
      capabilities: {
        tools: { listChanged: true },
        // MCP tasks (CLI-35): a long tool call can run as a task
        ...(this.taskStore ? { tasks: TASKS_CAPABILITY } : {}),
      },
      // The instructions of the server: the client gives them to the model (CLI-10)
      ...(this.options.instructions !== undefined ? { instructions: this.options.instructions } : {}),
      // The SDK answers tasks/get, tasks/result, tasks/list and tasks/cancel from the store
      ...(this.taskStore ? { taskStore: this.taskStore } : {}),
    });
    this.setupHandlers(server);
    return server;
  }

  /**
   * Setup MCP request handlers.
   */
  private setupHandlers(server: McpServer): void {
    // ListToolsRequestSchema -> List all procedures as tools
    server.setRequestHandler(ListToolsRequestSchema, async () => {
      this.log("ListToolsRequest received");

      // Without a task store, no tool runs as a task: the list does not say that it can
      const tools = Array.from(this.tools.values(), (tool) => {
        const definition = toToolDefinition(tool);
        if (!this.taskStore) delete definition.execution;
        return definition;
      });

      this.log(`Returning ${tools.length} tools`);

      return { tools };
    });

    // CallToolRequestSchema -> Execute procedure
    server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
      const { name, arguments: args, task } = request.params;

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

      // MCP tasks (CLI-35): a call as a task needs a tool that can run as one, and a call of a
      // tool that runs only as a task needs a task. Without a task store each call is a request.
      const support = this.taskStore ? tool.execution?.taskSupport : undefined;
      const callExtra = extra as CallExtra;
      if (task !== undefined) {
        if (!this.taskStore || (support !== "optional" && support !== "required")) {
          throw new McpError(ErrorCode.MethodNotFound, `The tool ${name} does not run as a task`);
        }
        return this.startTask(server, this.taskStore, tool, args, callExtra, { method: request.method, params: request.params });
      }
      if (support === "required") {
        throw new McpError(ErrorCode.MethodNotFound, `The tool ${name} runs only as a task: call it with a task`);
      }
      return this.callTool(server, tool, args, callExtra);
    });
  }

  /**
   * This method starts a tool call as a task (CLI-35). The client gets the task at once, and the
   * call goes on. A progress of the procedure becomes the status message of the task, and a
   * progress notification when the client sent a progress token. A cancel of the task aborts the
   * call. A task above the limit of the store fails at once with the reason. The call of a task
   * cannot ask the person: its request already has its answer. The store gets the principal of
   * the request before the call, for the fair share of its tasks (CLI-69).
   */
  private async startTask(
    server: McpServer,
    store: McpTaskStore,
    tool: McpTool,
    args: Record<string, unknown> | undefined,
    extra: CallExtra,
    request: Request,
  ): Promise<{ task: Task }> {
    const taskStore = extra.taskStore;
    if (!taskStore) throw new McpError(ErrorCode.InternalError, "The server has no task store for this request");
    const ttl = extra.taskRequestedTtl;
    const principal = await this.callPrincipal(server, extra);
    // The store directly, not the task store of the request: only the store takes the caller
    const task = await store.createTask(typeof ttl === "number" ? { ttl } : {}, extra.requestId, request, extra.sessionId, principal ? { principal } : {});
    const id = task.taskId;
    const finish = async (result: CallToolResult): Promise<void> => {
      // A cancelled task keeps its status: the store refuses a result after a cancel
      await taskStore.storeTaskResult(id, result.isError === true ? "failed" : "completed", result).catch(() => undefined);
    };
    const refused = store.refusal(id);
    if (refused !== undefined) {
      await finish({ content: [{ type: "text", text: refused }], isError: true });
      return { task: await taskStore.getTask(id) };
    }
    const token = extra._meta?.progressToken;
    const background: CallExtra = {
      ...extra,
      // The procedure reports its progress to the status of the task, also without a token of the client
      _meta: { ...extra._meta, progressToken: token ?? `task-${id}` },
      signal: store.signal(id),
      sendNotification: async (notification) => {
        if (notification.method === "notifications/progress") {
          const { progress, total } = notification.params;
          await taskStore.updateTaskStatus(id, "working", progressMessage(progress, total)).catch(() => undefined);
          if (token === undefined) return;
        }
        // The response of the request went: later messages go on the stream of the session
        await server.notification(notification).catch(() => undefined);
      },
    };
    // The slot of the task stays taken until the call settles, also after a cancel
    void this.callTool(server, tool, args, background, false)
      .then(finish)
      .catch(() => undefined)
      .finally(() => {
        store.settle(id);
        // After the stop of the intake, the GET stream of the session ends with the work of its last task (CLI-72)
        this.http?.endIdleStreams();
      });
    return { task };
  }

  /**
   * The principal of a call before the call (CLI-69): `identify` of the handler reads the
   * credentials of the call. A handler without `identify`, a refusal and an error give undefined.
   * Then the task store keys the task with its session.
   */
  private async callPrincipal(server: McpServer, extra: CallExtra): Promise<Principal | undefined> {
    const handler = this.server;
    if (!handler.identify) return undefined;
    try {
      return await handler.identify(callCredentials(extra, server === this.mcpServer));
    } catch {
      return undefined;
    }
  }

  /**
   * This method calls the procedure of a tool and gives the MCP result. `offerElicit` is false for
   * the call of a task: then the procedure gets no function to ask the person.
   */
  private async callTool(server: McpServer, tool: McpTool, args: Record<string, unknown> | undefined, extra: CallExtra, offerElicit = true): Promise<CallToolResult> {
    const name = tool.name;
    // The path of the procedure of the tool. The method is the core mapping of every host
    // (deep dive architecture review 3.3). A tool name of the toolName option does not decode,
    // and a sanitized segment does not decode to the segment of the procedure.
    const path = tool.procedurePath;

    // Build ServerRequest. The main SDK server is the face of stdio or of a given SDK transport:
    // a local face. Each other SDK server is a session of Streamable HTTP (CLI-1).
    const credentials = callCredentials(extra, server === this.mcpServer);
    const narrowing = callNarrowing(extra);
    const serverRequest = {
      id: generateRequestId(),
      method: pathToMethod(path),
      payload: args ?? {},
      metadata: {
        transport: "mcp" as const,
        mcpRequestId: generateRequestId(),
        // The narrowing key of the call: the server applies it (CLI-30)
        ...(narrowing !== undefined ? { [NARROWING_METADATA_KEY]: narrowing } : {}),
      },
      // A cancelled tool call (notifications/cancelled) aborts the procedure
      signal: extra.signal,
      // The face of the request, for the error policy of the server (CLI-80)
      transport: "mcp",
      // The credentials of a call over the network: the request hook (principalOf) and the
      // token check of the server apply to it (CLI-10). The local marker of a local face (CLI-1).
      credentials,
    };
    // What this face offers the procedure (CLI-12): the questions to the person, and the
    // progress for a caller that sent a progress token
    const elicit = offerElicit ? elicitWithPolicy(this.faceElicit(server, extra), this.options.elicitation) : undefined;
    const progress = this.callProgress(extra);
    const callRequest = {
      ...serverRequest,
      ...(elicit ? { elicit } : {}),
      ...(progress ? { progress: progress.report } : {}),
    };

    try {
      // Process through universal server
      const response = await this.server.handle(callRequest);

      this.log(`Tool ${name} completed: ${response.status.type}`);

      // Convert to MCP result
      if (response.status.type === "success" && response.stream) {
        const unbounded = response.metadata?.["stream"] === "unbounded";
        // The items are the progress of a stream, unless the procedure reports its own
        return await this.streamResult(response.stream, extra, unbounded, tool, () => progress?.used() === true);
      }
      if (response.status.type === "success") {
        const rendered = this.render(response.payload, tool);
        const hooked = this.options.content?.({ ...rendered, tool, value: response.payload });
        const result = hooked ?? rendered;
        return {
          content: result.content,
          // MCP structured output: the result as an object, for a tool with an output schema.
          // The text block stays, for clients that do not read structured content.
          ...(result.structuredContent ? { structuredContent: result.structuredContent } : {}),
        };
      } else {
        // The code, the retryable flag, the reason and the wait of the error travel on each face
        // (roadmap R25, CLI-48). The wait of a refusal of a limit is in milliseconds (CLI-40).
        const reason = typeof response.metadata?.["reason"] === "string" ? response.metadata["reason"] : undefined;
        const wait = response.metadata?.["retry-after"];
        const retryAfterMs = typeof wait === "number" && Number.isFinite(wait) && wait >= 0 ? wait : undefined;
        return {
          content: [
            {
              type: "text" as const,
              text: `${response.status.message ?? "Unknown error"}${reason ? ` (reason: ${reason})` : ""}`,
            },
          ],
          isError: true,
          _meta: {
            code: response.status.code,
            retryable: response.status.retryable === true,
            ...(reason ? { reason } : {}),
            ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
          },
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
    },
    unbounded = false,
    tool?: McpTool,
    ownProgress: () => boolean = () => false
  ): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean; _meta?: { code: string; retryable: boolean } }> {
    const progressToken = extra._meta?.progressToken;
    const blocks: Array<{ type: "text"; text: string }> = [];
    let count = 0;
    // A stream that can run without an end stops at the first limit (roadmap R15: before, a
    // docker.logs with follow ended only at the time limit of the tool call)
    const limits = this.streamLimits;
    const started = Date.now();
    let stoppedBy: string | undefined;
    try {
      for await (const item of stream) {
        count++;
        if (unbounded && (count > limits.items || Date.now() - started > limits.timeMs)) {
          stoppedBy = count > limits.items ? `${limits.items} items` : `${Math.round(limits.timeMs / 1000)} seconds`;
          count--;
          break;
        }
        // An item with untrusted fields gives its data, then its envelopes (CLI-10)
        const rendered = tool?.untrusted ? this.render(item, tool).content : undefined;
        const text = rendered ? rendered.map((block) => block.text).join("\n") : toText(item, this.options.json);
        blocks.push({ type: "text", text });
        if (blocks.length > MAX_STREAM_BLOCKS) blocks.shift();
        if (progressToken !== undefined && !ownProgress()) {
          const message = rendered ? rendered[0]!.text : text;
          await extra
            .sendNotification({
              method: "notifications/progress",
              params: { progressToken, progress: count, message: message.slice(0, 1000) },
            })
            .catch(() => undefined);
        }
      }
    } catch (error) {
      blocks.push({ type: "text", text: error instanceof Error ? error.message : String(error) });
      // The code and the retryable flag of the end travel on each face: a stream that the
      // shutdown cuts ends with UNAVAILABLE (CLI-48). Before the first item, an error without a
      // flag gets the flag of its code (CLI-68).
      return { content: blocks, isError: true, _meta: streamErrorMeta(error, count) };
    }
    if (count > MAX_STREAM_BLOCKS) {
      blocks.unshift({ type: "text", text: `(${count} items: the first ${count - MAX_STREAM_BLOCKS} are not shown)` });
    }
    if (stoppedBy) {
      blocks.push({ type: "text", text: `(The stream can run without an end, so the tool stopped it after ${stoppedBy}.)` });
    }
    if (count === 0) blocks.push({ type: "text", text: "(no items)" });
    return { content: blocks };
  }

  /**
   * The content of a successful value. A tool with untrusted fields (`metadata.untrusted`) gives
   * the data as JSON in the first block. The second block has the texts of those fields in
   * envelopes. In the structured content, each untrusted field is the text of its envelopes.
   */
  private render(value: unknown, tool: McpTool): McpToolContent {
    const fields = tool.untrusted ?? [];
    if (fields.length === 0 || value === null || typeof value !== "object" || Array.isArray(value)) {
      const structured = tool.outputSchema ? structuredContentOf(value) : undefined;
      return { content: [{ type: "text", text: toText(value, this.options.json) }], ...(structured ? { structuredContent: structured } : {}) };
    }
    const data: Record<string, unknown> = { ...(value as Record<string, unknown>) };
    const envelopes = createUntrustedEnvelopes(this.options.untrusted ?? {});
    const wrap = this.options.untrusted?.wrap;
    const texts: Record<string, string> = {};
    const blocks: string[] = [];
    for (const field of fields) {
      if (!(field in data)) continue;
      const items = untrustedTextsOf(data[field]);
      delete data[field];
      const text = wrap ? wrap(items, { tool: tool.name, field }) : envelopes.text(items);
      texts[field] = text;
      if (text !== "") blocks.push(text);
    }
    const content: McpTextBlock[] = [{ type: "text", text: toText(data, this.options.json) }];
    if (blocks.length > 0) content.push({ type: "text", text: blocks.join("\n") });
    const structured = tool.outputSchema ? structuredContentOf(data) : undefined;
    return { content, ...(structured ? { structuredContent: { ...structured, ...texts } } : {}) };
  }

  /**
   * The function of this face that asks the person, or undefined when the client cannot ask
   * (it declares no elicitation). Each question goes with the tool call (`relatedRequestId`), so
   * the Streamable HTTP transport sends it on the stream of the call.
   */
  private faceElicit(server: McpServer, extra: CallExtra): Elicit | undefined {
    const capability = server.getClientCapabilities()?.elicitation as { form?: unknown; url?: unknown } | undefined;
    if (!capability) return undefined;
    const modes: ElicitMode[] = [];
    if (capability.form) modes.push("form");
    if (capability.url) modes.push("url");
    if (modes.length === 0) return undefined;
    return createElicit(modes, async (request: ElicitRequest, options: ElicitOptions): Promise<ElicitResult> => {
      const timeout = optionalMs(options.timeout, "timeout") ?? DEFAULT_ELICIT_TIMEOUT_MS;
      const signal = options.signal && options.signal !== extra.signal ? AbortSignal.any([extra.signal, options.signal]) : extra.signal;
      const params =
        request.mode === "url"
          ? { mode: "url" as const, message: request.message, url: request.url, elicitationId: request.id ?? globalThis.crypto.randomUUID() }
          : {
              mode: "form" as const,
              message: request.message,
              requestedSchema: {
                type: "object" as const,
                properties: request.fields,
                ...(request.required ? { required: [...request.required] } : {}),
              },
            };
      // The SDK types do not agree with exactOptionalPropertyTypes and readonly arrays
      const reply = await server.elicitInput(params as never, { relatedRequestId: extra.requestId, signal, timeout });
      return { action: reply.action, ...(reply.content ? { content: reply.content } : {}), by: "person" };
    });
  }

  /**
   * The progress function of a call, when the caller sent a progress token. `used()` tells if
   * the procedure reported its own progress.
   */
  private callProgress(extra: CallExtra): { report: ReportProgress; used: () => boolean } | undefined {
    const progressToken = extra._meta?.progressToken;
    if (progressToken === undefined) return undefined;
    let used = false;
    return {
      used: () => used,
      report: async (update) => {
        used = true;
        await extra
          .sendNotification({
            method: "notifications/progress",
            params: {
              progressToken,
              progress: update.progress,
              ...(update.total !== undefined ? { total: update.total } : {}),
              ...(update.message !== undefined ? { message: update.message.slice(0, 1000) } : {}),
            },
          })
          .catch(() => undefined);
      },
    };
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
    const before = this.toolSignature();

    this.tools.clear();
    // A tool name names one procedure: the transport leaves out each name of two procedures (CLI-28)
    const reportCollision = (name: string, paths: readonly (readonly string[])[]): void => {
      // MUST be stderr: stdout carries the protocol of stdio
      console.error(`[mcp] The procedures ${paths.map((path) => path.join(".")).join(", ")} have the tool name "${name}": the transport leaves them out`);
    };
    for (const tool of distinctTools(namedTools(mcpTools, this.options.toolName), reportCollision)) {
      this.tools.set(tool.name, tool);
    }

    this.log(`Refreshed tools: ${this.tools.size} available`);
    if (this.running && this.toolSignature() !== before) this.scheduleListChanged();
  }

  /** The tool names and descriptions: a change of this text is a change of the tool list. */
  private toolSignature(): string {
    const entries = Array.from(this.tools.values(), (tool) => [tool.name, tool.description ?? ""]);
    return JSON.stringify(entries.sort((a, b) => (a[0]! < b[0]! ? -1 : a[0]! > b[0]! ? 1 : 0)));
  }

  /** Send one notifications/tools/list_changed for a burst of registry events. */
  private scheduleListChanged(): void {
    if (this.listChangedTimer) return;
    this.listChangedTimer = setTimeout(() => {
      this.listChangedTimer = undefined;
      if (!this.running) return;
      for (const sessionServer of this.sessionServers) sessionServer.sendToolListChanged().catch(() => undefined);
      this.mcpServer.sendToolListChanged().catch((error: unknown) => {
        this.log(`list_changed failed: ${error instanceof Error ? error.message : String(error)}`);
      });
    }, 0);
    this.listChangedTimer.unref?.();
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
      let transport: SdkTransport | undefined;
      if (this.options.sdkTransport) {
        transport = this.options.sdkTransport;
        this.log("Using the given transport");
      } else if (this.options.transport === "stdio") {
        const stdio = this.options.stdio;
        const stdin = stdio?.stdin ?? process.stdin;
        transport = createStdioTransport(stdin, stdio?.stdout);
        // The client closed the input: the host stops (CLI-10). The SDK does not watch the end.
        if (stdio?.onEnd) {
          const onEnd = stdio.onEnd;
          const listener = (): void => {
            this.log("The input of stdio ended");
            onEnd();
          };
          stdin.once("end", listener);
          this.stdinEnd = () => stdin.off("end", listener);
        }
        this.log("Using stdio transport");
      } else if (this.options.transport === "http") {
        // Streamable HTTP (roadmap R26): an MCP server of its own for each session
        // The face trusts cookies only as the server reads them (CSRF)
        const handler: Partial<RequestHandler> = this.server;
        const ambientCredentials = handler.ambientCredentials;
        const httpOptions = { ...this.options.httpOptions, ...(ambientCredentials ? { ambientCredentials } : {}) };
        const taskStore = this.taskStore;
        // The one admission of each HTTP request is the admission of the server (CLI-2b): its
        // request hook, its token check and its authenticate function
        const admission = handler.admission?.bind(handler);
        this.http = createHttpTransport(
          httpOptions,
          async (sessionTransport) => {
            const sessionServer = this.createSdkServer();
            this.sessionServers.add(sessionServer);
            sessionServer.onclose = () => {
              this.sessionServers.delete(sessionServer);
              // The close of a session cancels its tasks: their work stops (CLI-35)
              if (taskStore && sessionTransport.sessionId) void taskStore.cancelSession(sessionTransport.sessionId);
            };
            await sessionServer.connect(sessionTransport as unknown as SdkTransport);
          },
          {
            // The session limit keeps each session with a task in progress open
            ...(taskStore ? { busySessions: () => taskStore.busySessions() } : {}),
            ...(admission ? { admission } : {}),
          },
        );
        transport = undefined;
      } else if (this.options.transport === "sse") {
        transport = createSseTransport(this.options.sseOptions);
        this.log(`Using SSE transport on ${this.options.sseOptions?.path ?? "/mcp/sse"}`);
      } else {
        throw new Error(`Unknown MCP transport: ${this.options.transport}`);
      }

      // Connect MCP server to transport
      if (transport) await this.mcpServer.connect(transport);
      if (this.http) {
        // The endpoint has no listener (CLI-11): the owner of a listener mounts handleHttp
        httpEndpoints.set(this, this.http);
        this.httpUrl = this.http.path;
        this.log(`Using Streamable HTTP at the path ${this.httpUrl}`);
      }
    } catch (error) {
      this.removeRegistryListeners();
      this.stdinEnd?.();
      this.stdinEnd = undefined;
      httpEndpoints.delete(this);
      await this.http?.close().catch(() => undefined);
      this.http = undefined;
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
    this.stdinEnd?.();
    this.stdinEnd = undefined;
    if (this.listChangedTimer) {
      clearTimeout(this.listChangedTimer);
      this.listChangedTimer = undefined;
    }

    await this.mcpServer.close();
    httpEndpoints.delete(this);
    await this.http?.close();
    for (const sessionServer of this.sessionServers) await sessionServer.close().catch(() => undefined);
    this.sessionServers.clear();
    // A store of this transport stops with it: its tasks are cancelled (CLI-35)
    if (this.ownsTaskStore) await this.taskStore?.close();
    this.http = undefined;
    this.httpUrl = undefined;
    this.running = false;
    this.log("MCP server stopped");
  }

  /**
   * This method answers a request of the Streamable HTTP endpoint on a listener that another part
   * owns (CLI-7, CLI-11). It gives false for another path, and before `start()`.
   */
  handleHttp(req: IncomingMessage, res: ServerResponse): boolean {
    return this.http?.handle(req, res) ?? false;
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
      ...(this.httpUrl ? { url: this.httpUrl } : {}),
      ...(this.http ? { sessions: this.http.sessions } : {}),
    };
  }

  /** The store of the tasks (CLI-35), or undefined when the transport has no tasks. */
  getTaskStore(): McpTaskStore | undefined {
    return this.taskStore;
  }

  /**
   * Get the list of available tools.
   */
  getTools(): McpTool[] {
    return Array.from(this.tools.values());
  }
}
