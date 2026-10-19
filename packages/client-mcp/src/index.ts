/**
 * MCP Client Package
 *
 * MCP server transport for the procedure system.
 * Maps PROCEDURE_REGISTRY to MCP tools for use with Claude Desktop
 * and other MCP-compatible clients.
 *
 * @packageDocumentation
 */

export * from "./module.js";

// Transport
export { McpServerTransport } from "./transport/mcp-transport.js";
export { createStdioTransport } from "./transport/stdio.js";
export { createSseTransport } from "./transport/sse.js";

// The host factory (CLI-10): one MCP host for each server of procedures
export { createMcpHost, mcpExposeRule, redirectConsoleToStderr } from "./host.js";
export type { McpHost, McpHostOptions, McpHostFaces, McpStdioFace, McpHostServerOptions, McpHostParts, McpHostState } from "./host.js";
export { DEFAULT_ELICIT_TIMEOUT_MS } from "./transport/mcp-transport.js";

// MCP tasks (CLI-35): a long tool call runs as a task, with a limit of tasks that run at one time
export { McpTaskStore, MCP_TASK_LIMITS } from "./tasks.js";
export type { McpTaskInfo, McpTaskStoreOptions, McpTasksOptions } from "./tasks.js";

// The checks of a request to the Streamable HTTP face (CLI-35), for the face and a listener of a host
export { guardMcpRequest, sameToken, readMcpBody, assertLoopbackBind, McpBodyError, MCP_HTTP_LIMITS } from "./transport/guard.js";
export type { McpRequestGuardOptions, McpGuardResult } from "./transport/guard.js";
export type { McpHttpSessionOptions } from "./transport/http.js";

// The MCP face of a procedures host (CLI-7): Streamable HTTP on a listener of the host
export { mcpFace } from "./face.js";
export type { McpFace, McpFaceContext, McpFaceOptions } from "./face.js";

// The envelopes of the text from outside the host (CLI-10)
export { createUntrustedEnvelopes, defaultUntrustedNotice, DEFAULT_UNTRUSTED_TAG } from "./untrusted.js";
export type { UntrustedContentOptions, UntrustedWrapContext, UntrustedEnvelopes } from "./untrusted.js";

// Types
export type {
  McpServerTransportOptions,
  McpServerTransportState,
  SseTransportOptions,
  HttpTransportOptions,
  StdioTransportOptions,
  McpTextBlock,
  McpToolContent,
  McpToolContentInput,
  McpToolContentHook,
} from "./types.js";

// Procedures
export { mcpServeProcedure, prepareServe, DEFAULT_SERVE_BUNDLE } from "./procedures/mcp/serve.js";
export type { ServeOptions, ServeSetup } from "./procedures/mcp/serve.js";
export { exposeRule, mergeSurfaces, importBundles, resolveBundleRegister } from "./surface.js";
export type { ToolSurface, BundleSurfaceModule } from "./surface.js";
export { mcpListToolsProcedure } from "./procedures/mcp/list-tools.js";

// Re-export core MCP types for convenience
export type {
  McpTool,
  McpToolDefinition,
  McpToolExecution,
  McpTaskSupport,
  McpToolFilter,
  McpServerInfo,
  McpTransportType,
} from "@procedures/mcp";

// Re-export mapping utilities
export {
  proceduresToMcpTools,
  procedureToMcpTool,
  taskSupportOf,
  encodePath,
  decodePath,
} from "@procedures/mcp";
