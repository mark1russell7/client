/**
 * API Storage Implementation
 *
 * Remote storage backed by universal client.
 * Enables collections to be persisted on a server.
 *
 * This is the KEY integration between Collections and Universal Client!
 */

import type { CollectionStorage, StorageMetadata } from "@procedures/collections";
import type { Client } from "@procedures/client";
import type { Method } from "@procedures/client";
import type { CallOptions } from "@procedures/client/client";
import { optionalMs, type Duration } from "@procedures/client";

/**
 * API storage configuration options.
 */
export interface ApiStorageOptions {
  /**
   * The collection of the core collection procedures. The calls go to
   * `collections.<collection>.<operation>`, as `createCollectionProcedures(collection)` registers them.
   * @example "users", "procedures"
   */
  collection?: string;

  /**
   * Service name for RPC calls. The default is `collections.<collection>`. Give a service only
   * for a server with other paths.
   * @example "users", "orders", "products"
   */
  service?: string;

  /**
   * Optional API version
   * @example "v1", "v2"
   */
  version?: string;

  /**
   * Custom operation names (override defaults)
   */
  operations?: {
    get?: string;
    getAll?: string;
    entries?: string;
    find?: string;
    has?: string;
    size?: string;
    set?: string;
    delete?: string;
    clear?: string;
    setBatch?: string;
    deleteBatch?: string;
    getBatch?: string;
  };

  /**
   * Request timeout, for example `seconds(30)`. A call that takes longer fails. 0: no timeout.
   * @default 30 seconds
   */
  timeout?: Duration;

  /**
   * Retry a call that fails with a retryable error: true (3 attempts), false (1 attempt), or the
   * number of attempts.
   * @default true
   */
  retry?: boolean | number;

  /**
   * The first delay between attempts. Each later delay is two times longer.
   * @default 100 milliseconds
   */
  retryDelay?: Duration;

  /**
   * AbortSignal for cancelling requests
   */
  signal?: AbortSignal;

  /**
   * True: `close()` closes the client. The default is false: the client belongs to the caller.
   * @default false
   */
  closeClient?: boolean;
}

/** An error that says whether another attempt can succeed (a ClientError does). */
function isRetryable(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { retryable?: unknown }).retryable === true
  );
}

/** A promise that rejects when the signal aborts first. */
function untilAborted<T>(promise: Promise<T>, signal: AbortSignal | undefined, describe: () => Error): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(describe());
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => reject(describe());
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      }
    );
  });
}

/**
 * API storage backed by universal client.
 *
 * Maps collection operations to the core collection procedures
 * (`createCollectionProcedures`), which take and return raw values:
 * - get(id) → `collections.<collection>.get` with `{ id }`
 * - set(id, value) → `collections.<collection>.set` with `{ id, value }`
 * - setBatch(items) → `collections.<collection>.setBatch` with `{ items: [{ id, value }] }`
 * - etc.
 *
 * Before, the class expected a `{ data }` envelope and called `<service>.get`: no core
 * procedure matched, and every read was undefined (deep dive CORE-9, DATA-9).
 *
 * @example
 * ```typescript
 * // Create API storage
 * const client = new Client({
 *   transport: new HttpTransport({ baseUrl: "https://api.example.com" })
 * });
 *
 * const storage = new ApiStorage(client, { collection: "users" });
 *
 * // Operations are automatically sent to server
 * await storage.set("123", { name: "John" });
 * const user = await storage.get("123"); // Fetched from server
 * ```
 */
export class ApiStorage<T> implements CollectionStorage<T> {
  private client: Client;
  private options: {
    service: string;
    version?: string;
    operations: Required<NonNullable<ApiStorageOptions["operations"]>>;
    timeout: number;
    attempts: number;
    retryDelay: number;
    signal?: AbortSignal;
    closeClient: boolean;
  };

  constructor(client: Client, options: ApiStorageOptions) {
    const service = options.service ?? (options.collection !== undefined ? `collections.${options.collection}` : undefined);
    if (!service) {
      throw new Error("ApiStorage requires a collection or a service");
    }
    this.client = client;
    this.options = {
      service,
      ...(options.version !== undefined && { version: options.version }),
      operations: {
        get: "get",
        getAll: "getAll",
        entries: "entries",
        find: "find",
        has: "has",
        size: "size",
        set: "set",
        delete: "delete",
        clear: "clear",
        setBatch: "setBatch",
        deleteBatch: "deleteBatch",
        getBatch: "getBatch",
        ...options.operations,
      },
      timeout: optionalMs(options.timeout, "timeout") ?? 30000,
      attempts:
        options.retry === false ? 1 : options.retry === true || options.retry === undefined ? 3 : Math.max(1, options.retry),
      retryDelay: optionalMs(options.retryDelay, "retryDelay") ?? 100,
      ...(options.signal !== undefined && { signal: options.signal }),
      closeClient: options.closeClient ?? false,
    };
  }

  //
  // ═══ Read Operations ═══
  //

