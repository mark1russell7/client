/**
 * WebSocket Client Transport Implementation
 *
 * Provides persistent bidirectional RPC over WebSocket.
 * Supports automatic reconnection, heartbeats, and streaming.
 */

import type { Transport, Message, ResponseItem } from "../../../client/types.js";
import type { WebSocketTransportOptions, WebSocketMessage, ServerRequestHandler, EventHandler } from "./types.js";
import { WebSocketState } from "./types.js";

/**
 * Pending request waiting for response.
 */
/**
 * A queue with one writer (the message handler) and one reader (`for await`).
 */
class ItemQueue<T> {
  private items: T[] = [];
  private ended = false;
  private failure: { error: Error } | undefined;
  private wake: (() => void) | undefined;

  push(item: T): void {
    this.items.push(item);
    this.notify();
  }

  end(): void {
    this.ended = true;
    this.notify();
  }

  fail(error: Error): void {
    this.failure = { error };
    this.notify();
  }

  private notify(): void {
    const wake = this.wake;
    this.wake = undefined;
    wake?.();
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<T, void, undefined> {
    for (;;) {
      if (this.items.length > 0) {
        yield this.items.shift()!;
        continue;
      }
      if (this.failure) throw this.failure.error;
      if (this.ended) return;
      await new Promise<void>((resolve) => {
        this.wake = resolve;
      });
    }
  }
}

interface PendingRequest {
  /** The response items of the request, in order */
  queue: ItemQueue<ResponseItem<unknown>>;
  /** The request timeout: it runs until the first frame arrives */
  timeout?: ReturnType<typeof setTimeout> | undefined;
}

/**
 * WebSocket client transport.
 *
 * Persistent connection for real-time RPC communication.
 *
 * @example
 * ```typescript
 * const transport = new WebSocketTransport({
 *   url: "ws://localhost:3000/ws",
 *   reconnect: {
 *     enabled: true,
 *     maxAttempts: 10
 *   }
 * });
 *
 * const client = new Client({ transport });
 * ```
 */
function abortedItem<TRes>(id: string): ResponseItem<TRes> {
  return {
    id,
    status: { type: "error", code: "ABORTED", message: "Request was aborted", retryable: false },
    payload: null as TRes,
    metadata: {},
  };
}

export class WebSocketTransport implements Transport {
  readonly name = "websocket";

  private ws: WebSocket | null = null;
  private state: WebSocketState = WebSocketState.DISCONNECTED;
  private options: {
    url: string;
    reconnect: {
      enabled: boolean;
      maxAttempts: number;
      initialDelay: number;
      maxDelay: number;
      backoffMultiplier: number;
    };
    connectionTimeout: number;
    requestTimeout: number;
    heartbeat: {
      enabled: boolean;
      interval: number;
      timeout: number;
    };
    onConnect: (() => void) | undefined;
    onDisconnect: ((reason?: string) => void) | undefined;
    onReconnecting: ((attempt: number) => void) | undefined;
    onError: ((error: Error) => void) | undefined;
    onServerRequest: ServerRequestHandler | undefined;
    onEvent: EventHandler | undefined;
  };
  private pendingRequests: Map<string, PendingRequest> = new Map();
  /** Set by close(): the connection is being closed on purpose, so it must not reconnect */
  private closing = false;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined = undefined;
  private heartbeatTimer: ReturnType<typeof setTimeout> | undefined = undefined;
  private heartbeatTimeout: ReturnType<typeof setTimeout> | undefined = undefined;

  constructor(options: WebSocketTransportOptions) {
    this.options = {
      url: options.url,
      reconnect: {
        enabled: options.reconnect?.enabled ?? true,
        maxAttempts: options.reconnect?.maxAttempts ?? Infinity,
        initialDelay: options.reconnect?.initialDelay ?? 1000,
        maxDelay: options.reconnect?.maxDelay ?? 30000,
        backoffMultiplier: options.reconnect?.backoffMultiplier ?? 1.5,
      },
      connectionTimeout: options.connectionTimeout ?? 10000,
      requestTimeout: options.requestTimeout ?? 30000,
      heartbeat: {
        enabled: options.heartbeat?.enabled ?? true,
        interval: options.heartbeat?.interval ?? 30000,
        timeout: options.heartbeat?.timeout ?? 5000,
      },
      onConnect: options.onConnect,
      onDisconnect: options.onDisconnect,
      onReconnecting: options.onReconnecting,
      onError: options.onError,
      onServerRequest: options.onServerRequest,
      onEvent: options.onEvent,
    };

    // Auto-connect
    this.connect();
  }

