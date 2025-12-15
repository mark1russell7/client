/**
 * Local Transport Implementation
 *
 * In-process RPC with handler registry - no network calls!
 */
import { methodKey } from "./types.js";
/**
 * Local Transport - executes handlers in-process without network calls.
 *
 * Features:
 * - No network - instant execution
 * - Sync and async handler support
 * - Handler registry (register/unregister)
 * - Same Transport interface as HTTP/gRPC
 * - Perfect for testing!
 *
 * @example
 * ```typescript
 * const transport = new LocalTransport();
 *
 * transport.register(
 *   { service: "users", operation: "get" },
 *   async ({ id }) => database.users.findById(id)
 * );
 *
 * const client = new Client({ transport });
 * const user = await client.call(
 *   { service: "users", operation: "get" },
 *   { id: 123 }
 * );
 * ```
 */
export class LocalTransport {
    name = "local";
    handlers = new Map();
    throwOnMissing;
    constructor(options = {}) {
        this.throwOnMissing = options.throwOnMissing !== false;
        // Register pre-configured handlers
        if (options.handlers) {
            for (const [key, handler] of Object.entries(options.handlers)) {
                this.handlers.set(key, handler);
            }
        }
    }
    /**
     * Register a handler for a method.
     *
     * @param method - Method to handle
     * @param handler - Handler function
     *
     * @example
     * ```typescript
     * transport.register(
     *   { service: "users", operation: "get" },
     *   async ({ id }) => ({ id, name: "John" })
     * );
     * ```
     */
    register(method, handler) {
        this.handlers.set(methodKey(method), handler);
    }
    /**
     * Unregister a handler for a method.
     *
     * @param method - Method to unregister
     */
    unregister(method) {
        this.handlers.delete(methodKey(method));
    }
    /**
     * Check if a handler is registered.
     *
     * @param method - Method to check
     * @returns true if handler exists
     */
    has(method) {
        return this.handlers.has(methodKey(method));
    }
    /**
     * Execute local handler and yield single response.
     */
    async *send(message) {
        const key = methodKey(message.method);
        const handler = this.handlers.get(key);
        // Handler not found
        if (!handler) {
            if (this.throwOnMissing) {
                yield {
                    id: message.id,
                    status: {
                        type: "error",
                        code: "NOT_FOUND",
                        message: `No handler registered for ${key}`,
                        retryable: false,
                    },
                    payload: null,
                    metadata: {},
                };
                return;
            }
            // Silently return empty response
            return;
        }
        // Check if cancelled
        if (message.signal?.aborted) {
            yield {
                id: message.id,
                status: {
                    type: "error",
                    code: "ABORTED",
                    message: "Request was aborted",
                    retryable: false,
                },
                payload: null,
                metadata: {},
            };
            return;
        }
        try {
            // Execute handler (may be sync or async)
            const result = await handler(message.payload, message);
            // Yield success response
            yield {
                id: message.id,
                status: {
                    type: "success",
                    code: 200,
                },
                payload: result,
                metadata: {},
            };
        }
        catch (error) {
            // Handler threw error
            const errorMessage = error instanceof Error ? error.message : "Unknown error";
            yield {
                id: message.id,
                status: {
                    type: "error",
                    code: "HANDLER_ERROR",
                    message: errorMessage,
                    retryable: false, // Local handlers don't typically benefit from retries
                },
                payload: null,
                metadata: {},
            };
        }
    }
    /**
     * Close transport (no-op for local).
     */
    async close() {
        // No resources to clean up
    }
    /**
     * Clear all handlers.
     */
    clear() {
        this.handlers.clear();
    }
    /**
     * Get all registered method keys.
     */
    getMethods() {
        return Array.from(this.handlers.keys());
    }
}
//# sourceMappingURL=transport.js.map