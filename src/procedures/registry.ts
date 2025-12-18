/**
 * Procedure Registry
 *
 * Central registry for procedure definitions.
 * Supports auto-discovery via module self-registration pattern.
 */

import type {
  AnyProcedure,
  ProcedurePath,
  RegistryEventType,
  RegistryListener,
  ProcedureModule,
  RegistrationOptions,
} from "./types.js";
import { pathToKey } from "./types.js";

// =============================================================================
// Registry Errors
// =============================================================================

/**
 * Error thrown when procedure registration fails.
 */
export class RegistryError extends Error {
  override readonly name = "RegistryError";
  readonly path: ProcedurePath;

  constructor(
    message: string,
    path: ProcedurePath,
    cause?: Error
  ) {
    super(message, { cause });
    this.path = path;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, RegistryError);
    }
  }
}

// =============================================================================
// Procedure Registry
// =============================================================================

/**
 * Central registry for procedure definitions.
 *
 * Features:
 * - Path-based procedure storage and lookup
 * - Event emission for registration/unregistration
 * - Module bulk registration with path prefixing
 * - Tree traversal for namespace queries
 *
 * @example
 * ```typescript
 * const registry = new ProcedureRegistry();
 *
 * // Register a procedure
 * registry.register(getUserProcedure);
 *
 * // Lookup by path
 * const proc = registry.get(['users', 'get']);
 *
 * // Listen for registrations
 * registry.on('register', (proc) => console.log('Registered:', proc.path));
 * ```
 */
export class ProcedureRegistry {
  /** Procedures stored by path key */
  private readonly procedures = new Map<string, AnyProcedure>();

  /** Event listeners */
  private readonly listeners: RegistryListener[] = [];

  /** Registered module names for debugging */
  private readonly registeredModules = new Set<string>();

  // ---------------------------------------------------------------------------
  // Registration
  // ---------------------------------------------------------------------------

  /**
   * Register a procedure.
   *
   * @param procedure - Procedure to register
   * @param options - Registration options
   * @throws RegistryError if path already exists and override is false
   */
  register(procedure: AnyProcedure, options?: RegistrationOptions): void {
    const path = options?.pathPrefix
      ? [...options.pathPrefix, ...procedure.path]
      : procedure.path;

    const key = pathToKey(path);

    if (this.procedures.has(key) && !options?.override) {
      throw new RegistryError(
        `Procedure already registered at path: ${key}`,
        path
      );
    }

    // Store with potentially prefixed path
    const storedProcedure: AnyProcedure = {
      ...procedure,
      path,
    };

    this.procedures.set(key, storedProcedure);
    this.emit("register", storedProcedure);
  }

  /**
   * Unregister a procedure by path.
   *
   * @param path - Procedure path to unregister
   * @returns true if procedure was found and removed
   */
  unregister(path: ProcedurePath): boolean {
    const key = pathToKey(path);
    const procedure = this.procedures.get(key);

    if (procedure) {
      this.procedures.delete(key);
      this.emit("unregister", procedure);
      return true;
    }

    return false;
  }

  /**
   * Register all procedures from a module.
   *
   * @param module - Module with procedures array
   * @param options - Registration options
   */
  registerModule(module: ProcedureModule, options?: RegistrationOptions): void {
    if (module.name) {
      this.registeredModules.add(module.name);
    }

    for (const procedure of module.procedures) {
      this.register(procedure, options);
    }
  }

  /**
   * Register multiple procedures.
   *
   * @param procedures - Array of procedures
   * @param options - Registration options
   */
  registerAll(procedures: AnyProcedure[], options?: RegistrationOptions): void {
    for (const procedure of procedures) {
      this.register(procedure, options);
    }
  }

  // ---------------------------------------------------------------------------
  // Lookup
  // ---------------------------------------------------------------------------

  /**
   * Get a procedure by path.
   *
   * @param path - Procedure path
   * @returns Procedure or undefined if not found
   */
  get(path: ProcedurePath): AnyProcedure | undefined {
    return this.procedures.get(pathToKey(path));
  }

  /**
   * Check if a procedure exists at path.
   *
   * @param path - Procedure path
   */
  has(path: ProcedurePath): boolean {
    return this.procedures.has(pathToKey(path));
  }

  /**
   * Get all procedures under a namespace prefix.
   *
   * @param prefix - Path prefix to filter by
   * @returns Array of procedures under the prefix
   *
   * @example
   * ```typescript
   * // Get all collection procedures
   * const collectionProcs = registry.getByPrefix(['collections']);
   * ```
   */
  getByPrefix(prefix: ProcedurePath): AnyProcedure[] {
    const prefixKey = pathToKey(prefix);
    const results: AnyProcedure[] = [];

    for (const [key, procedure] of this.procedures) {
      if (key === prefixKey || key.startsWith(prefixKey + ".")) {
        results.push(procedure);
      }
    }

    return results;
  }

  /**
   * Get all registered procedures.
   */
  getAll(): AnyProcedure[] {
    return Array.from(this.procedures.values());
  }

  /**
   * Get count of registered procedures.
   */
  get size(): number {
    return this.procedures.size;
  }

