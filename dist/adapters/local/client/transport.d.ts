/**
 * Local Transport Implementation
 *
 * In-process RPC with handler registry - no network calls!
 */
import type { Transport, Message, ResponseItem, Method } from "../../../client/types.js";
import type { Handler, LocalTransportOptions } from "./types.js";
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
export declare class LocalTransport implements Transport {
    readonly name = "local";
    private readonly handlers;
    private readonly throwOnMissing;
    constructor(options?: LocalTransportOptions);
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
    register<TReq, TRes>(method: Method, handler: Handler<TReq, TRes>): void;
    /**
     * Unregister a handler for a method.
     *
     * @param method - Method to unregister
     */
    unregister(method: Method): void;
    /**
     * Check if a handler is registered.
     *
     * @param method - Method to check
     * @returns true if handler exists
     */
    has(method: Method): boolean;
    /**
     * Execute local handler and yield single response.
     */
    send<TReq, TRes>(message: Message<TReq>): AsyncIterable<ResponseItem<TRes>>;
    /**
     * Close transport (no-op for local).
     */
    close(): Promise<void>;
    /**
     * Clear all handlers.
     */
    clear(): void;
    /**
     * Get all registered method keys.
     */
    getMethods(): string[];
}
//# sourceMappingURL=transport.d.ts.map