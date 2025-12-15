/**
 * Client Registry
 *
 * Creates a splay-compatible Registry that delegates to client procedures.
 * This enables splay's rendering engine to use client's procedure system
 * for component resolution and execution.
 */
import type { Size } from "client/components";
import type { Registry, RenderContext, ClientRegistryOptions } from "./types.js";
/**
 * Type for calling client procedures.
 * This matches the shape of client's call function.
 */
export interface ProcedureCaller {
    <TResult>(path: string[], input: unknown): Promise<TResult>;
}
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
 * import { createClientRegistry } from "@mark1russell7/splay-client";
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
export declare function createClientRegistry(call: ProcedureCaller, options?: ClientRegistryOptions): Registry;
/**
 * Create a registry that can check procedure existence.
 * Requires an additional hasProcedure function from client.
 *
 * @param call - Client's procedure call function
 * @param hasProcedure - Function to check if a procedure exists
 * @param options - Registry options
 * @returns Registry with accurate has() checks
 */
export declare function createCheckedRegistry(call: ProcedureCaller, hasProcedure: (path: string[]) => boolean, options?: ClientRegistryOptions): Registry;
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
export declare function createRenderContext<TData>(registry: Registry, data: TData, size: Size, path?: string, depth?: number): RenderContext<TData>;
//# sourceMappingURL=registry.d.ts.map