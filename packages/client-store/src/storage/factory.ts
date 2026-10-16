/**
 * Procedure Storage Factory
 *
 * Factory functions for creating storage-backed procedure registries.
 */

import type { Client } from "@procedures/client";
import type { CollectionStorage } from "@procedures/collections";
import { InMemoryStorage } from "@procedures/collections";
import { ApiStorage } from "./api.js";
import { HybridStorage } from "./hybrid.js";
import type { HybridMode, HybridStorageOptions } from "./hybrid.js";
import { ProcedureRegistry, PROCEDURE_REGISTRY } from "@procedures/client";
import type { SerializedProcedure, SyncedRegistryOptions, HandlerLoader } from "./types.js";
import { SyncedProcedureRegistry } from "./synced-registry.js";
import { getSerializedKey } from "./serialization.js";

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
   * The collection of the core collection procedures on the server: the calls go to
   * `collections.<collection>.<operation>`.
   * @default "procedures"
   */
  collection?: string | undefined;

  /**
   * The service of the calls, for a server with other paths. The default is
   * `collections.<collection>`.
   */
  service?: string | undefined;

  /**
   * The first mode of the hybrid storage (roadmap R28): `local-only`, `write-through`,
   * `write-back` or `remote-only`. `setMode()` of the registry changes it later. Only the type
   * "hybrid" has modes.
   * @default "write-through"
   */
  mode?: HybridMode | undefined;

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
 *   mode: 'write-through',
 *   hybridOptions: {
 *     conflictResolution: 'remote',
 *   },
 * });
 *
 * // Offline, then online again: the switch sends the queued records
 * await registry.setMode('local-only');
 * await registry.setMode('write-through');
 * ```
 */
export function createSyncedRegistry(config: CreateSyncedRegistryConfig): SyncedProcedureRegistry {
  const {
    type,
    client,
    collection = "procedures",
    service,
    mode,
    hybridOptions,
    registryOptions = {},
    baseRegistry = PROCEDURE_REGISTRY,
    // No loader unless the caller gives one: stored records load as stubs. (Before, the default
    // imported any module a stored record named: BUGS-2026-07 M11, deep dive CORE-7.)
    handlerLoader,
  } = config;

  // Validate client is provided for api/hybrid
  if ((type === "api" || type === "hybrid") && !client) {
    throw new Error(`Client is required for storage type: ${type}`);
  }
  if (mode !== undefined && type !== "hybrid") {
    throw new Error(`Only the storage type "hybrid" has modes, not "${type}"`);
  }

  // Create the appropriate storage backend
  let storage: CollectionStorage<SerializedProcedure>;

  switch (type) {
    case "memory":
      storage = new InMemoryStorage<SerializedProcedure>();
      break;

    case "api":
      storage = new ApiStorage<SerializedProcedure>(client!, {
        collection,
        ...(service !== undefined && { service }),
      });
      break;

    case "hybrid": {
      const remoteStorage = new ApiStorage<SerializedProcedure>(client!, {
        collection,
        ...(service !== undefined && { service }),
      });
      const { mode: optionMode, writeStrategy, ...otherOptions } = hybridOptions ?? {};
      storage = new HybridStorage<SerializedProcedure>(
        remoteStorage,
        {
          conflictResolution: hybridOptions?.conflictResolution ?? "local",
          // A procedure record has no id: its key is its path (deep dive DATA-9)
          keyOf: getSerializedKey,
          ...otherOptions,
          mode: mode ?? optionMode ?? writeStrategy ?? "write-through",
        }
      );
      break;
    }

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
 * @param collection - The collection of the core collection procedures on the server
 * @param baseRegistry - Base registry to wrap
 * @returns SyncedProcedureRegistry with API storage
 */
export function createApiSyncedRegistry(
  client: Client,
  collection = "procedures",
  baseRegistry: ProcedureRegistry = PROCEDURE_REGISTRY
): SyncedProcedureRegistry {
  return createSyncedRegistry({
    type: "api",
    client,
    collection,
    baseRegistry,
  });
}

/**
 * Create a hybrid synced registry (offline-first).
 *
 * @param client - Universal client instance
 * @param collection - The collection of the core collection procedures on the server
 * @param options - Hybrid storage options
 * @param baseRegistry - Base registry to wrap
 * @returns SyncedProcedureRegistry with hybrid storage
 */
export function createHybridSyncedRegistry(
  client: Client,
  collection = "procedures",
  options?: Partial<HybridStorageOptions>,
  baseRegistry: ProcedureRegistry = PROCEDURE_REGISTRY
): SyncedProcedureRegistry {
  return createSyncedRegistry({
    type: "hybrid",
    client,
    collection,
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
  // No default loader: see createSyncedRegistry
  return new SyncedProcedureRegistry(baseRegistry, storage, {
    ...options,
  });
}
