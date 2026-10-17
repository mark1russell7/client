/**
 * API Storage Implementation
 *
 * Remote storage backed by universal client.
 * Enables collections to be persisted on a server.
 *
 * This is the KEY integration between Collections and Universal Client!
 */

import type { CollectionStorage, StorageChanges, StorageMetadata } from "@procedures/collections";
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
    ids?: string;
    changes?: string;
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

/** True when the server does not know a procedure: an older server without `ids`. */
function isNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "NOT_FOUND";
}

/**
 * True for the output `{ found, value }` of the core procedure `get` with `found: true`: an
 * object with a boolean `found`, and no key other than `found` and `value`.
 */
function isFoundOutput(value: unknown): value is { found: boolean; value?: unknown } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record["found"] === "boolean" && Object.keys(record).every((key) => key === "found" || key === "value");
}

/**
 * API storage backed by universal client.
 *
 * Maps collection operations to the core collection procedures
 * (`createCollectionProcedures`), which take and return raw values:
 * - get(id) → `collections.<collection>.get` with `{ id }`
 * - set(id, value) → `collections.<collection>.set` with `{ id, value }`
 * - setBatch(items) → `collections.<collection>.setBatch` with `{ items: [{ id, value }] }`
 * - getIds() → `collections.<collection>.ids` with `{}`, or the entries of an older server
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
    /** True when the storage calls the `get` of the core collection procedures */
    askFound: boolean;
  };
  private closed = false;
  /** True when the server does not know the procedure `ids`: `getIds()` reads the entries */
  private idsUnsupported = false;

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
        ids: "ids",
        changes: "changes",
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
      // A custom service can refuse an unknown input field: it gets the input { id }
      askFound: options.service === undefined && (options.operations?.get ?? "get") === "get",
    };
  }

  //
  // ═══ Read Operations ═══
  //

  /**
   * The item of an id. For the core collection procedures, the call asks for `{ found, value }`,
   * so a stored `null` reads back as `null`. A custom `service` or `get` operation gets `{ id }`,
   * and its `null` reads back as `undefined`.
   */
  async get(id: string): Promise<T | undefined> {
    if (!this.options.askFound) {
      return (await this.call<T | null | undefined>("get", { id })) ?? undefined;
    }
    const result = await this.call<unknown>("get", { id, found: true });
    if (isFoundOutput(result)) return result.found ? (result.value as T) : undefined;
    // A server before `found` ignores it and gives the item, or null for a missing id
    return (result ?? undefined) as T | undefined;
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

  /**
   * The ids of the items in the order of the entries, from the `ids` procedure of the collection.
   * The values stay on the server. An older server without the procedure answers `NOT_FOUND`.
   * Then this call and each later call read the ids from `getEntries()`.
   */
  async getIds(): Promise<string[]> {
    if (!this.idsUnsupported) {
      try {
        const ids = await this.call<string[]>("ids", {});
        if (!Array.isArray(ids) || !ids.every((id) => typeof id === "string")) {
          throw new Error(`${this.options.service}.ids did not return an array of ids`);
        }
        return ids;
      } catch (error) {
        if (!isNotFound(error)) throw error;
        this.idsUnsupported = true;
      }
    }
    return (await this.getEntries()).map(([id]) => id);
  }

  /**
   * The changes after a version, from the `changes` procedure of the collection (roadmap R28).
   * A server without the procedure answers `NOT_FOUND`, and `HybridStorage` then uses
   * `getEntries()`.
   */
  async getChangesSince(since?: string): Promise<StorageChanges<T>> {
    const result = await this.call<{ version: string; full: boolean; changed: Array<{ id: string; value: T }>; deleted: string[] }>(
      "changes",
      since === undefined ? {} : { since },
    );
    if (
      typeof result !== "object" || result === null || typeof result.version !== "string" ||
      typeof result.full !== "boolean" || !Array.isArray(result.changed) || !Array.isArray(result.deleted)
    ) {
      throw new Error(`${this.options.service}.changes did not return { version, full, changed, deleted }`);
    }
    return {
      version: result.version,
      full: result.full,
      changed: result.changed.map((entry) => [entry.id, entry.value]),
      deleted: result.deleted,
    };
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

  /**
   * This method closes the storage. After it, each operation rejects, and a second `close()` does
   * nothing. The items stay on the server. The client belongs to the caller, unless the option
   * `closeClient` gave it to the storage.
   */
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
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
    if (this.closed) throw new Error(`The ApiStorage of ${this.options.service} is closed`);
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
