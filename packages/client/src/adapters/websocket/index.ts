/**
 * WebSocket Adapter - Complete WebSocket transport layer
 */

// Client
export { WebSocketTransport, WebSocketState } from "./client";
export type { WebSocketTransportOptions, WebSocketMessage as ClientWebSocketMessage } from "./client";

// Server
export { WebSocketServerTransport } from "./server";
export type {
  WebSocketServerTransportOptions,
  WebSocketAuthHandler,
  WebSocketConnectionHandler,
  WebSocketMessage as ServerWebSocketMessage,
} from "./server";
