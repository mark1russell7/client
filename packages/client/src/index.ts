/**
 * Universal Client Library
 *
 * Protocol-agnostic RPC client with middleware composition
 * and transport adapters.
 *
 * This entry point is for Node. It exports the browser-safe entry point
 * ("@mark1russell7/client/browser") and the server transports, which use `http` and `ws`.
 */

export * from "./browser.js";

// ============================================================================
// Server Transports (Node only)
// ============================================================================
export {
  HttpServerTransport,
  defaultServerUrlStrategy,
  rpcServerUrlStrategy,
} from "./server/index.js";
export type {
  HttpServerTransportOptions,
  HttpUrlStrategy,
} from "./server/index.js";
export { WebSocketServerTransport } from "./server/index.js";
export type {
  WebSocketServerTransportOptions,
  WebSocketAuthHandler,
  WebSocketConnectionHandler,
  WebSocketMessage,
} from "./server/index.js";
