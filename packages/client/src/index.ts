/**
 * Universal Client Library
 *
 * Protocol-agnostic RPC client with middleware composition
 * and transport adapters.
 *
 * This entry point is for Node. It exports the browser-safe entry point
 * ("@procedures/client/browser") and the server transports, which use `http` and `ws`.
 *
 * The `WebSocketTransport` of this entry uses the global `WebSocket`, because some applications
 * bundle this entry for a browser. The Node entry "@procedures/client/node" has a
 * `WebSocketTransport` whose sockets are of the `ws` package: a drop ends them at once.
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
export { checkBrowserRequest, isLoopbackHost, isLoopbackAddress, hostNameOf } from "./server/browser-guard.js";
export type { BrowserGuardOptions, GuardedRequest, GuardResult } from "./server/browser-guard.js";
export type {
  WebSocketServerTransportOptions,
  WebSocketAuthHandler,
  WebSocketConnectionHandler,
  WebSocketMessage,
} from "./server/index.js";
