/**
 * Universal Server
 *
 * Protocol-agnostic RPC server architecture.
 * Mirrors the universal client for symmetrical design.
 *
 * Features:
 * - Protocol-agnostic (HTTP, WebSocket, gRPC via adapters)
 * - Unified RPC format internally
 * - Middleware support
 * - Handler registry with pattern matching
 * - Graceful shutdown
 *
 * The server transports have the entry `@procedures/client/node` (CLI-6). This entry still
 * exports them as deprecated aliases. The next MINOR removes the aliases.
 *
 * @example
 * ```typescript
 * import { Server } from "@procedures/client/server";
 * import { HttpServerTransport } from "@procedures/client/node";
 *
 * const server = new Server();
 *
 * // Register handlers
 * server.register(
 *   { service: "users", operation: "get" },
 *   async (req) => ({
 *     id: req.id,
 *     status: { type: "success", code: 200 },
 *     payload: { id: req.payload.id, name: "John" },
 *     metadata: {}
 *   })
 * );
 *
 * // Add HTTP transport
 * const httpTransport = new HttpServerTransport(server, { port: 3000 });
 * await httpTransport.start();
 * ```
 */

import { HttpServerTransport as NodeHttpServerTransport } from "../adapters/http/server/transport.js";
import type {
  HttpServerTransportOptions as NodeHttpServerTransportOptions,
  HttpUrlStrategy as NodeHttpUrlStrategy,
} from "../adapters/http/server/types.js";
import { WebSocketServerTransport as NodeWebSocketServerTransport } from "../adapters/websocket/server/transport.js";
import type {
  WebSocketServerTransportOptions as NodeWebSocketServerTransportOptions,
  WebSocketAuthHandler as NodeWebSocketAuthHandler,
  WebSocketConnectionHandler as NodeWebSocketConnectionHandler,
  WebSocketMessage as NodeWebSocketMessage,
} from "../adapters/websocket/server/types.js";

export { Server } from "./server.js";
export type { ServerOptions } from "./server.js";

export { ProcedureServer, createProcedureServer, STREAM_METADATA_KEY, isUnboundedStream } from "./procedure-server.js";
export type { ProcedureServerOptions, RegisterProcedureOptions, StorageConfig, StopOptions, StopParts, StorageHandle, UseStorageOptions } from "./procedure-server.js";
export { pathToMethod, methodToPath, methodName } from "./method.js";
export {
  HandlerNotFoundError,
  ServerError,
  type ServerRequest,
  type ServerResponse,
  type RequestHandler,
  type Credentials,
  type Principal,
  type PrincipalOf,
  type RequestIdentity,
  type AmbientCredentials,
  type ServerDebugReport,
  type ServerHandler,
  type ServerMiddleware,
  type ServerContext,
  type ServerRunner,
  type ServerTransport,
} from "./types.js";

export { defaultServerUrlStrategy, rpcServerUrlStrategy } from "../adapters/http/server/strategies.js";

// ============================================================================
// The server transports: deprecated here (CLI-6 step 1)
// ============================================================================
// Their entry is `@procedures/client/node`. This entry and the root (which re-exports these
// names from this module) give them through deprecated aliases until the next MINOR, so an
// editor marks each old import. Each alias is the same class or type as the export of ./node.

/**
 * The HTTP server transport of Express, a shim over `procedureHandler`.
 *
 * @deprecated Import it from `@procedures/client/node`. The root and `@procedures/client/server` stop exporting it in the next MINOR (CLI-6).
 */
export const HttpServerTransport: typeof NodeHttpServerTransport = NodeHttpServerTransport;
/**
 * The HTTP server transport of Express, a shim over `procedureHandler`.
 *
 * @deprecated Import it from `@procedures/client/node`. The root and `@procedures/client/server` stop exporting it in the next MINOR (CLI-6).
 */
export type HttpServerTransport = NodeHttpServerTransport;

/**
 * The options of `HttpServerTransport`.
 *
 * @deprecated Import it from `@procedures/client/node`. The root and `@procedures/client/server` stop exporting it in the next MINOR (CLI-6).
 */
export type HttpServerTransportOptions = NodeHttpServerTransportOptions;

/**
 * The URL strategy of `HttpServerTransport`: it gives the method of an Express request.
 *
 * @deprecated Import it from `@procedures/client/node`. The root and `@procedures/client/server` stop exporting it in the next MINOR (CLI-6).
 */
export type HttpUrlStrategy = NodeHttpUrlStrategy;

/**
 * The WebSocket server transport, on the `ws` package.
 *
 * @deprecated Import it from `@procedures/client/node`. The root and `@procedures/client/server` stop exporting it in the next MINOR (CLI-6).
 */
export const WebSocketServerTransport: typeof NodeWebSocketServerTransport = NodeWebSocketServerTransport;
/**
 * The WebSocket server transport, on the `ws` package.
 *
 * @deprecated Import it from `@procedures/client/node`. The root and `@procedures/client/server` stop exporting it in the next MINOR (CLI-6).
 */
export type WebSocketServerTransport = NodeWebSocketServerTransport;

/**
 * The options of `WebSocketServerTransport`.
 *
 * @deprecated Import it from `@procedures/client/node`. The root and `@procedures/client/server` stop exporting it in the next MINOR (CLI-6).
 */
export type WebSocketServerTransportOptions = NodeWebSocketServerTransportOptions;

/**
 * The authentication handler of `WebSocketServerTransport`, for each upgrade request.
 *
 * @deprecated Import it from `@procedures/client/node`. The root and `@procedures/client/server` stop exporting it in the next MINOR (CLI-6).
 */
export type WebSocketAuthHandler = NodeWebSocketAuthHandler;

/**
 * The connection handler of `WebSocketServerTransport`, for each new connection.
 *
 * @deprecated Import it from `@procedures/client/node`. The root and `@procedures/client/server` stop exporting it in the next MINOR (CLI-6).
 */
export type WebSocketConnectionHandler = NodeWebSocketConnectionHandler;

/**
 * The RPC message of `WebSocketServerTransport`.
 *
 * @deprecated Import it from `@procedures/client/node`. The root and `@procedures/client/server` stop exporting it in the next MINOR (CLI-6).
 */
export type WebSocketMessage<TReq = unknown> = NodeWebSocketMessage<TReq>;
