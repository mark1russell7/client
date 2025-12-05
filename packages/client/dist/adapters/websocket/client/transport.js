/**
 * WebSocket Client Transport Implementation
 *
 * Provides persistent bidirectional RPC over WebSocket.
 * Supports automatic reconnection, heartbeats, and streaming.
 */
import { WebSocketState } from "./types";
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
export class WebSocketTransport {
    name = "websocket";
    ws = null;
    state = WebSocketState.DISCONNECTED;
    options;
    pendingRequests = new Map();
    reconnectAttempts = 0;
    reconnectTimer = undefined;
    heartbeatTimer = undefined;
    heartbeatTimeout = undefined;
    constructor(options) {
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
            heartbeat: {
                enabled: options.heartbeat?.enabled ?? true,
                interval: options.heartbeat?.interval ?? 30000,
                timeout: options.heartbeat?.timeout ?? 5000,
            },
            onConnect: options.onConnect,
            onDisconnect: options.onDisconnect,
            onReconnecting: options.onReconnecting,
            onError: options.onError,
        };
        // Auto-connect
        this.connect();
    }
    /**
     * Connect to WebSocket server.
     */
    connect() {
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
                console.log(`[${this.name}] Connected to ${this.options.url}`);
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
                    const message = JSON.parse(event.data);
                    this.handleMessage(message);
                }
                catch (error) {
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
        }
        catch (error) {
            console.error(`[${this.name}] Failed to create WebSocket:`, error);
            this.handleClose("Failed to create WebSocket");
        }
    }
    /**
     * Handle WebSocket close.
     */
    handleClose(reason) {
        this.state = WebSocketState.DISCONNECTED;
        this.stopHeartbeat();
        console.log(`[${this.name}] Disconnected${reason ? `: ${reason}` : ""}`);
        if (this.options.onDisconnect) {
            this.options.onDisconnect(reason);
        }
        // Reject all pending requests
        for (const pending of this.pendingRequests.values()) {
            pending.reject(new Error("WebSocket connection closed"));
            if (pending.timeout) {
                clearTimeout(pending.timeout);
            }
        }
        this.pendingRequests.clear();
        // Attempt reconnection
        const reconnect = this.options.reconnect;
        if (reconnect.enabled && this.reconnectAttempts < reconnect.maxAttempts) {
            this.scheduleReconnect();
        }
    }
    /**
     * Schedule reconnection with exponential backoff.
     */
    scheduleReconnect() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
        }
        this.reconnectAttempts++;
        this.state = WebSocketState.RECONNECTING;
        const reconnect = this.options.reconnect;
        const delay = Math.min(reconnect.initialDelay * Math.pow(reconnect.backoffMultiplier, this.reconnectAttempts - 1), reconnect.maxDelay);
        console.log(`[${this.name}] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
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
    startHeartbeat() {
        this.stopHeartbeat();
        this.heartbeatTimer = setInterval(() => {
            if (this.state === WebSocketState.CONNECTED && this.ws) {
                // Send ping
                const ping = {
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
    stopHeartbeat() {
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
    handleMessage(message) {
        console.log(`[${this.name}] Received message:`, JSON.stringify(message, null, 2));
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
            const pong = {
                id: message.id,
                type: "pong",
            };
            this.ws?.send(JSON.stringify(pong));
            return;
        }
        // Handle response
        const pending = this.pendingRequests.get(message.id);
        if (!pending) {
            console.warn(`[${this.name}] Received response for unknown request: ${message.id}`);
            return;
        }
        // Clear timeout
        if (pending.timeout) {
            clearTimeout(pending.timeout);
        }
        // Remove from pending if not streaming
        if (!message.stream || message.stream.done) {
            this.pendingRequests.delete(message.id);
        }
        // Convert to ResponseItem
        let status;
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
        }
        else if (message.status && message.status.type === "success") {
            console.log(`[${this.name}] Success response`);
            status = {
                type: "success",
                code: Number(message.status.code),
            };
        }
        else if (message.type === "error") {
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
        }
        else {
            console.log(`[${this.name}] Default success response`);
            status = {
                type: "success",
                code: 200,
            };
        }
        const responseItem = {
            id: message.id,
            status,
            payload: message.payload,
            metadata: message.metadata || {},
        };
        console.log(`[${this.name}] Created ResponseItem:`, JSON.stringify(responseItem, null, 2));
        // Resolve with async iterable
        pending.resolve(this.createAsyncIterable([responseItem]));
    }
    /**
     * Create async iterable from array.
     */
    async *createAsyncIterable(items) {
        for (const item of items) {
            yield item;
        }
    }
    /**
     * Send RPC request over WebSocket.
     */
    async *send(message) {
        console.log(`[${this.name}] Sending request:`, JSON.stringify(message, null, 2));
        // Wait for connection
        await this.waitForConnection();
        // Create WebSocket message
        const wsMessage = {
            id: message.id,
            type: "request",
            method: message.method,
            payload: message.payload,
            metadata: message.metadata,
        };
        console.log(`[${this.name}] WebSocket message:`, JSON.stringify(wsMessage, null, 2));
        // Send message
        return yield* await new Promise((resolve, reject) => {
            // Store pending request
            const timeout = setTimeout(() => {
                this.pendingRequests.delete(message.id);
                console.error(`[${this.name}] Request timeout for ${message.id}`);
                reject(new Error("Request timeout"));
            }, this.options.connectionTimeout);
            this.pendingRequests.set(message.id, {
                resolve: resolve,
                reject,
                timeout,
            });
            // Send request
            try {
                this.ws.send(JSON.stringify(wsMessage));
                console.log(`[${this.name}] Request sent successfully`);
            }
            catch (error) {
                this.pendingRequests.delete(message.id);
                clearTimeout(timeout);
                console.error(`[${this.name}] Send error:`, error);
                reject(error);
            }
        });
    }
    /**
     * Wait for WebSocket connection.
     */
    async waitForConnection() {
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
                }
                else if (this.state === WebSocketState.DISCONNECTED) {
                    clearTimeout(timeout);
                    reject(new Error("WebSocket disconnected"));
                }
                else {
                    setTimeout(checkConnection, 100);
                }
            };
            checkConnection();
        });
    }
    /**
     * Close WebSocket connection.
     */
    async close() {
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
    getState() {
        return this.state;
    }
    /**
     * Check if connected.
     */
    isConnected() {
        return this.state === WebSocketState.CONNECTED;
    }
}
//# sourceMappingURL=transport.js.map