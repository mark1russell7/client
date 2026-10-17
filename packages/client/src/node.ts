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
 */

export { WebSocketTransport } from "./adapters/websocket/client/node.js";
export type { WebSocketTransportOptions, WebSocketClass } from "./adapters/websocket/client/types.js";
export { writeNdjsonStream } from "./adapters/http/server/ndjson.js";
export type { WriteNdjsonStreamOptions, NdjsonError } from "./adapters/http/server/ndjson.js";
