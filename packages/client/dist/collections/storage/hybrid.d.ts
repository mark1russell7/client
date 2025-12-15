/**
 * Hybrid Storage Implementation
 *
 * Combines local cache (InMemoryStorage) with remote persistence (ApiStorage).
 * Provides fast local reads with remote backup and sync.
 *
 * Features:
 * - Local cache for fast reads
 * - Write-through or write-back strategies
 * - Automatic sync on initialization
 * - Conflict resolution
 * - Offline operation queue
 */
import type { CollectionStorage, StorageMetadata } from "./interface.js";
import type { ApiStorage } from "./api.js";
/**
 * Conflict resolution strategy.
 */
export type ConflictResolution = "local" | "remote" | "merge" | "error";
/**
 * Write strategy for hybrid storage.
 */
export type WriteStrategy = "write-through" | "write-back";
/**
 * Hybrid storage configuration options.
 */
export interface HybridStorageOptions {
    /**
     * Write strategy
     * - write-through: Write to both local and remote immediately
     * - write-back: Write to local immediately, sync to remote later
     * @default "write-through"
     */
    writeStrategy?: WriteStrategy;
    /**
     * Conflict resolution strategy
     * - local: Local changes win
     * - remote: Remote changes win
     * - merge: Custom merge function (requires mergeFn)
     * - error: Throw error on conflict
     * @default "remote"
     */
    conflictResolution?: ConflictResolution;
    /**
     * Custom merge function for conflict resolution.
     * Only used when conflictResolution is "merge".
     *
     * @param local - Local version
     * @param remote - Remote version
     * @returns Merged value
     */
    mergeFn?: <T>(local: T, remote: T) => T;
    /**
     * Automatic sync interval in milliseconds (for write-back mode).
     * Set to 0 to disable automatic sync.
     * @default 5000 (5 seconds)
     */
    syncInterval?: number;
    /**
     * Initialize by syncing from remote on construction.
     * @default true
     */
    syncOnInit?: boolean;
    /**
     * Maximum offline operations to queue.
     * @default 1000
     */
    maxOfflineOps?: number;
    /**
     * Enable offline operation queue.
     * When remote is unavailable, operations are queued and retried.
     * @default true
     */
    offlineQueue?: boolean;
}
/**
 * Hybrid storage combining local cache with remote persistence.
 *
 * @example
 * ```typescript
 * const client = new Client({
 *   transport: new HttpTransport({ baseUrl: "https://api.example.com" })
 * });
 *
 * const remote = new ApiStorage(client, { service: "users" });
 * const hybrid = new HybridStorage(remote, {
 *   writeStrategy: "write-through",
 *   conflictResolution: "remote",
 *   syncInterval: 5000
 * });
 *
 * // Fast local reads
 * const user = hybrid.get("123"); // From cache
 *
 * // Writes go to both local and remote
 * await hybrid.set("123", { name: "John" });
 * ```
 */
export declare class HybridStorage<T> implements CollectionStorage<T> {
    private local;
    private remote;
    private options;
    private offlineOps;
    private syncTimer;
    private isOnline;
    private stats;
    constructor(remote: ApiStorage<T>, options?: HybridStorageOptions);
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
    /**
     * Sync all data from remote to local.
     * Handles conflicts according to conflict resolution strategy.
     */
    syncFromRemote(): Promise<void>;
    /**
     * Sync all pending offline operations to remote.
     * Processes queued operations in order.
     */
    syncToRemote(): Promise<void>;
    /**
     * Force a full sync (both directions).
     */
    sync(): Promise<void>;
    close(): Promise<void>;
    getMetadata(): Promise<StorageMetadata>;
    /**
     * Resolve conflict between local and remote versions.
     */
    private resolveConflict;
    /**
     * Queue operation for later sync.
     */
    private queueOperation;
    /**
     * Execute a queued operation against remote storage.
     */
    private executeOperation;
    /**
     * Handle remote operation failure.
     */
    private handleRemoteFailure;
    /**
     * Start periodic background sync.
     */
    private startPeriodicSync;
    /**
     * Get current online status.
     */
    isRemoteOnline(): boolean;
    /**
     * Get pending offline operations count.
     */
    getPendingOpsCount(): number;
}
//# sourceMappingURL=hybrid.d.ts.map