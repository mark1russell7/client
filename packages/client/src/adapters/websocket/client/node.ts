/**
 * The WebSocket client transport for Node (finding of roadmap R36).
 *
 * This class is the `WebSocketTransport` of the browser entry with one other default: its sockets
 * are of the `WebSocket` class of the `ws` package. A drop by the heartbeat or by the time limit
 * of the handshake then ends the socket at once with `terminate()`. The global `WebSocket` of Node
 * has only `close()`, which waits for the answer of the peer. With a dead peer, that socket stays
 * open until the kernel stops it: 924.6 seconds in the harness cells of R36.
 *
 * Only the Node entry `@procedures/client/node` exports this class. The browser entry does not
 * import `ws`.
 */

import { WebSocket as NodeWebSocket } from "ws";
import { WebSocketTransport as PortableWebSocketTransport } from "./transport.js";
import type { WebSocketTransportOptions } from "./types.js";

/**
 * The WebSocket client transport with the `WebSocket` class of the `ws` package as the default
 * class of its sockets. The option `webSocket` gives another class.
 *
 * @example
 * ```typescript
 * import { Client } from "@procedures/client";
 * import { WebSocketTransport } from "@procedures/client/node";
 *
 * const client = new Client({ transport: new WebSocketTransport({ url: "ws://localhost:3000/ws" }) });
 * ```
 */
export class WebSocketTransport extends PortableWebSocketTransport {
  constructor(options: WebSocketTransportOptions) {
    super({ ...options, webSocket: options.webSocket ?? NodeWebSocket });
  }
}
