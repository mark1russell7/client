/**
 * Procedure Storage Adapter
 *
 * Wraps CollectionStorage<SerializedProcedure> to provide procedure-specific
 * storage operations with serialization/deserialization.
 */

import type { CollectionStorage } from "../../collections/storage/interface.js";
import type { AnyProcedure, ProcedurePath } from "../types.js";
import { pathToKey } from "../types.js";
import type { SerializedProcedure, HandlerLoader } from "./types.js";
import {
  serializeProcedure,
  deserializeProcedure,
  getProcedureKey,
  type SerializeOptions,
} from "./serialization.js";

// =============================================================================
// Procedure Storage Adapter
// =============================================================================

/**
 * Options for ProcedureStorageAdapter.
 */
export interface ProcedureStorageAdapterOptions {
  /** Handler loader for restoring handlers from references */
  handlerLoader?: HandlerLoader | undefined;

  /** Default serialization options */
  serializeOptions?: SerializeOptions | undefined;
}

/**
 * Adapter that wraps CollectionStorage for procedure-specific operations.
 *
 * Handles serialization/deserialization of procedures and provides
 * convenience methods for common operations.
 *
 * @example
 * ```typescript
 * const storage = new InMemoryStorage<SerializedProcedure>();
 * const adapter = new ProcedureStorageAdapter(storage, {
 *   handlerLoader: createDynamicHandlerLoader(),
 * });
 *
 * // Store a procedure
 * await adapter.store(myProcedure);
 *
 * // Load a procedure
 * const proc = await adapter.load(['lib', 'scan']);
 * ```
 */
export class ProcedureStorageAdapter {
  private readonly storage: CollectionStorage<SerializedProcedure>;
  private readonly handlerLoader: HandlerLoader | undefined;
  private readonly serializeOptions: SerializeOptions;

  constructor(
    storage: CollectionStorage<SerializedProcedure>,
    options: ProcedureStorageAdapterOptions = {}
  ) {
    this.storage = storage;
    this.handlerLoader = options.handlerLoader;
    this.serializeOptions = options.serializeOptions ?? {};
  }

  // ===========================================================================
  // Single Item Operations
  // ===========================================================================

  /**
   * Store a procedure.
   *
   * @param procedure - Procedure to store
   * @param options - Override default serialization options
   */
  async store(procedure: AnyProcedure, options?: SerializeOptions): Promise<void> {
    const key = getProcedureKey(procedure);
    const serialized = serializeProcedure(procedure, {
      ...this.serializeOptions,
      ...options,
    });
    await this.storage.set(key, serialized);
  }

  /**
   * Load a procedure by path.
   *
   * @param path - Procedure path
   * @returns Procedure or undefined if not found
   */
  async load(path: ProcedurePath): Promise<AnyProcedure | undefined> {
    const key = pathToKey(path);
    const data = await this.storage.get(key);
    if (!data) return undefined;

    return deserializeProcedure(data, {
      handlerLoader: this.handlerLoader,
    });
  }

  /**
   * Check if a procedure exists in storage.
   *
   * @param path - Procedure path
   * @returns True if procedure exists
   */
  async has(path: ProcedurePath): Promise<boolean> {
    const key = pathToKey(path);
    return this.storage.has(key);
  }

  /**
   * Remove a procedure from storage.
   *
   * @param path - Procedure path
   * @returns True if procedure was removed
   */
  async remove(path: ProcedurePath): Promise<boolean> {
    const key = pathToKey(path);
    return this.storage.delete(key);
  }

  // ===========================================================================
  // Bulk Operations
  // ===========================================================================

  /**
   * Load all procedures from storage.
   *
   * @returns Array of all procedures
   */
  async loadAll(): Promise<AnyProcedure[]> {
    const items = await this.storage.getAll();
    return Promise.all(
      items.map((item) =>
        deserializeProcedure(item, { handlerLoader: this.handlerLoader })
      )
    );
  }

  /**
   * Load procedures matching a path prefix.
   *
   * @param prefix - Path prefix to match
   * @returns Array of matching procedures
   *
   * @example
   * ```typescript
   * // Load all lib.* procedures
   * const libProcedures = await adapter.loadByPrefix(['lib']);
   * ```
   */
  async loadByPrefix(prefix: ProcedurePath): Promise<AnyProcedure[]> {
    const prefixKey = pathToKey(prefix);
    const items = await this.storage.find((item) => {
      const itemKey = pathToKey(item.path);
      return itemKey === prefixKey || itemKey.startsWith(prefixKey + ".");
    });

    return Promise.all(
      items.map((item) =>
        deserializeProcedure(item, { handlerLoader: this.handlerLoader })
      )
    );
  }

  /**
   * Store multiple procedures.
   *
   * @param procedures - Procedures to store
   * @param options - Override default serialization options
   */
  async storeAll(procedures: AnyProcedure[], options?: SerializeOptions): Promise<void> {
    const items: Array<[string, SerializedProcedure]> = procedures.map((proc) => [
      getProcedureKey(proc),
      serializeProcedure(proc, { ...this.serializeOptions, ...options }),
    ]);
    await this.storage.setBatch(items);
  }

  /**
   * Remove multiple procedures.
   *
   * @param paths - Procedure paths to remove
   * @returns Number of procedures removed
   */
  async removeAll(paths: ProcedurePath[]): Promise<number> {
    const keys = paths.map(pathToKey);
    return this.storage.deleteBatch(keys);
  }

  /**
   * Clear all procedures from storage.
   */
  async clear(): Promise<void> {
    await this.storage.clear();
  }

  // ===========================================================================
  // Info Operations
  // ===========================================================================

  /**
   * Get the number of stored procedures.
   */
  async size(): Promise<number> {
    return this.storage.size();
  }

  /**
   * List all stored procedure paths.
   *
   * @returns Array of procedure paths
   */
  async listPaths(): Promise<ProcedurePath[]> {
    const items = await this.storage.getAll();
    return items.map((item) => item.path);
  }

  /**
   * Get the raw serialized data for a procedure.
   * Useful for debugging or custom processing.
   *
   * @param path - Procedure path
   * @returns Serialized procedure data or undefined
   */
  async getRaw(path: ProcedurePath): Promise<SerializedProcedure | undefined> {
    const key = pathToKey(path);
    return this.storage.get(key);
  }

  /**
   * Get all raw serialized data.
   * Useful for debugging or backup.
   *
   * @returns Array of serialized procedures
   */
  async getAllRaw(): Promise<SerializedProcedure[]> {
    return this.storage.getAll();
  }

  // ===========================================================================
  // Lifecycle
  // ===========================================================================

  /**
   * Close the underlying storage.
   */
  async close(): Promise<void> {
    await this.storage.close();
  }

  /**
   * Get the underlying storage instance.
   * Use for advanced operations or testing.
   */
  getStorage(): CollectionStorage<SerializedProcedure> {
    return this.storage;
  }
}
