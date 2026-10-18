/**
 * API Storage Implementation
 *
 * Remote storage backed by universal client.
 * Enables collections to be persisted on a server.
 *
 * This is the KEY integration between Collections and Universal Client!
 */

import type { CollectionStorage, StorageChanges, StorageMetadata, StorageWriteOptions } from "@procedures/collections";
import {
  QUERY_OPERATORS,
  patchProblems,
  queryEntries,
  queryOptionsProblems,
  selectorProblems,
  type StoragePatch,
  type StorageQueryOptions,
  type StorageQueryPolicy,
  type StorageSelector,
} from "@procedures/client/query";
import type { Client } from "@procedures/client";
import type { Method } from "@procedures/client";
import type { CallOptions } from "@procedures/client/client";
import { optionalMs, realClock, type Clock, type Duration } from "@procedures/client";
import { backoffDelay, type Backoff } from "@mark1russell7/service/backoff";

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
   * Custom operation names (override defaults). `find` is the operation of `query()`.
   */
  operations?: {
    get?: string;
    getAll?: string;
    entries?: string;
    ids?: string;
    changes?: string;
    find?: string;
    patch?: string;
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
   * number of attempts. Each collection procedure is idempotent, so a retry is safe.
   * @default true
   */
  retry?: boolean | number;

  /**
   * The backoff of the first retry. Each later backoff is `retryFactor` times longer, at most
   * `maxRetryDelay`. The wait is `backoffDelay` of `@mark1russell7/service/backoff`.
   * @default 100 milliseconds
   */
  retryDelay?: Duration;

  /**
   * The factor of the backoff from one retry to the next.
   * @default 2
   */
  retryFactor?: number;

  /**
   * The longest backoff of a retry, before its random part.
   * @default 30 seconds
   */
  maxRetryDelay?: Duration;

  /**
   * The random part of each wait, from 0 to 1. With 1 (full jitter), the wait is a random time from
   * 0 to the backoff, so the clients that failed together do not retry together. 0 gives the
   * backoff exactly. A server that asks for a wait (`retryAfterMs` of the error) gets at least it.
   * @default 1
   */
  retryJitter?: number;

  /**
   * The clock of the timeout and of the waits between attempts. A test gives `fakeClock` of
   * `@mark1russell7/service/testing`.
   * @default the clock of the platform (`realClock` of `@procedures/client`)
   */
  clock?: Clock;

  /**
   * The random numbers of the jitter, from 0 up to 1. A test gives a fixed generator.
   * @default Math.random
   */
  random?: () => number;

  /**
   * The query policy that `query()` applies before it sends a query, for a call without a policy.
   * The server applies its own policy too. Without it, the storage examines only the form of a
   * selector, and the server decides the rest.
   */
  queryPolicy?: StorageQueryPolicy;

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

/**
 * The policy of a query that only the server limits: each operator, and no limit of size. The form
 * of the selector must still be correct.
 */
const FORM_ONLY: StorageQueryPolicy = Object.freeze({
  operators: QUERY_OPERATORS,
  maxRegexLength: Number.POSITIVE_INFINITY,
  maxClauses: Number.POSITIVE_INFINITY,
  maxDepth: Number.POSITIVE_INFINITY,
  maxListLength: Number.POSITIVE_INFINITY,
});

/** An error that says whether another attempt can succeed (a ClientError does). */
function isRetryable(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { retryable?: unknown }).retryable === true
  );
}

/** The wait that an error asks for before a retry, in milliseconds, or 0. */
function retryAfterOf(error: unknown): number {
  const value = (error as { retryAfterMs?: unknown } | null)?.retryAfterMs;
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
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

/** A wait on the clock. The signal stops the wait and its timer. */
function wait(clock: Clock, ms: number, signal: AbortSignal | undefined, describe: () => Error): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(describe());
      return;
    }
    const onAbort = (): void => {
      cancel();
      reject(describe());
    };
    const cancel = clock.after(ms, () => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    });
    signal?.addEventListener("abort", onAbort, { once: true });
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

