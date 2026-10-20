/**
 * Universal Client Library
 *
 * Protocol-agnostic RPC client with middleware composition
 * and transport adapters.
 *
 * This entry point exports the browser-safe entry point ("@procedures/client/browser"), the URL
 * strategies of the server and the browser checks of the server. It imports no Node built-in, no
 * `ws` and no `express`, and its declarations name none of them (CLI-6, CLI-61). Thus a browser
 * bundle can import it too. The server transports and the procedure faces of Node have the entry
 * "@procedures/client/node".
 *
 * The `WebSocketTransport` of this entry uses the global `WebSocket`. The Node entry
 * "@procedures/client/node" has a `WebSocketTransport` whose sockets are of the `ws` package: a
 * drop ends them at once.
 */

export * from "./browser.js";

// ============================================================================
// The URL strategies and the browser checks of the server (browser-safe)
// ============================================================================
export { defaultServerUrlStrategy, rpcServerUrlStrategy } from "./adapters/http/server/strategies.js";
export type { RoutedRequest } from "./adapters/http/server/strategies.js";
export { checkBrowserRequest, hasAmbientCredentials, isLoopbackHost, isLoopbackAddress, hostNameOf } from "./server/browser-guard.js";
export type { BrowserGuardOptions, GuardedHeaders, GuardedRequest, GuardResult } from "./server/browser-guard.js";
