/**
 * The Node entry of `@procedures/client`: `@procedures/client/node`.
 *
 * This entry exports the client transports with the defaults of Node. Its `WebSocketTransport`
 * uses the `WebSocket` class of the `ws` package, so a drop ends a socket at once with
 * `terminate()` (finding of roadmap R36). The other entries keep the global `WebSocket`: a browser
 * bundle imports `@procedures/client/browser`, and that entry does not import `ws`.
 *
 * This entry also exports `writeNdjsonStream`: the writer of an NDJSON stream response of wire
 * protocol v1, for a `ServerResponse` of `node:http`. `HttpServerTransport` uses it, so a server
 * without Express writes the same bytes.
 *
 * The procedure faces of Node, without a framework (CLI-3): `procedureHandler(server, options)`
 * gives a request handler `(req, res) => boolean`, and `upgradeHandler(server, options)` gives an
 * upgrade handler `(req, socket, head) => boolean`. Each one takes the requests of its path and
 * gives `false` for the others, so the routes of the application share the listener.
 *
 * The option `addressing` of `procedureHandler` gives the method and the payload of a request
 * (CLI-31). `urlAddressing()` is the default, and `bodyPathAddressing()` reads the path from the
 * body of a single endpoint.
 *
 * The server transports are in this entry too (CLI-6): `HttpServerTransport`, the Express shim
 * over `procedureHandler`, and `WebSocketServerTransport`. The root and `./server` also export
 * them, but these exports are deprecated. The next MINOR removes them, so the root imports no
 * `http` and no `ws`.
 */

export { WebSocketTransport } from "./adapters/websocket/client/node.js";
export type { WebSocketTransportOptions, WebSocketClass } from "./adapters/websocket/client/types.js";
export { writeNdjsonStream } from "./adapters/http/server/ndjson.js";
export type { WriteNdjsonStreamOptions, NdjsonError } from "./adapters/http/server/ndjson.js";
export { procedureHandler } from "./adapters/http/server/handler.js";
// The JSON body of a request, read to a limit: the procedure handler and the MCP face read it so (CLI-35)
export { readJsonBody, BodyError } from "./adapters/http/server/body.js";
export type { ProcedureHandlerOptions, NodeProcedureHandler, NodeUrlStrategy, UrlRequest } from "./adapters/http/server/handler.js";
export type { CorsOptions, CredentialedCorsOptions } from "./adapters/http/server/cors.js";
// The credentialed CORS of the trusted origins of a host, for a route of the app (CLI-49)
export { credentialedCors } from "./adapters/http/server/cors.js";
export type { RoutedRequest } from "./adapters/http/server/strategies.js";
export { defaultServerUrlStrategy, rpcServerUrlStrategy } from "./adapters/http/server/strategies.js";
// The addressing of a request: the URL (the default), or the path in the body of a single endpoint (CLI-31)
export { urlAddressing, bodyPathAddressing } from "./adapters/http/server/addressing.js";
export type { Addressing, CallAddress, UrlAddressingOptions, BodyPathAddressingOptions } from "./adapters/http/server/addressing.js";
// The server transports (CLI-6): the root and ./server export them only until the next MINOR
export { HttpServerTransport } from "./adapters/http/server/transport.js";
export type { HttpServerTransportOptions, HttpUrlStrategy } from "./adapters/http/server/types.js";
export { upgradeHandler } from "./adapters/websocket/server/upgrade.js";
export type { UpgradeHandlerOptions, NodeUpgradeHandler } from "./adapters/websocket/server/upgrade.js";
export { WebSocketServerTransport } from "./adapters/websocket/server/transport.js";
export type {
  WebSocketServerTransportOptions,
  WebSocketAuthHandler,
  WebSocketConnectionHandler,
  WebSocketMessage,
  TrackedConnection,
  ConnectionEventHandler,
} from "./adapters/websocket/server/types.js";
