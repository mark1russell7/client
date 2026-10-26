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
 * The server transports have the entry `@procedures/client/node` (CLI-6). This entry imports no
 * Node built-in, no `ws` and no `express`, and its declarations name none of them (CLI-61).
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

export { Server } from "./server.js";
export type { ServerOptions } from "./server.js";
export type { ServerErrorPolicy, ExposedError, ErrorCall } from "./error-policy.js";

export { ProcedureServer, createProcedureServer, STREAM_METADATA_KEY, isUnboundedStream } from "./procedure-server.js";
export type { ProcedureServerOptions, RegisterProcedureOptions, StorageConfig, StopOptions, StopParts, StorageHandle, UseStorageOptions } from "./procedure-server.js";
export { pathToMethod, methodToPath, methodName } from "./method.js";
// The escape of a segment with a dot, for a method name, a key and a topic (roadmap CLI-75)
export { encodeSegment, decodeSegment, segmentsToTopic, topicToSegments } from "../procedures/segments.js";
export {
  HandlerNotFoundError,
  ServerError,
  type ServerRequest,
  type ServerResponse,
  type RequestHandler,
  type Credentials,
  type RequestConnection,
  type Principal,
  type PrincipalOf,
  type RequestIdentity,
  type Admission,
  type AmbientCredentials,
  type ServerDebugReport,
  type ServerHandler,
  type ServerMiddleware,
  type ServerContext,
  type ServerRunner,
  type ServerTransport,
} from "./types.js";

export { defaultServerUrlStrategy, rpcServerUrlStrategy } from "../adapters/http/server/strategies.js";
export type { RoutedRequest } from "../adapters/http/server/strategies.js";
