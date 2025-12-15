/**
 * API Storage Implementation
 *
 * Remote storage backed by universal client.
 * Enables collections to be persisted on a server.
 *
 * This is the KEY integration between Collections and Universal Client!
 */
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
export class ApiStorage {
    client;
    options;
    constructor(client, options) {
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
    async get(id) {
        const response = await this.call("get", {
            id,
        });
        return response.data ?? undefined;
    }
    async getAll() {
        const response = await this.call("getAll", {});
        return response.data;
    }
    async find(predicate) {
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
    async has(id) {
        const response = await this.call("has", {
            id,
        });
        return response.data;
    }
    async size() {
        const response = await this.call("size", {});
        return response.data;
    }
    //
    // ═══ Write Operations ═══
    //
    async set(id, value) {
        await this.call("set", {
            id,
            value,
        });
    }
    async delete(id) {
        const response = await this.call("delete", { id });
        return response.data;
    }
    async clear() {
        await this.call("clear", {});
    }
    //
    // ═══ Bulk Operations ═══
    //
    async setBatch(items) {
        await this.call("setBatch", { items });
    }
    async deleteBatch(ids) {
        const response = await this.call("deleteBatch", { ids });
        return response.data;
    }
    async getBatch(ids) {
        const response = await this.call("getBatch", { ids });
        // Convert object to Map
        const result = new Map();
        for (const [id, value] of Object.entries(response.data)) {
            result.set(id, value);
        }
        return result;
    }
    //
    // ═══ Lifecycle & Metadata ═══
    //
    async close() {
        // Close underlying client transport
        await this.client.close();
    }
    async getMetadata() {
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
    async call(operation, payload) {
        const operationName = this.options.operations?.[operation] ?? operation;
        const method = {
            service: this.options.service,
            operation: operationName,
            ...(this.options.version !== undefined && { version: this.options.version }),
        };
        const metadata = {};
        if (this.options.timeout) {
            metadata["timeout"] = {
                overall: this.options.timeout,
            };
        }
        if (this.options.signal) {
            metadata["signal"] = this.options.signal;
        }
        // Call via universal client (uses configured transport and middleware)
        const response = await this.client.call(method, payload, metadata);
        return response;
    }
}
//# sourceMappingURL=api.js.map