  /**
   * Connect to WebSocket server.
   */
  private connect(): void {
    if (this.closing) {
      return;
    }
    if (this.state === WebSocketState.CONNECTING || this.state === WebSocketState.CONNECTED) {
      return;
    }

    this.state = WebSocketState.CONNECTING;

    try {
      this.ws = new WebSocket(this.options.url);

      // Connection opened
      this.ws.onopen = () => {
        this.state = WebSocketState.CONNECTED;
        this.reconnectAttempts = 0;
        console.error(`[${this.name}] Connected to ${this.options.url}`);

        if (this.options.onConnect) {
          this.options.onConnect();
        }

        // Start heartbeat
        if (this.options.heartbeat.enabled) {
          this.startHeartbeat();
        }
      };

      // Message received
      this.ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          this.handleMessage(message);
        } catch (error) {
          console.error(`[${this.name}] Failed to parse message:`, error);
        }
      };

      // Connection closed
      this.ws.onclose = (event) => {
        this.handleClose(event.reason);
      };

      // Connection error
      this.ws.onerror = (event) => {
        console.error(`[${this.name}] WebSocket error:`, event);
        const error = new Error("WebSocket connection error");
        if (this.options.onError) {
          this.options.onError(error);
        }
      };
    } catch (error) {
      console.error(`[${this.name}] Failed to create WebSocket:`, error);
      this.handleClose("Failed to create WebSocket");
    }
  }

  /**
   * Handle WebSocket close.
   */
  private handleClose(reason?: string): void {
    this.state = WebSocketState.DISCONNECTED;
    this.stopHeartbeat();

    console.error(`[${this.name}] Disconnected${reason ? `: ${reason}` : ""}`);

    if (this.options.onDisconnect) {
      this.options.onDisconnect(reason);
    }

    // Fail all pending requests (a stream ends with the error too)
    for (const pending of this.pendingRequests.values()) {
      pending.queue.fail(new Error("WebSocket connection closed"));
      if (pending.timeout) {
        clearTimeout(pending.timeout);
      }
    }
    this.pendingRequests.clear();

    // An intentional close() must not reconnect (BUGS-2026-07 H6)
    if (this.closing) {
      return;
    }

    // Attempt reconnection
    const reconnect = this.options.reconnect;
    if (reconnect.enabled && this.reconnectAttempts < reconnect.maxAttempts) {
      this.scheduleReconnect();
    }
  }

  /**
   * Schedule reconnection with exponential backoff.
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    this.reconnectAttempts++;
    this.state = WebSocketState.RECONNECTING;

    const reconnect = this.options.reconnect;
    const delay = Math.min(
      reconnect.initialDelay * Math.pow(reconnect.backoffMultiplier, this.reconnectAttempts - 1),
      reconnect.maxDelay
    );

    console.error(`[${this.name}] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    if (this.options.onReconnecting) {
      this.options.onReconnecting(this.reconnectAttempts);
    }

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  /**
   * Start heartbeat to keep connection alive.
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();

    this.heartbeatTimer = setInterval(() => {
      if (this.state === WebSocketState.CONNECTED && this.ws) {
        // Send ping
        const ping: WebSocketMessage = {
          id: `ping-${Date.now()}`,
          type: "ping",
        };
        this.ws.send(JSON.stringify(ping));

        // Set timeout for pong
        this.heartbeatTimeout = setTimeout(() => {
          console.warn(`[${this.name}] Heartbeat timeout - closing connection`);
          this.ws?.close();
        }, this.options.heartbeat.timeout);
      }
    }, this.options.heartbeat.interval);
  }

  /**
   * Stop heartbeat.
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
    if (this.heartbeatTimeout) {
      clearTimeout(this.heartbeatTimeout);
      this.heartbeatTimeout = undefined;
    }
  }

  /**
   * Handle incoming message.
   */
  private handleMessage(message: WebSocketMessage): void {

    // Handle pong (heartbeat response)
    if (message.type === "pong") {
      if (this.heartbeatTimeout) {
        clearTimeout(this.heartbeatTimeout);
        this.heartbeatTimeout = undefined;
      }
      return;
    }

    // Handle ping (server heartbeat)
    if (message.type === "ping") {
      const pong: WebSocketMessage = {
        id: message.id,
        type: "pong",
      };
      this.ws?.send(JSON.stringify(pong));
      return;
    }

    // Handle server-request (server-initiated procedure call)
    if (message.type === "server-request") {
      this.handleServerRequest(message);
      return;
    }

    // Handle event (subscription event from server)
    if (message.type === "event") {
      if (this.options.onEvent && message.topic && message.subscriptionId) {
        try {
          this.options.onEvent(message.topic, message.data, message.subscriptionId);
        } catch (error) {
          console.error(`[${this.name}] Event handler error:`, error);
        }
      }
      return;
    }

    // Handle response
    const pending = this.pendingRequests.get(message.id);
    if (!pending) {
      console.warn(`[${this.name}] Received response for unknown request: ${message.id}`);
      return;
    }

    // The first frame arrived: the request timeout ends. A stream can stay open longer.
    if (pending.timeout) {
      clearTimeout(pending.timeout);
      pending.timeout = undefined;
    }

    // A stream frame: one item, or the end of the stream (BUGS-2026-07 H5: before, the
    // transport resolved on the first frame and dropped the others)
    if (message.type === "stream") {
      if (message.stream?.done) {
        this.pendingRequests.delete(message.id);
        pending.queue.end();
        return;
      }
      pending.queue.push({
        id: message.id,
        status: { type: "success", code: 200 },
        payload: message.payload,
        metadata: message.metadata || {},
      });
      return;
    }

    // A response or an error: one item, then the end
    this.pendingRequests.delete(message.id);

    // Convert to ResponseItem
    let status: ResponseItem<any>["status"];
    if (message.status && message.status.type === "error") {
      console.error(`[${this.name}] Error response:`, message.status);
      // Ensure message is a string
      const errorMessage = typeof message.status.message === 'string'
        ? message.status.message
        : message.status.message
        ? JSON.stringify(message.status.message)
        : "Unknown error";
      status = {
        type: "error",
        code: String(message.status.code),
        message: errorMessage,
        retryable: message.status.retryable || false,
      };
    } else if (message.status && message.status.type === "success") {
      status = {
        type: "success",
        code: Number(message.status.code),
      };
    } else if (message.type === "error") {
      console.error(`[${this.name}] Error message:`, message.error);
      // Ensure message is a string
      const errorMessage = typeof message.error?.message === 'string'
        ? message.error.message
        : message.error?.message
        ? JSON.stringify(message.error.message)
        : "Unknown error";
      status = {
        type: "error",
        code: String(message.error?.code || "UNKNOWN_ERROR"),
        message: errorMessage,
        retryable: message.error?.retryable || false,
      };
    } else {
      status = {
        type: "success",
        code: 200,
      };
    }

    const responseItem: ResponseItem<any> = {
      id: message.id,
      status,
      payload: message.payload,
      metadata: message.metadata || {},
    };


    pending.queue.push(responseItem);
    pending.queue.end();
  }

  /**
   * Send a request and yield its response items as they arrive: one item for a request/response
   * call, each item of a stream. When the reader stops early or the message's signal aborts, the
   * transport sends a "cancel" message, and the server stops the stream.
   *
   * @param message - Message to send
   * @returns Async iterable of response items
   */
  async *send<TReq, TRes>(message: Message<TReq>): AsyncIterable<ResponseItem<TRes>> {
    if (message.signal?.aborted) {
      yield abortedItem<TRes>(message.id);
      return;
    }

    // Wait for connection
    await this.waitForConnection();

    // Create WebSocket message
    const wsMessage: WebSocketMessage<TReq> = {
      id: message.id,
      type: "request",
      method: message.method,
      payload: message.payload,
      metadata: message.metadata,
    };

    const queue = new ItemQueue<ResponseItem<unknown>>();
    const pending: PendingRequest = { queue };
    pending.timeout = setTimeout(() => {
      if (this.pendingRequests.get(message.id) !== pending) return;
      this.pendingRequests.delete(message.id);
      this.sendCancel(message.id);
      console.error(`[${this.name}] Request timeout for ${message.id}`);
      queue.fail(new Error("Request timeout"));
    }, this.options.requestTimeout);
    this.pendingRequests.set(message.id, pending);

    const onAbort = (): void => {
      if (this.pendingRequests.get(message.id) !== pending) return;
      this.pendingRequests.delete(message.id);
      if (pending.timeout) clearTimeout(pending.timeout);
      this.sendCancel(message.id);
      queue.push(abortedItem(message.id));
      queue.end();
    };
    message.signal?.addEventListener("abort", onAbort, { once: true });

    try {
      try {
        this.ws!.send(JSON.stringify(wsMessage));
      } catch (error) {
        console.error(`[${this.name}] Send error:`, error);
        throw error;
      }
      for await (const item of queue) {
        yield item as ResponseItem<TRes>;
      }
    } finally {
      message.signal?.removeEventListener("abort", onAbort);
      if (pending.timeout) clearTimeout(pending.timeout);
      if (this.pendingRequests.get(message.id) === pending) {
        // The reader stopped before the end: the server stops the stream
        this.pendingRequests.delete(message.id);
        this.sendCancel(message.id);
      }
    }
  }

  /** This function tells the server to stop a request (a stream that nobody reads). */
  private sendCancel(id: string): void {
    if (this.ws && this.state === WebSocketState.CONNECTED) {
      const cancel: WebSocketMessage = { id, type: "cancel" };
      this.ws.send(JSON.stringify(cancel));
    }
  }

  /**
   * Wait for WebSocket connection.
   */
  private async waitForConnection(): Promise<void> {
    if (this.state === WebSocketState.CONNECTED) {
      return;
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Connection timeout"));
      }, this.options.connectionTimeout);

      const checkConnection = () => {
        if (this.state === WebSocketState.CONNECTED) {
          clearTimeout(timeout);
          resolve();
        } else if (this.state === WebSocketState.DISCONNECTED) {
          clearTimeout(timeout);
          reject(new Error("WebSocket disconnected"));
        } else {
          setTimeout(checkConnection, 100);
        }
      };

      checkConnection();
    });
  }

  /**
   * Handle server-initiated procedure call.
   */
  private async handleServerRequest(message: WebSocketMessage): Promise<void> {
    const { id, path, input } = message;

    if (!path || !Array.isArray(path)) {
      console.error(`[${this.name}] Invalid server-request: missing path`);
      return;
    }

    if (!this.options.onServerRequest) {
      // No handler registered - send error response
      const response: WebSocketMessage = {
        id,
        type: "server-response",
        error: {
          code: "NO_HANDLER",
          message: "No server request handler registered",
          retryable: false,
        },
      };
      this.ws?.send(JSON.stringify(response));
      return;
    }

    try {
      const result = await this.options.onServerRequest(path, input);
      const response: WebSocketMessage = {
        id,
        type: "server-response",
        result,
      };
      this.ws?.send(JSON.stringify(response));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const response: WebSocketMessage = {
        id,
        type: "server-response",
        error: {
          code: "HANDLER_ERROR",
          message: errorMessage,
          retryable: false,
        },
      };
      this.ws?.send(JSON.stringify(response));
    }
  }

  /**
   * Close WebSocket connection.
   */
  async close(): Promise<void> {
    this.closing = true;
    this.state = WebSocketState.DISCONNECTING;
    this.stopHeartbeat();

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.state = WebSocketState.DISCONNECTED;
  }

  /**
   * Get current connection state.
   */
  getState(): WebSocketState {
    return this.state;
  }

  /**
   * Check if connected.
   */
  isConnected(): boolean {
    return this.state === WebSocketState.CONNECTED;
  }
}
