/**
 * WebSocket Client Transport Adapter
 *
 * Public API for WebSocket client adapter.
 */

// Types
export type {
  WebSocketTransportOptions,
  WebSocketMessage,
  ServerRequestMessage,
  ServerRequestHandler,
  EventHandler,
} from "./types.js";
export { WebSocketState } from "./types.js";

// Transport
export { WebSocketTransport } from "./transport.js";