  /**
   * Get all registered module names.
   */
  getModules(): string[] {
    return Array.from(this.registeredModules);
  }

  // ---------------------------------------------------------------------------
  // Tree Operations
  // ---------------------------------------------------------------------------

  /**
   * Get the namespace tree structure.
   * Useful for introspection and documentation generation.
   *
   * @returns Nested object representing the procedure tree
   *
   * @example
   * ```typescript
   * const tree = registry.getTree();
   * // {
   * //   collections: {
   * //     users: { get: procedure, set: procedure },
   * //     orders: { list: procedure }
   * //   },
   * //   weather: { forecast: procedure }
   * // }
   * ```
   */
  getTree(): Record<string, unknown> {
    const tree: Record<string, unknown> = {};

    for (const procedure of this.procedures.values()) {
      let current = tree;

      for (let i = 0; i < procedure.path.length; i++) {
        const segment = procedure.path[i]!;
        const isLast = i === procedure.path.length - 1;

        if (isLast) {
          current[segment] = procedure;
        } else {
          if (!(segment in current)) {
            current[segment] = {};
          }
          current = current[segment] as Record<string, unknown>;
        }
      }
    }

    return tree;
  }

  /**
   * Get all unique namespace prefixes at a given depth.
   *
   * @param depth - Depth to query (0 = root namespaces)
   * @returns Array of unique segments at that depth
   *
   * @example
   * ```typescript
   * registry.getNamespacesAtDepth(0); // ['collections', 'weather', 'auth']
   * registry.getNamespacesAtDepth(1); // ['users', 'orders', 'forecast', ...]
   * ```
   */
  getNamespacesAtDepth(depth: number): string[] {
    const namespaces = new Set<string>();

    for (const procedure of this.procedures.values()) {
      if (procedure.path.length > depth) {
        namespaces.add(procedure.path[depth]!);
      }
    }

    return Array.from(namespaces);
  }

  // ---------------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------------

  /**
   * Add event listener for registry events.
   *
   * @param event - Event type
   * @param listener - Callback function
   */
  on(event: RegistryEventType, listener: (procedure: AnyProcedure) => void): void {
    this.listeners.push({ event, listener });
  }

  /**
   * Remove event listener.
   *
   * @param event - Event type
   * @param listener - Callback function to remove
   */
  off(event: RegistryEventType, listener: (procedure: AnyProcedure) => void): void {
    const index = this.listeners.findIndex(
      (l) => l.event === event && l.listener === listener
    );
    if (index !== -1) {
      this.listeners.splice(index, 1);
    }
  }

  /**
   * Emit an event to all listeners.
   */
  private emit(event: RegistryEventType, procedure: AnyProcedure): void {
    for (const { event: listenerEvent, listener } of this.listeners) {
      if (listenerEvent === event) {
        try {
          listener(procedure);
        } catch (error) {
          console.error(`Registry listener error for ${event}:`, error);
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------------------------

  /**
   * Clear all registered procedures.
   * Primarily useful for testing.
   */
  clear(): void {
    const procedures = Array.from(this.procedures.values());

    for (const procedure of procedures) {
      this.procedures.delete(pathToKey(procedure.path));
      this.emit("unregister", procedure);
    }

    this.registeredModules.clear();
  }

  /**
   * Create a snapshot of current registrations.
   * Useful for debugging and testing.
   */
  snapshot(): { paths: string[]; modules: string[] } {
    return {
      paths: Array.from(this.procedures.keys()),
      modules: Array.from(this.registeredModules),
    };
  }
}

// =============================================================================
// Global Registry Singleton
// =============================================================================

/**
 * Symbol key for storing registry on globalThis.
 * This ensures there's only ONE registry across all module loads,
 * regardless of ESM/CJS interop issues or multiple import paths.
 */
const REGISTRY_KEY = Symbol.for("@mark1russell7/client/PROCEDURE_REGISTRY");

/**
 * Get or create the global registry singleton.
 * Uses Symbol.for to ensure the same symbol is used across all contexts.
 */
function getGlobalRegistry(): ProcedureRegistry {
  const g = globalThis as Record<symbol, ProcedureRegistry | undefined>;
  if (!g[REGISTRY_KEY]) {
    g[REGISTRY_KEY] = new ProcedureRegistry();
  }
  return g[REGISTRY_KEY];
}

/**
 * Global procedure registry singleton.
 *
 * Used for module self-registration pattern where modules
 * register their procedures at import time.
 *
 * Note: Uses globalThis with a Symbol key to ensure there's truly
 * only one registry across ESM/CJS boundaries and dynamic imports.
 *
 * @example
 * ```typescript
 * // In a module's register.ts (side-effect import)
 * import { PROCEDURE_REGISTRY } from 'client/procedures';
 * import { myProcedures } from './procedures';
 *
 * PROCEDURE_REGISTRY.registerAll(myProcedures);
 *
 * // Consumer just imports the side-effect
 * import 'my-module/register';
 * ```
 */
export const PROCEDURE_REGISTRY: ProcedureRegistry = getGlobalRegistry();
