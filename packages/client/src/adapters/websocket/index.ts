/**
 * WebSocket Adapter - Complete WebSocket transport layer
 */

// Client
export { WebSocketTransport, WebSocketState } from "./client/index.js";
export type {
  WebSocketTransportOptions,
  WebSocketMessage as ClientWebSocketMessage,
  ServerRequestMessage,
  ServerRequestHandler,
  EventHandler,
} from "./client/index.js";

// Server
export { WebSocketServerTransport } from "./server/index.js";
export type {
  WebSocketServerTransportOptions,
  WebSocketAuthHandler,
  WebSocketConnectionHandler,
  WebSocketMessage as ServerWebSocketMessage,
  TrackedConnection,
  ConnectionEventHandler,
} from "./server/index.js";
