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
export { Server } from "./server.js";
export { ProcedureServer, createProcedureServer } from "./procedure-server.js";
export { HandlerNotFoundError, ServerError, } from "./types.js";
export { HttpServerTransport, defaultServerUrlStrategy, rpcServerUrlStrategy, } from "../adapters/http/server/index.js";
export { WebSocketServerTransport } from "../adapters/websocket/server/index.js";
//# sourceMappingURL=index.js.map