/**
 * Client Registry
 *
 * Creates a splay-compatible Registry that delegates to client procedures.
 * This enables splay's rendering engine to use client's procedure system
 * for component resolution and execution.
 */

import type { ComponentOutput, Size } from "@mark1russell7/client/components";
import type {
  Registry,
  ComponentRenderer,
  RenderContext,
  ClientRegistryOptions,
} from "./types.js";

// =============================================================================
// Client Procedure Caller Type
// =============================================================================

/**
 * Type for calling client procedures.
 * This matches the shape of client's call function.
 */
export interface ProcedureCaller {
  <TResult>(path: string[], input: unknown): Promise<TResult>;
}

// =============================================================================
// Client Registry Implementation
// =============================================================================

/**
 * Create a splay-compatible registry backed by client procedures.
 *
 * @param call - Client's procedure call function
 * @param options - Registry options
 * @returns Registry instance
 *
 * @example
 * ```typescript
 * import { call } from "client";
 * import { createClientRegistry } from "@mark1russell7/client-splay";
 *
 * const registry = createClientRegistry(call, {
 *   namespace: "ui",
 *   defaultSize: { width: 800, height: 600 },
 * });
 *
 * // Now pass to splay's renderer
 * const renderer = createRenderer({ registry });
 * ```
 */
export function createClientRegistry(
  call: ProcedureCaller,
  options: ClientRegistryOptions = {}
): Registry {
  const { namespace } = options;

  /**
   * Build the procedure path for a component type.
   */
  function buildPath(type: string): string[] {
    const basePath = ["components"];
    if (namespace) {
      basePath.push(namespace);
    }
    basePath.push(type);
    return basePath;
  }

  /**
   * Create a renderer function for a component type.
   */
  function createRenderer(type: string): ComponentRenderer {
    const procedurePath = buildPath(type);

    return async (ctx: RenderContext): Promise<ComponentOutput> => {
      // Build the input for the component procedure
      const input = {
        data: ctx.data,
        size: ctx.size,
        path: ctx.path,
        depth: ctx.depth,
      };

      // Call the procedure
      const result = await call<ComponentOutput>(procedurePath, input);
      return result;
    };
  }

  // Cache of created renderers
  const rendererCache = new Map<string, ComponentRenderer>();

  return {
    /**
     * Get a renderer for a component type.
     * Creates and caches the renderer on first access.
     */
    get(type: string): ComponentRenderer | undefined {
      // Check cache first
      let renderer = rendererCache.get(type);
      if (renderer) {
        return renderer;
      }

      // Create and cache renderer
      // Note: We always create a renderer - the procedure may or may not exist
      // Errors will be thrown at call time if the procedure doesn't exist
      renderer = createRenderer(type);
      rendererCache.set(type, renderer);
      return renderer;
    },

    /**
     * Check if a renderer exists.
     * Note: This always returns true since we lazily create renderers.
     * Actual existence is checked at call time.
     */
    has(_type: string): boolean {
      // We optimistically return true - actual check happens at call time
      // This matches splay's expectation that has() is a quick check
      return true;
    },

    /**
     * Register a renderer (not supported - use client procedures).
     */
    register(type: string, _renderer: ComponentRenderer): void {
      throw new Error(
        `Cannot register renderers directly on ClientRegistry. ` +
          `Define a component procedure at path: ${buildPath(type).join(".")}`
      );
    },
  };
}

// =============================================================================
// Registry with Existence Check
// =============================================================================

/**
 * Create a registry that can check procedure existence.
 * Requires an additional hasProcedure function from client.
 *
 * @param call - Client's procedure call function
 * @param hasProcedure - Function to check if a procedure exists
 * @param options - Registry options
 * @returns Registry with accurate has() checks
 */
export function createCheckedRegistry(
  call: ProcedureCaller,
  hasProcedure: (path: string[]) => boolean,
  options: ClientRegistryOptions = {}
): Registry {
  const baseRegistry = createClientRegistry(call, options);
  const { namespace } = options;

  function buildPath(type: string): string[] {
    const basePath = ["components"];
    if (namespace) {
      basePath.push(namespace);
    }
    basePath.push(type);
    return basePath;
  }

  return {
    ...baseRegistry,

    /**
     * Check if a procedure exists for this component type.
     */
    has(type: string): boolean {
      return hasProcedure(buildPath(type));
    },
  };
}

// =============================================================================
// Render Context Factory
// =============================================================================

/**
 * Create a render context for calling component procedures.
 *
 * @param registry - The registry to use for child renders
 * @param data - Data to render
 * @param size - Available size
 * @param path - Path in render tree
 * @param depth - Current depth
 * @returns RenderContext for component procedures
 */
export function createRenderContext<TData>(
  registry: Registry,
  data: TData,
  size: Size,
  path: string = "root",
  depth: number = 0
): RenderContext<TData> {
  return {
    data,
    size,
    path,
    depth,
    render: async (childData: unknown, childSize: Size, childPath: string) => {
      // Determine component type from data
      const type = getComponentType(childData);
      if (!type) {
        throw new Error(`Cannot determine component type for data at ${childPath}`);
      }

      const renderer = registry.get(type);
      if (!renderer) {
        throw new Error(`No renderer found for component type: ${type}`);
      }

      // Create child context
      const childCtx = createRenderContext(
        registry,
        childData,
        childSize,
        childPath,
        depth + 1
      );

      return renderer(childCtx);
    },
  };
}

/**
 * Extract component type from data.
 * Looks for a `type` or `__type__` property.
 */
function getComponentType(data: unknown): string | null {
  if (data === null || typeof data !== "object") {
    return null;
  }

  const obj = data as Record<string, unknown>;

  // Check for type property
  const typeValue = obj["type"];
  if (typeof typeValue === "string") {
    return typeValue;
  }

  // Check for __type__ property (alternative convention)
  const altTypeValue = obj["__type__"];
  if (typeof altTypeValue === "string") {
    return altTypeValue;
  }

  return null;
}
