/**
 * Procedure Storage Types
 *
 * Types for serializing and persisting procedure definitions.
 * Enables procedure registry to be backed by CollectionStorage.
 */

import type { ProcedurePath, ProcedureMetadata } from "../types.js";

// =============================================================================
// Serialized Procedure
// =============================================================================

/**
 * Reference to a handler that can be loaded at runtime.
 * Handlers cannot be serialized directly, so we store a reference.
 */
export interface HandlerReference {
  /** Module name or path (e.g., "@mark1russell7/client-cli") */
  module: string;

  /** Named export from the module (e.g., "libScanHandler") */
  export: string;
}

/**
 * Serialized procedure definition for storage.
 * Contains only JSON-serializable data.
 */
export interface SerializedProcedure {
  /** Procedure path (e.g., ['lib', 'scan']) */
  path: ProcedurePath;

  /** Procedure metadata */
  metadata: ProcedureMetadata;

  /** Whether this procedure supports streaming */
  streaming?: boolean | undefined;

  /** Reference to handler for runtime loading (optional) */
  handlerRef?: HandlerReference | undefined;

  /** Timestamp when stored */
  storedAt?: number | undefined;

  /** Version for conflict detection */
  version?: number | undefined;
}

// =============================================================================
// Handler Loader
// =============================================================================

/**
 * Function to load a handler from a reference.
 * Used to restore handlers when loading procedures from storage.
 */
export interface HandlerLoader {
  /**
   * Load a handler from a reference.
   *
   * @param ref - Handler reference with module and export name
   * @returns The handler function, or undefined if not found
   */
  load(ref: HandlerReference): Promise<unknown | undefined>;
}

// =============================================================================
// Sync Status
// =============================================================================

/**
 * Sync direction for registry operations.
 */
export type SyncDirection = "push" | "pull" | "both";

/**
 * Conflict resolution strategy.
 */
export type ConflictResolution = "local" | "remote" | "merge" | "error";

/**
 * Write strategy for persistence.
 */
export type WriteStrategy = "write-through" | "write-back";

/**
 * Status of a sync conflict.
 */
export interface SyncConflict {
  /** Procedure path that had conflict */
  path: ProcedurePath;

  /** How the conflict was resolved */
  resolution: ConflictResolution;

  /** Local version (if any) */
  local?: SerializedProcedure;

  /** Remote version (if any) */
  remote?: SerializedProcedure;
}

/**
 * Result of a sync operation.
 */
export interface SyncResult {
  /** Number of procedures pushed to storage */
  pushed: number;

  /** Number of procedures pulled from storage */
  pulled: number;

  /** Conflicts encountered during sync */
  conflicts: SyncConflict[];

  /** Timestamp of sync completion */
  timestamp: number;
}

/**
 * Current sync status of the registry.
 */
export interface SyncStatus {
  /** Whether connected to remote storage */
  connected: boolean;

  /** Remote endpoint URL (if connected) */
  endpoint?: string | undefined;

  /** Last successful sync timestamp */
  lastSync?: number | undefined;

  /** Number of pending local changes */
  pendingChanges: number;

  /** Whether currently syncing */
  syncing: boolean;
}

// =============================================================================
// Synced Registry Options
// =============================================================================

/**
 * Options for SyncedProcedureRegistry.
 */
export interface SyncedRegistryOptions {
  /** Write strategy: write-through (immediate) or write-back (queued) */
  writeStrategy: WriteStrategy;

  /** How to resolve conflicts when loading from storage */
  conflictResolution: ConflictResolution;

  /** Auto-sync interval in milliseconds (0 to disable) */
  syncInterval?: number | undefined;

  /** Handler loader for restoring handlers from references */
  handlerLoader?: HandlerLoader | undefined;

  /** Whether to sync on initialization */
  syncOnInit?: boolean | undefined;
}

/**
 * Configuration for creating a storage-backed registry.
 */
export interface ProcedureStorageConfig {
  /** Storage type to use */
  type: "memory" | "api" | "hybrid";

  /** Service name for API storage (default: "procedures") */
  service?: string | undefined;

  /** Options for the synced registry */
  options?: Partial<SyncedRegistryOptions> | undefined;
}
