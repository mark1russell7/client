/**
 * API Storage Implementation
 *
 * Remote storage backed by universal client.
 * Enables collections to be persisted on a server.
 *
 * This is the KEY integration between Collections and Universal Client!
 */

import type { CollectionStorage, StorageMetadata } from "./interface.js";
import type { Client, Method } from "@mark1russell7/client";

/**
 * API storage configuration options.
 */
export interface ApiStorageOptions {
  /**
   * Service name for RPC calls
   * @example "users", "orders", "products"
   */
  service: string;

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
   * Request timeout in milliseconds
   * @default 30000 (30 seconds)
   */
  timeout?: number;

  /**
   * Enable automatic retry on failures
   * @default true
   */
  retry?: boolean;

  /**
   * AbortSignal for cancelling requests
   */
  signal?: AbortSignal;
}

/**
 * Standard API response format.
 */
interface ApiResponse<T> {
  /** Response data */
  data: T;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * API storage backed by universal client.
 *
 * Maps collection operations to RPC calls:
 * - get(id) → client.call({ service, operation: "get" }, { id })
 * - set(id, value) → client.call({ service, operation: "set" }, { id, value })
 * - etc.
 *
 * Features:
 * - Remote persistence via any transport (HTTP, WebSocket, gRPC)
 * - Automatic retry and timeout (via client middleware)
 * - Type-safe with full TypeScript inference
 * - Async operations (all return Promises)
 *
 * @example
 * ```typescript
 * // Create API storage
 * const client = new Client({
 *   transport: new HttpTransport({ baseUrl: "https://api.example.com" })
 * });
 *
 * const storage = new ApiStorage(client, { service: "users" });
 *
 * // Use with collection
 * const users = createCollection(storage);
 *
 * // Operations are automatically sent to server
 * await users.set("123", { name: "John" });
 * const user = await users.get("123"); // Fetched from server
 * ```
 */
export class ApiStorage<T> implements CollectionStorage<T> {
  private client: Client;
  private options: {
    service: string;
    version?: string;
    operations: Required<ApiStorageOptions["operations"]>;
    timeout: number;
    retry: boolean;
    signal?: AbortSignal;
  };

  constructor(client: Client, options: ApiStorageOptions) {
    this.client = client;
    this.options = {
      service: options.service,
      ...(options.version !== undefined && { version: options.version }),
      operations: {
        get: "get",
        getAll: "getAll",
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
      timeout: options.timeout ?? 30000,
      retry: options.retry ?? true,
      ...(options.signal !== undefined && { signal: options.signal }),
    };
  }

  //
  // ═══ Read Operations ═══
  //

  async get(id: string): Promise<T | undefined> {
    const response = await this.call<{ id: string }, ApiResponse<T | null>>("get", {
      id,
    });
    return response.data ?? undefined;
  }

  async getAll(): Promise<T[]> {
    const response = await this.call<{}, ApiResponse<T[]>>("getAll", {});
    return response.data;
  }

  async find(predicate: (item: T) => boolean): Promise<T[]> {
    // Note: Predicate functions can't be serialized over network
    // Options:
    // 1. Fetch all and filter client-side (simple but inefficient)
    // 2. Use query language (e.g., MongoDB query, GraphQL)
    // 3. Pre-defined server-side filters

    // For now: Fetch all and filter client-side
    // TODO: Consider adding query language support
    const all = await this.getAll();
    return all.filter(predicate);
  }

  async has(id: string): Promise<boolean> {
    const response = await this.call<{ id: string }, ApiResponse<boolean>>("has", {
      id,
    });
    return response.data;
  }

  async size(): Promise<number> {
    const response = await this.call<{}, ApiResponse<number>>("size", {});
    return response.data;
  }

  //
  // ═══ Write Operations ═══
  //

  async set(id: string, value: T): Promise<void> {
    await this.call<{ id: string; value: T }, ApiResponse<void>>("set", {
      id,
      value,
    });
  }

  async delete(id: string): Promise<boolean> {
    const response = await this.call<{ id: string }, ApiResponse<boolean>>(
      "delete",
      { id }
    );
    return response.data;
  }

  async clear(): Promise<void> {
    await this.call<{}, ApiResponse<void>>("clear", {});
  }

  //
  // ═══ Bulk Operations ═══
  //

  async setBatch(items: Array<[string, T]>): Promise<void> {
    await this.call<{ items: Array<[string, T]> }, ApiResponse<void>>(
      "setBatch",
      { items }
    );
  }

  async deleteBatch(ids: string[]): Promise<number> {
    const response = await this.call<{ ids: string[] }, ApiResponse<number>>(
      "deleteBatch",
      { ids }
    );
    return response.data;
  }

  async getBatch(ids: string[]): Promise<Map<string, T>> {
    const response = await this.call<
      { ids: string[] },
      ApiResponse<Record<string, T>>
    >("getBatch", { ids });

    // Convert object to Map
    const result = new Map<string, T>();
    for (const [id, value] of Object.entries(response.data)) {
      result.set(id, value);
    }
    return result;
  }

  //
  // ═══ Lifecycle & Metadata ═══
  //

  async close(): Promise<void> {
    // Close underlying client transport
    await this.client.close();
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
   * Make RPC call via universal client.
   */
  private async call<TReq, TRes>(
    operation: keyof Required<ApiStorageOptions>["operations"],
    payload: TReq
  ): Promise<TRes> {
    const operationName =
      this.options.operations?.[operation] ?? operation;

    const method: Method = {
      service: this.options.service,
      operation: operationName,
      ...(this.options.version !== undefined && { version: this.options.version }),
    };

    const metadata: Record<string, unknown> = {};

    if (this.options.timeout) {
      metadata["timeout"] = {
        overall: this.options.timeout,
      };
    }

    if (this.options.signal) {
      metadata["signal"] = this.options.signal;
    }

    // Call via universal client (uses configured transport and middleware)
    const response = await this.client.call<TReq, TRes>(
      method,
      payload,
      metadata
    );

    return response;
  }
}
