/**
 * API Storage Implementation
 *
 * Remote storage backed by universal client.
 * Enables collections to be persisted on a server.
 *
 * This is the KEY integration between Collections and Universal Client!
 */
import type { CollectionStorage, StorageMetadata } from "./interface.js";
import type { Client } from "@mark1russell7/client";
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
export declare class ApiStorage<T> implements CollectionStorage<T> {
    private client;
    private options;
    constructor(client: Client, options: ApiStorageOptions);
    get(id: string): Promise<T | undefined>;
    getAll(): Promise<T[]>;
    find(predicate: (item: T) => boolean): Promise<T[]>;
    has(id: string): Promise<boolean>;
    size(): Promise<number>;
    set(id: string, value: T): Promise<void>;
    delete(id: string): Promise<boolean>;
    clear(): Promise<void>;
    setBatch(items: Array<[string, T]>): Promise<void>;
    deleteBatch(ids: string[]): Promise<number>;
    getBatch(ids: string[]): Promise<Map<string, T>>;
    close(): Promise<void>;
    getMetadata(): Promise<StorageMetadata>;
    /**
     * Make RPC call via universal client.
     */
    private call;
}
//# sourceMappingURL=api.d.ts.map