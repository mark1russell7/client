/**
 * Local Transport Implementation
 *
 * In-process RPC with handler registry - no network calls!
 */

import type { Transport, Message, ResponseItem, Method } from "../../../client/types";
import type { Handler, LocalTransportOptions } from "./types";
import { methodKey } from "./types";

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
export class LocalTransport implements Transport {
  readonly name = "local";

  private readonly handlers = new Map<string, Handler>();
  private readonly throwOnMissing: boolean;

  constructor(options: LocalTransportOptions = {}) {
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
  register<TReq, TRes>(method: Method, handler: Handler<TReq, TRes>): void {
    this.handlers.set(methodKey(method), handler as Handler);
  }

  /**
   * Unregister a handler for a method.
   *
   * @param method - Method to unregister
   */
  unregister(method: Method): void {
    this.handlers.delete(methodKey(method));
  }

  /**
   * Check if a handler is registered.
   *
   * @param method - Method to check
   * @returns true if handler exists
   */
  has(method: Method): boolean {
    return this.handlers.has(methodKey(method));
  }

  /**
   * Execute local handler and yield single response.
   */
  async *send<TReq, TRes>(message: Message<TReq>): AsyncIterable<ResponseItem<TRes>> {
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
          payload: null as TRes,
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
        payload: null as TRes,
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
        payload: result as TRes,
        metadata: {},
      };
    } catch (error) {
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
        payload: null as TRes,
        metadata: {},
      };
    }
  }

  /**
   * Close transport (no-op for local).
   */
  async close(): Promise<void> {
    // No resources to clean up
  }

  /**
   * Clear all handlers.
   */
  clear(): void {
    this.handlers.clear();
  }

  /**
   * Get all registered method keys.
   */
  getMethods(): string[] {
    return Array.from(this.handlers.keys());
  }
}
