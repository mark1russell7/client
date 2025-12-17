/**
 * Procedure Storage Factory
 *
 * Factory functions for creating storage-backed procedure registries.
 */

import type { Client } from "../../client/client.js";
import type { CollectionStorage } from "../../collections/storage/interface.js";
import { InMemoryStorage } from "../../collections/storage/memory.js";
import { ApiStorage } from "../../collections/storage/api.js";
import { HybridStorage } from "../../collections/storage/hybrid.js";
import type { HybridStorageOptions } from "../../collections/storage/hybrid.js";
import { ProcedureRegistry, PROCEDURE_REGISTRY } from "../registry.js";
import type { SerializedProcedure, SyncedRegistryOptions, HandlerLoader } from "./types.js";
import { SyncedProcedureRegistry } from "./synced-registry.js";
import { createDynamicHandlerLoader } from "./serialization.js";

// =============================================================================
// Factory Configuration
// =============================================================================

/**
 * Configuration for creating a synced procedure registry.
 */
export interface CreateSyncedRegistryConfig {
  /**
   * Storage type to use.
   * - "memory": In-memory only (fast, volatile)
   * - "api": Remote storage via client procedures
   * - "hybrid": Local cache + remote sync
   */
  type: "memory" | "api" | "hybrid";

  /**
   * Universal client instance (required for "api" and "hybrid" types).
   */
  client?: Client | undefined;

  /**
   * Service name for API storage.
   * @default "procedures"
   */
  service?: string | undefined;

  /**
   * Additional options for hybrid storage.
   */
  hybridOptions?: Partial<HybridStorageOptions> | undefined;

  /**
   * Options for the synced registry.
   */
  registryOptions?: Partial<SyncedRegistryOptions> | undefined;

  /**
   * Base registry to wrap.
   * @default PROCEDURE_REGISTRY (global singleton)
   */
  baseRegistry?: ProcedureRegistry | undefined;

  /**
   * Custom handler loader.
   * @default Dynamic import loader
   */
  handlerLoader?: HandlerLoader | undefined;
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a synced procedure registry with the specified storage backend.
 *
 * @param config - Configuration for the registry
 * @returns SyncedProcedureRegistry instance
 *
 * @example
 * ```typescript
 * // In-memory only (for testing)
 * const registry = createSyncedRegistry({ type: 'memory' });
 *
 * // API storage (remote persistence)
 * const registry = createSyncedRegistry({
 *   type: 'api',
 *   client: myClient,
 *   service: 'procedures',
 * });
 *
 * // Hybrid storage (offline-first)
 * const registry = createSyncedRegistry({
 *   type: 'hybrid',
 *   client: myClient,
 *   service: 'procedures',
 *   hybridOptions: {
 *     writeStrategy: 'write-through',
 *     conflictResolution: 'remote',
 *   },
 * });
 * ```
 */
export function createSyncedRegistry(config: CreateSyncedRegistryConfig): SyncedProcedureRegistry {
  const {
    type,
    client,
    service = "procedures",
    hybridOptions,
    registryOptions = {},
    baseRegistry = PROCEDURE_REGISTRY,
    handlerLoader = createDynamicHandlerLoader(),
  } = config;

  // Validate client is provided for api/hybrid
  if ((type === "api" || type === "hybrid") && !client) {
    throw new Error(`Client is required for storage type: ${type}`);
  }

  // Create the appropriate storage backend
  let storage: CollectionStorage<SerializedProcedure>;

  switch (type) {
    case "memory":
      storage = new InMemoryStorage<SerializedProcedure>();
      break;

    case "api":
      storage = new ApiStorage<SerializedProcedure>(client!, {
        service,
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
        },
      });
      break;

    case "hybrid":
      const remoteStorage = new ApiStorage<SerializedProcedure>(client!, {
        service,
      });
      storage = new HybridStorage<SerializedProcedure>(
        remoteStorage,
        {
          writeStrategy: hybridOptions?.writeStrategy ?? "write-through",
          conflictResolution: hybridOptions?.conflictResolution ?? "local",
          ...hybridOptions,
        }
      );
      break;

    default:
      throw new Error(`Unknown storage type: ${type}`);
  }

  // Create and return the synced registry
  return new SyncedProcedureRegistry(baseRegistry, storage, {
    ...registryOptions,
    handlerLoader,
  });
}

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Create an in-memory synced registry.
 * Useful for testing or when persistence isn't needed.
 *
 * @param baseRegistry - Base registry to wrap
 * @returns SyncedProcedureRegistry with in-memory storage
 */
export function createMemorySyncedRegistry(
  baseRegistry: ProcedureRegistry = PROCEDURE_REGISTRY
): SyncedProcedureRegistry {
  return createSyncedRegistry({
    type: "memory",
    baseRegistry,
  });
}

/**
 * Create an API-backed synced registry.
 *
 * @param client - Universal client instance
 * @param service - Service name for storage operations
 * @param baseRegistry - Base registry to wrap
 * @returns SyncedProcedureRegistry with API storage
 */
export function createApiSyncedRegistry(
  client: Client,
  service = "procedures",
  baseRegistry: ProcedureRegistry = PROCEDURE_REGISTRY
): SyncedProcedureRegistry {
  return createSyncedRegistry({
    type: "api",
    client,
    service,
    baseRegistry,
  });
}

/**
 * Create a hybrid synced registry (offline-first).
 *
 * @param client - Universal client instance
 * @param service - Service name for storage operations
 * @param options - Hybrid storage options
 * @param baseRegistry - Base registry to wrap
 * @returns SyncedProcedureRegistry with hybrid storage
 */
export function createHybridSyncedRegistry(
  client: Client,
  service = "procedures",
  options?: Partial<HybridStorageOptions>,
  baseRegistry: ProcedureRegistry = PROCEDURE_REGISTRY
): SyncedProcedureRegistry {
  return createSyncedRegistry({
    type: "hybrid",
    client,
    service,
    hybridOptions: options,
    baseRegistry,
  });
}

// =============================================================================
// Custom Storage Factory
// =============================================================================

/**
 * Create a synced registry with a custom storage backend.
 *
 * @param storage - Custom CollectionStorage implementation
 * @param options - Registry options
 * @param baseRegistry - Base registry to wrap
 * @returns SyncedProcedureRegistry with custom storage
 *
 * @example
 * ```typescript
 * // Use MongoDB storage
 * const mongoStorage = new MongoCollectionStorage<SerializedProcedure>(
 *   mongoClient,
 *   'procedures'
 * );
 * const registry = createCustomSyncedRegistry(mongoStorage);
 * ```
 */
export function createCustomSyncedRegistry(
  storage: CollectionStorage<SerializedProcedure>,
  options?: Partial<SyncedRegistryOptions>,
  baseRegistry: ProcedureRegistry = PROCEDURE_REGISTRY
): SyncedProcedureRegistry {
  return new SyncedProcedureRegistry(baseRegistry, storage, {
    handlerLoader: createDynamicHandlerLoader(),
    ...options,
  });
}
