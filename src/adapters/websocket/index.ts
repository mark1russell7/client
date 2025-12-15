/**
 * WebSocket Adapter - Complete WebSocket transport layer
 */

// Client
export { WebSocketTransport, WebSocketState } from "./client/index.js";
export type { WebSocketTransportOptions, WebSocketMessage as ClientWebSocketMessage } from "./client/index.js";

// Server
export { WebSocketServerTransport } from "./server/index.js";
export type {
  WebSocketServerTransportOptions,
  WebSocketAuthHandler,
  WebSocketConnectionHandler,
  WebSocketMessage as ServerWebSocketMessage,
} from "./server/index.js";
