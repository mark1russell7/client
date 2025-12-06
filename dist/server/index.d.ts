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
 * @example
 * ```typescript
 * import { Server, HttpServerTransport } from "@common/server";
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
export { Server } from "./server";
export type { ServerOptions } from "./server";
export { HandlerNotFoundError, ServerError, type ServerRequest, type ServerResponse, type ServerHandler, type ServerMiddleware, type ServerContext, type ServerRunner, type ServerTransport, } from "./types";
export { HttpServerTransport, defaultServerUrlStrategy, rpcServerUrlStrategy, } from "../adapters/http/server";
export type { HttpServerTransportOptions, HttpUrlStrategy, } from "../adapters/http/server";
export { WebSocketServerTransport } from "../adapters/websocket/server";
export type { WebSocketServerTransportOptions, WebSocketAuthHandler, WebSocketConnectionHandler, WebSocketMessage, } from "../adapters/websocket/server";
//# sourceMappingURL=index.d.ts.map