  async get(id: string): Promise<T | undefined> {
    const value = await this.call<T | null | undefined>("get", { id });
    return value ?? undefined;
  }

  async getAll(): Promise<T[]> {
    const values = await this.call<T[]>("getAll", {});
    if (!Array.isArray(values)) {
      throw new Error(`${this.options.service}.getAll did not return an array`);
    }
    return values;
  }

  /** Every item with its id, from the `entries` procedure of the collection (roadmap R2). */
  async getEntries(): Promise<Array<[string, T]>> {
    const entries = await this.call<Array<{ id: string; value: T }>>("entries", {});
    if (!Array.isArray(entries)) {
      throw new Error(`${this.options.service}.entries did not return an array`);
    }
    return entries.map((entry) => [entry.id, entry.value]);
  }

  async find(predicate: (item: T) => boolean): Promise<T[]> {
    // A predicate cannot go over the network: read all items, then filter here
    const all = await this.getAll();
    return all.filter(predicate);
  }

  async has(id: string): Promise<boolean> {
    return (await this.call<boolean>("has", { id })) === true;
  }

  async size(): Promise<number> {
    return Number(await this.call<number>("size", {}));
  }

  //
  // ═══ Write Operations ═══
  //

  async set(id: string, value: T): Promise<void> {
    await this.call("set", { id, value });
  }

  async delete(id: string): Promise<boolean> {
    return (await this.call<boolean>("delete", { id })) === true;
  }

  async clear(): Promise<void> {
    await this.call("clear", {});
  }

  //
  // ═══ Bulk Operations ═══
  //

  async setBatch(items: Array<[string, T]>): Promise<void> {
    // The collection procedure takes objects, not tuples
    await this.call("setBatch", { items: items.map(([id, value]) => ({ id, value })) });
  }

  async deleteBatch(ids: string[]): Promise<number> {
    return Number(await this.call<number>("deleteBatch", { ids }));
  }

  async getBatch(ids: string[]): Promise<Map<string, T>> {
    const values = (await this.call<Record<string, T> | null>("getBatch", { ids })) ?? {};

    // Convert object to Map
    const result = new Map<string, T>();
    for (const [id, value] of Object.entries(values)) {
      result.set(id, value);
    }
    return result;
  }

  //
  // ═══ Lifecycle & Metadata ═══
  //

  async close(): Promise<void> {
    // The client belongs to the caller, unless the caller gave it to this storage
    if (this.options.closeClient) {
      await this.client.close();
    }
  }

  async getMetadata(): Promise<StorageMetadata> {
    const storageSize = await this.size();

    return {
      type: "api",
      size: storageSize,
      stats: {
        service: this.options.service,
        version: this.options.version,
        timeout: this.options.timeout,
      },
    };
  }

  //
  // ═══ Internal Helpers ═══
  //

  /**
   * Make an RPC call via the universal client, with the timeout, the signal and the retries.
   */
  private async call<TRes>(operation: keyof Required<ApiStorageOptions>["operations"], payload: unknown): Promise<TRes> {
    const method: Method = {
      service: this.options.service,
      operation: this.options.operations[operation] ?? operation,
      ...(this.options.version !== undefined && { version: this.options.version }),
    };
    const label = `${method.service}.${method.operation}`;

    for (let attempt = 1; ; attempt++) {
      try {
        return await this.attempt<TRes>(method, payload, label);
      } catch (error) {
        if (attempt >= this.options.attempts || !isRetryable(error) || this.options.signal?.aborted) {
          throw error;
        }
        const delay = this.options.retryDelay * 2 ** (attempt - 1);
        await untilAborted(new Promise((resolve) => setTimeout(resolve, delay)), this.options.signal, () => error as Error);
      }
    }
  }

  /** One attempt: the call ends at the timeout, or when the signal of the options aborts. */
  private attempt<TRes>(method: Method, payload: unknown, label: string): Promise<TRes> {
    const signals: AbortSignal[] = [];
    if (this.options.signal) signals.push(this.options.signal);
    const timer = this.options.timeout > 0 ? new AbortController() : undefined;
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    if (timer) {
      timeoutHandle = setTimeout(() => timer.abort(), this.options.timeout);
      signals.push(timer.signal);
    }
    const signal = signals.length === 0 ? undefined : signals.length === 1 ? signals[0] : AbortSignal.any(signals);

    // The signal goes in the call options, so the transport can stop the request too. (Before,
    // it went into the metadata, and the timeout was dropped: deep dive CORE-9.)
    // The storage retries itself: one attempt for a retry middleware of the client, so 3 attempts
    // here and 4 there cannot make 12 calls (roadmap R12)
    const callOptions: CallOptions<unknown> = { context: { retry: { maxAttempts: 1 } } };
    if (signal) callOptions.signal = signal;
    const call = this.client.call<unknown, TRes>(method, payload, callOptions);
    return untilAborted(call, signal, () =>
      timer?.signal.aborted ? new Error(`${label} timed out after ${this.options.timeout} ms`) : new Error(`${label} was aborted`)
    ).finally(() => {
      if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
    });
  }
}
