/**
 * Streaming Registry
 *
 * Creates a splay-compatible StreamingRegistry for components that
 * yield multiple outputs over time (live updates, progressive rendering).
 */
import type { ComponentOutput } from "@mark1russell7/client/components";
import type { StreamingRegistry, RenderContext, StreamingRegistryOptions } from "./types.js";
/**
 * Type for calling streaming client procedures.
 * Returns an async iterable of results.
 */
export interface StreamingProcedureCaller {
    <TResult>(path: string[], input: unknown): AsyncIterable<TResult>;
}
/**
 * Create a splay-compatible streaming registry backed by client procedures.
 *
 * @param callStreaming - Client's streaming procedure call function
 * @param options - Registry options
 * @returns StreamingRegistry instance
 *
 * @example
 * ```typescript
 * import { stream } from "client";
 * import { createStreamingRegistry } from "@mark1russell7/client-splay";
 *
 * const registry = createStreamingRegistry(stream, {
 *   namespace: "live",
 *   bufferSize: 10,
 * });
 *
 * // Use for live-updating components
 * for await (const output of registry.get("ticker")!(ctx)) {
 *   render(output);
 * }
 * ```
 */
export declare function createStreamingRegistry(callStreaming: StreamingProcedureCaller, options?: StreamingRegistryOptions): StreamingRegistry;
/**
 * Combined registry supporting both sync and streaming renderers.
 */
export interface DualRegistry {
    /** Sync registry for single-output components */
    sync: {
        get(type: string): ((ctx: RenderContext) => Promise<ComponentOutput>) | undefined;
        has(type: string): boolean;
    };
    /** Streaming registry for multi-output components */
    streaming: StreamingRegistry;
    /**
     * Render a component, automatically choosing sync or streaming.
     * @param type - Component type
     * @param ctx - Render context
     * @param preferStreaming - Prefer streaming if available
     */
    render(type: string, ctx: RenderContext, preferStreaming?: boolean): AsyncIterable<ComponentOutput>;
}
/**
 * Create a dual registry supporting both sync and streaming.
 *
 * @param callSync - Client's sync procedure call function
 * @param callStreaming - Client's streaming procedure call function
 * @param isStreaming - Function to check if a component is streaming
 * @param options - Registry options
 * @returns DualRegistry instance
 */
export declare function createDualRegistry(callSync: <T>(path: string[], input: unknown) => Promise<T>, callStreaming: StreamingProcedureCaller, isStreaming: (type: string) => boolean, options?: StreamingRegistryOptions): DualRegistry;
/**
 * Merge multiple component streams into one.
 * Yields outputs from all streams as they arrive.
 */
export declare function mergeStreams(...streams: AsyncIterable<ComponentOutput>[]): AsyncIterable<ComponentOutput>;
/**
 * Throttle a component stream to emit at most once per interval.
 */
export declare function throttleStream(stream: AsyncIterable<ComponentOutput>, intervalMs: number): AsyncIterable<ComponentOutput>;
/**
 * Debounce a component stream to emit only after a quiet period.
 */
export declare function debounceStream(stream: AsyncIterable<ComponentOutput>, waitMs: number): AsyncIterable<ComponentOutput>;
//# sourceMappingURL=streaming.d.ts.map