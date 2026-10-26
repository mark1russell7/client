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
import { InvocationError, invokeProcedure, isAsyncIterable, type Interceptor } from "../../../procedures/invoke.js";
import { TIMEOUT_METADATA_KEY } from "../../../client/deadline.js";
import { narrowCapability } from "../../../procedures/capability.js";
import { pathToKey, type Capability, type ClearanceOrder } from "../../../procedures/types.js";
import { methodToPath } from "../../../server/method.js";
import { errorCodeOf } from "../../../protocol.js";
import { VERSION_CONFLICTS_METADATA_KEY, versionConflictsOf } from "../../../procedures/collection/precondition.js";
import type { EventPublisher } from "../../../events/publisher.js";

/** The value of `untilAborted` when the signal aborts first. */
const ABORTED: unique symbol = Symbol("aborted");

/** The value of a promise, or ABORTED when the signal aborts first. The promise runs on. */
function untilAborted<T>(promise: Promise<T>, signal: AbortSignal | undefined): Promise<T | typeof ABORTED> {
  if (!signal) return promise;
  if (signal.aborted) {
    promise.catch(() => undefined);
    return Promise.resolve(ABORTED);
  }
  return new Promise((resolve, reject) => {
    const onAbort = (): void => {
      promise.catch(() => undefined);
      resolve(ABORTED);
    };
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

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
  private readonly interceptors: readonly Interceptor[] | undefined;
  private readonly capability: Capability | undefined;
  private readonly clearanceOrder: ClearanceOrder | undefined;
  private readonly events: EventPublisher | undefined;

  constructor(options: LocalTransportOptions = {}) {
    this.throwOnMissing = options.throwOnMissing !== false;
    this.registry = options.registry;
    this.interceptors = options.interceptors;
    this.capability = options.capability;
    this.clearanceOrder = options.clearanceOrder;
    this.events = options.events;

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

  /** The procedure of the registry at the path of a method, or `events.subscribe` of the publisher. */
  private procedureFor(method: Method): AnyProcedure | undefined {
    const path = methodToPath(method);
    if (this.events && pathToKey(path) === "events.subscribe") return this.events.procedure;
    if (!this.registry) return undefined;
    return this.registry.get(path);
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
        // The interceptors, the capability and the deadline of the call, as on a server (R14)
        const timeoutMs = message.metadata[TIMEOUT_METADATA_KEY];
        const capability =
          typeof timeoutMs === "number" && Number.isFinite(timeoutMs) && timeoutMs >= 0
            ? narrowCapability(this.capability, { timeoutMs }, this.clearanceOrder)
            : this.capability;
        const output = await untilAborted(invokeProcedure(procedure, message.payload, {
          registry: this.registry,
          metadata: message.metadata,
          signal: message.signal,
          ...(this.interceptors ? { interceptors: this.interceptors } : {}),
          ...(capability ? { capability } : {}),
          ...(this.clearanceOrder ? { clearanceOrder: this.clearanceOrder } : {}),
          ...(this.events ? { bus: this.events.bus } : {}),
        }), message.signal);
        if (output === ABORTED) {
          // The caller stops waiting at once, as over HTTP and WebSocket (the conformance suite
          // of roadmap R18 found this: before, a local call waited for its handler)
          yield errorItem<TRes>(message.id, "ABORTED", "Request was aborted");
          return;
        }
        if (output.kind === "stream") values = output.items;
        else value = output.value;
      } else {
        // Execute handler (may be sync, async or an async generator)
        const result = await untilAborted(Promise.resolve(handler!(message.payload, message)), message.signal);
        if (result === ABORTED) {
          yield errorItem<TRes>(message.id, "ABORTED", "Request was aborted");
          return;
        }
        if (isAsyncIterable(result)) values = result;
        else value = result;
      }

      if (values === undefined) {
        if (message.signal?.aborted) {
          yield errorItem<TRes>(message.id, "ABORTED", "Request was aborted");
          return;
        }
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
      // The handler threw, or the invocation failed (its code: VALIDATION_ERROR, ABORTED and so
      // on). A handler error keeps its own code, as on the other faces (WIRE-PROTOCOL.md).
      const code = errorCodeOf(error);
      const item = errorItem<TRes>(message.id, code, error instanceof Error ? error.message : "Unknown error");
      // The reason of a FORBIDDEN error travels on each face (roadmap R25)
      if (error instanceof InvocationError && error.reason) item.metadata = { reason: error.reason };
      // The current items of a VERSION_CONFLICT error travel on each face (roadmap CLI-16)
      const conflicts = versionConflictsOf(error);
      if (conflicts !== undefined) item.metadata = { ...item.metadata, [VERSION_CONFLICTS_METADATA_KEY]: conflicts };
      yield item;
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
