/**
 * Universal Client Library
 *
 * Protocol-agnostic RPC client with middleware composition
 * and transport adapters.
 *
 * This entry point is for Node. It exports the browser-safe entry point
 * ("@procedures/client/browser"). It also exports the server transports, which use `http` and
 * `ws`, but these exports are deprecated (CLI-6 step 1). Their entry is "@procedures/client/node".
 * The next MINOR removes them from this entry, so the root imports no `http` and no `ws`.
 *
 * The `WebSocketTransport` of this entry uses the global `WebSocket`, because some applications
 * bundle this entry for a browser. The Node entry "@procedures/client/node" has a
 * `WebSocketTransport` whose sockets are of the `ws` package: a drop ends them at once.
 */

export * from "./browser.js";

// ============================================================================
// Server Transports (Node only)
// ============================================================================
export { defaultServerUrlStrategy, rpcServerUrlStrategy } from "./adapters/http/server/strategies.js";
// Deprecated (CLI-6 step 1): import these from "@procedures/client/node". The next MINOR removes
// them from the root. ./server/index.ts holds the deprecated aliases, so an editor marks each old
// import, and each alias is the same class or type as the export of ./node.
export { HttpServerTransport } from "./server/index.js";
export type {
  HttpServerTransportOptions,
  HttpUrlStrategy,
} from "./server/index.js";
export { WebSocketServerTransport } from "./server/index.js";
export { checkBrowserRequest, hasAmbientCredentials, isLoopbackHost, isLoopbackAddress, hostNameOf } from "./server/browser-guard.js";
export type { BrowserGuardOptions, GuardedRequest, GuardResult } from "./server/browser-guard.js";
// Deprecated (CLI-6 step 1): import these from "@procedures/client/node"
export type {
  WebSocketServerTransportOptions,
  WebSocketAuthHandler,
  WebSocketConnectionHandler,
  WebSocketMessage,
} from "./server/index.js";