/** The entries of the output `[{ id, value }]` of `entries` or `find`. */
function entriesOf<T>(output: unknown, label: string): Array<[string, T]> {
  if (!Array.isArray(output) || !output.every((entry) => typeof entry === "object" && entry !== null && typeof (entry as { id?: unknown }).id === "string")) {
    throw new Error(`${label} did not return an array of { id, value }`);
  }
  return (output as Array<{ id: string; value: T }>).map((entry) => [entry.id, entry.value]);
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
 * - query(selector, options) → `collections.<collection>.find` with `{ selector, sort, skip, limit }`
 * - patch(id, fields) → `collections.<collection>.patch` with `{ id, fields }`
 * - etc.
 *
 * Before, the class expected a `{ data }` envelope and called `<service>.get`: no core
 * procedure matched, and every read was undefined (deep dive CORE-9, DATA-9).
 *
 * The retries wait with `backoffDelay` of `@mark1russell7/service/backoff` on the clock of the
 * options, with full jitter by default. Before, the waits had no jitter, and they used the timers of the platform directly.
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
 * const admins = await storage.query({ role: "admin" }, { sort: { name: 1 }, limit: 50 }); // Runs on the server
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
    backoff: Backoff;
    clock: Clock;
    random: () => number;
    queryPolicy: StorageQueryPolicy;
    signal?: AbortSignal;
    closeClient: boolean;
    /** True when the storage calls the `get` of the core collection procedures */
    askFound: boolean;
    /** True when the writes send their origin: the core collection procedures take it (roadmap CLI-15) */
    sendOrigin: boolean;
  };
  private closed = false;
  /** True when the server does not know the procedure `ids`: `getIds()` reads the entries */
  private idsUnsupported = false;
  /** True when the server does not know the procedure `find`: `query()` reads the entries */
  private findUnsupported = false;

  constructor(client: Client, options: ApiStorageOptions) {
    const service = options.service ?? (options.collection !== undefined ? `collections.${options.collection}` : undefined);
    if (!service) {
      throw new Error("ApiStorage requires a collection or a service");
    }
    const jitter = options.retryJitter ?? 1;
    if (!(jitter >= 0 && jitter <= 1)) throw new RangeError(`retryJitter must be from 0 to 1, not ${jitter}`);
    const factor = options.retryFactor ?? 2;
    if (!(Number.isFinite(factor) && factor >= 1)) throw new RangeError(`retryFactor must be a number of 1 or more, not ${factor}`);
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
        patch: "patch",
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
      backoff: {
        base: optionalMs(options.retryDelay, "retryDelay") ?? 100,
        factor,
        cap: optionalMs(options.maxRetryDelay, "maxRetryDelay") ?? 30000,
        jitter: jitter === 0 ? { kind: "none" } : { kind: "subtract", fraction: jitter },
      },
      clock: options.clock ?? realClock,
      random: options.random ?? Math.random,
      queryPolicy: options.queryPolicy ?? FORM_ONLY,
      ...(options.signal !== undefined && { signal: options.signal }),
      closeClient: options.closeClient ?? false,
      // A custom service can refuse an unknown input field: it gets the input { id }
      askFound: options.service === undefined && (options.operations?.get ?? "get") === "get",
      // A custom service can refuse an unknown input field: it gets no origin
      sendOrigin: options.service === undefined,
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
    return entriesOf<T>(await this.call<unknown>("entries", {}), `${this.options.service}.entries`);
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

  /**
   * The items for which the predicate gives true. A function cannot go over the network, so this
   * method reads all items and filters here. `query()` sends a JSON selector to the server.
   */
  async find(predicate: (item: T) => boolean): Promise<T[]> {
    const all = await this.getAll();
    return all.filter(predicate);
  }

  /**
   * The entries whose items match the selector, from the `find` procedure of the collection: the
   * server runs the selector, the order, the skip and the limit (roadmap CLI-14), under its own
   * query policy. An older server without the procedure answers `NOT_FOUND`. Then this call and
   * each later call read the entries and run the query here, with the same result.
   *
   * @param policy - The policy that the storage applies before it sends the query. The default is
   *   the option `queryPolicy`. The server applies its own policy too.
   */
  async query(selector: StorageSelector, options: StorageQueryOptions = {}, policy?: StorageQueryPolicy): Promise<Array<[string, T]>> {
    // A selector with a problem does not go to the server: the server would refuse it
    const limits = policy ?? this.options.queryPolicy;
    const problems = [...selectorProblems(selector, limits), ...queryOptionsProblems(options, limits)];
    if (problems.length > 0) throw new TypeError(`The query is not correct: ${problems.join(". ")}`);
    if (!this.findUnsupported) {
      const input = {
        selector,
        ...(options.sort !== undefined && { sort: options.sort }),
        ...(options.skip !== undefined && { skip: options.skip }),
        ...(options.limit !== undefined && { limit: options.limit }),
      };
      try {
        return entriesOf<T>(await this.call<unknown>("find", input), `${this.options.service}.find`);
      } catch (error) {
        if (!isNotFound(error)) throw error;
        this.findUnsupported = true;
      }
    }
    return queryEntries(await this.getEntries(), selector, options, limits);
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

  /**
   * This method sets an item on the server. The origin of the options goes to the procedure `set`,
   * so the storage of the server and the change event of the write have it (roadmap CLI-15).
   */
  async set(id: string, value: T, options?: StorageWriteOptions): Promise<void> {
    await this.call("set", { id, value, ...this.originOf(options) });
  }

  async delete(id: string, options?: StorageWriteOptions): Promise<boolean> {
    return (await this.call<boolean>("delete", { id, ...this.originOf(options) })) === true;
  }

  async clear(options?: StorageWriteOptions): Promise<void> {
    await this.call("clear", { ...this.originOf(options) });
  }

  /**
   * This method changes an item on the server in one step: the `patch` procedure of the collection
   * (roadmap CLI-14). The fields are a JSON Merge Patch, or the operations `$set` and `$unset`.
   * It gives the new item, or undefined for a missing id.
   */
  async patch(id: string, fields: StoragePatch, options?: StorageWriteOptions): Promise<T | undefined> {
    const [problem] = patchProblems(fields);
    if (problem !== undefined) throw new TypeError(`The patch of ${id} is not correct: ${problem}`);
    const result = await this.call<unknown>("patch", { id, fields, ...this.originOf(options) });
    if (!isFoundOutput(result)) throw new Error(`${this.options.service}.patch did not return { found, value }`);
    return result.found ? (result.value as T) : undefined;
  }

  //
  // ═══ Bulk Operations ═══
  //

  async setBatch(items: Array<[string, T]>, options?: StorageWriteOptions): Promise<void> {
    // The collection procedure takes objects, not tuples
    await this.call("setBatch", { items: items.map(([id, value]) => ({ id, value })), ...this.originOf(options) });
  }

  async deleteBatch(ids: string[], options?: StorageWriteOptions): Promise<number> {
    return Number(await this.call<number>("deleteBatch", { ids, ...this.originOf(options) }));
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

  /** The field `origin` of a write input, or no field: a custom service gets no origin. */
  private originOf(options: StorageWriteOptions | undefined): { origin?: string } {
    return this.options.sendOrigin && options?.origin !== undefined ? { origin: options.origin } : {};
  }

  /**
   * Make an RPC call via the universal client, with the timeout, the signal and the retries. The
   * wait before retry `n` is `backoffDelay(backoff, n)`, or the wait that the error asks for when
   * it is longer.
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
        const delay = Math.max(backoffDelay(this.options.backoff, attempt, this.options.random), retryAfterOf(error));
        await wait(this.options.clock, delay, this.options.signal, () => error as Error);
      }
    }
  }

  /** One attempt: the call ends at the timeout, or when the signal of the options aborts. */
  private attempt<TRes>(method: Method, payload: unknown, label: string): Promise<TRes> {
    const signals: AbortSignal[] = [];
    if (this.options.signal) signals.push(this.options.signal);
    const timer = this.options.timeout > 0 ? new AbortController() : undefined;
    let cancelTimeout: (() => void) | undefined;
    if (timer) {
      cancelTimeout = this.options.clock.after(this.options.timeout, () => timer.abort());
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
      cancelTimeout?.();
    });
  }
}
