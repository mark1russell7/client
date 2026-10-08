/**
 * Local Transport Implementation
 *
 * In-process RPC with handler registry - no network calls!
 */

import type { Transport, Message, ResponseItem, Method } from "../../../client/types.js";
import type { Handler, LocalTransportOptions } from "./types.js";
import { methodKey } from "./types.js";
import type { ProcedureRegistry } from "../../../procedures/registry.js";
import type { AnyProcedure } from "../../../procedures/types.js";
import { InvocationError, invokeProcedure, isAsyncIterable } from "../../../procedures/invoke.js";

function successItem<TRes>(id: string, payload: unknown): ResponseItem<TRes> {
  return { id, status: { type: "success", code: 200 }, payload: payload as TRes, metadata: {} };
}

function errorItem<TRes>(id: string, code: string, message: string): ResponseItem<TRes> {
  // Local handlers do not benefit from retries
  return { id, status: { type: "error", code, message, retryable: false }, payload: null as TRes, metadata: {} };
}

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
  private readonly registry: ProcedureRegistry | undefined;

  constructor(options: LocalTransportOptions = {}) {
    this.throwOnMissing = options.throwOnMissing !== false;
    this.registry = options.registry;

    // Register pre-configured handlers. A key without a version ("users.get") gets the
    // empty version, as methodKey() makes it: before, such a key was never found.
    if (options.handlers) {
      for (const [key, handler] of Object.entries(options.handlers)) {
        this.handlers.set(key.includes(":") ? key : `:${key}`, handler);
      }
    }
  }

  /**
   * Register a handler for a method.
   *
   * @param method - Method to handle
   * @param handler - Handler function (sync, async, or an async generator for a stream)
   */
  register<TReq, TRes>(method: Method, handler: Handler<TReq, TRes>): void {
    this.handlers.set(methodKey(method), handler as Handler);
  }

  /**
   * Unregister a handler.
   *
   * @param method - Method to unregister
   */
  unregister(method: Method): void {
    this.handlers.delete(methodKey(method));
  }

  /**
   * Check if handler is registered.
   *
   * @param method - Method to check
   */
  has(method: Method): boolean {
    return this.handlers.has(methodKey(method)) || this.procedureFor(method) !== undefined;
  }

  /** The procedure of the registry at the path of a method. */
  private procedureFor(method: Method): AnyProcedure | undefined {
    if (!this.registry) return undefined;
    return this.registry.get([...method.service.split("."), ...method.operation.split(".")]);
  }

  /**
   * Send message to local handler.
   *
   * A handler (or a procedure) that gives an async iterable gives a stream: one response item
   * for each value. An error ends the stream with an error item.
   *
   * @param message - Message to send
   * @returns Async iterable of response items
   */
  async *send<TReq, TRes>(message: Message<TReq>): AsyncIterable<ResponseItem<TRes>> {
    const key = methodKey(message.method);
    const handler = this.handlers.get(key);
    const procedure = handler ? undefined : this.procedureFor(message.method);

    // Handler not found
    if (!handler && !procedure) {
      if (this.throwOnMissing) {
        yield errorItem<TRes>(message.id, "NOT_FOUND", `No handler registered for ${key}`);
        return;
      }

      // Silently return empty response
      return;
    }

    // Check if cancelled
    if (message.signal?.aborted) {
      yield errorItem<TRes>(message.id, "ABORTED", "Request was aborted");
      return;
    }

    try {
      let values: AsyncIterable<unknown> | undefined;
      let value: unknown;
      if (procedure) {
        const output = await invokeProcedure(procedure, message.payload, {
          registry: this.registry,
          metadata: message.metadata,
          signal: message.signal,
        });
        if (output.kind === "stream") values = output.items;
        else value = output.value;
      } else {
        // Execute handler (may be sync, async or an async generator)
        const result = await handler!(message.payload, message);
        if (isAsyncIterable(result)) values = result;
        else value = result;
      }

      if (values === undefined) {
        yield successItem<TRes>(message.id, value);
        return;
      }
      for await (const item of values) {
        if (message.signal?.aborted) {
          yield errorItem<TRes>(message.id, "ABORTED", "Request was aborted");
          return;
        }
        yield successItem<TRes>(message.id, item);
      }
    } catch (error) {
      // The handler threw, or the invocation failed (its code: VALIDATION_ERROR, ABORTED and so on)
      const code = error instanceof InvocationError ? error.code : "HANDLER_ERROR";
      yield errorItem<TRes>(message.id, code, error instanceof Error ? error.message : "Unknown error");
    }
  }

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
