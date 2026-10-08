/**
 * Streaming Registry
 *
 * Creates a splay-compatible StreamingRegistry for components that
 * yield multiple outputs over time (live updates, progressive rendering).
 */

import type { ComponentOutput } from "@mark1russell7/client/components";
import type {
  StreamingRegistry,
  StreamingComponentRenderer,
  RenderContext,
  StreamingRegistryOptions,
} from "./types.js";

// Portable timer types (cross-platform)
type TimerFn = (callback: () => void, ms: number) => number;
type ClearFn = (id: number) => void;
type GlobalWithTimers = { setTimeout: TimerFn; clearTimeout: ClearFn };
type TimerId = number;
const setTimer = (globalThis as unknown as GlobalWithTimers).setTimeout;
const clearTimer = (globalThis as unknown as GlobalWithTimers).clearTimeout;

// =============================================================================
// Streaming Procedure Caller Type
// =============================================================================

/**
 * Type for calling streaming client procedures.
 * Returns an async iterable of results.
 */
export interface StreamingProcedureCaller {
  <TResult>(path: string[], input: unknown): AsyncIterable<TResult>;
}

// =============================================================================
// Streaming Registry Implementation
// =============================================================================

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
export function createStreamingRegistry(
  callStreaming: StreamingProcedureCaller,
  options: StreamingRegistryOptions = {}
): StreamingRegistry {
  const { namespace, bufferSize = 16 } = options;

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
   * Create a streaming renderer for a component type.
   */
  function createRenderer(type: string): StreamingComponentRenderer {
    const procedurePath = buildPath(type);

    return async function* (ctx: RenderContext): AsyncIterable<ComponentOutput> {
      // Build the input for the component procedure
      const input = {
        data: ctx.data,
        size: ctx.size,
        path: ctx.path,
        depth: ctx.depth,
      };

      // Stream from the procedure
      const stream = callStreaming<ComponentOutput>(procedurePath, input);

      // Yield each output with optional buffering
      let buffer: ComponentOutput[] = [];

      for await (const output of stream) {
        if (bufferSize <= 1) {
          // No buffering - yield immediately
          yield output;
        } else {
          // Add to buffer
          buffer.push(output);

          // Yield when buffer is full
          if (buffer.length >= bufferSize) {
            // Yield the most recent output (discard older ones)
            yield buffer[buffer.length - 1]!;
            buffer = [];
          }
        }
      }

      // Yield any remaining buffered output
      if (buffer.length > 0) {
        yield buffer[buffer.length - 1]!;
      }
    };
  }

  // Cache of created renderers
  const rendererCache = new Map<string, StreamingComponentRenderer>();

  return {
    /**
     * Get a streaming renderer for a component type.
     */
    get(type: string): StreamingComponentRenderer | undefined {
      let renderer = rendererCache.get(type);
      if (renderer) {
        return renderer;
      }

      renderer = createRenderer(type);
      rendererCache.set(type, renderer);
      return renderer;
    },

    /**
     * Check if a streaming renderer exists.
     */
    has(_type: string): boolean {
      return true; // Optimistic - actual check at call time
    },
  };
}

// =============================================================================
// Dual Registry (Sync + Streaming)
// =============================================================================

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
  render(
    type: string,
    ctx: RenderContext,
    preferStreaming?: boolean
  ): AsyncIterable<ComponentOutput>;
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
export function createDualRegistry(
  callSync: <T>(path: string[], input: unknown) => Promise<T>,
  callStreaming: StreamingProcedureCaller,
  isStreaming: (type: string) => boolean,
  options: StreamingRegistryOptions = {}
): DualRegistry {
  const { namespace } = options;

  function buildPath(type: string): string[] {
    const basePath = ["components"];
    if (namespace) {
      basePath.push(namespace);
    }
    basePath.push(type);
    return basePath;
  }

  // Create sync renderer
  function createSyncRenderer(type: string) {
    const path = buildPath(type);
    return async (ctx: RenderContext): Promise<ComponentOutput> => {
      return callSync<ComponentOutput>(path, {
        data: ctx.data,
        size: ctx.size,
        path: ctx.path,
        depth: ctx.depth,
      });
    };
  }

  // Create streaming renderer
  function createStreamingRenderer(type: string): StreamingComponentRenderer {
    const path = buildPath(type);
    return async function* (ctx: RenderContext) {
      const input = {
        data: ctx.data,
        size: ctx.size,
        path: ctx.path,
        depth: ctx.depth,
      };

      for await (const output of callStreaming<ComponentOutput>(path, input)) {
        yield output;
      }
    };
  }

  const syncCache = new Map<string, (ctx: RenderContext) => Promise<ComponentOutput>>();
  const streamingCache = new Map<string, StreamingComponentRenderer>();

  return {
    sync: {
      get(type: string) {
        let renderer = syncCache.get(type);
        if (!renderer) {
          renderer = createSyncRenderer(type);
          syncCache.set(type, renderer);
        }
        return renderer;
      },
      has(type: string) {
        return !isStreaming(type);
      },
    },

    streaming: {
      get(type: string) {
        let renderer = streamingCache.get(type);
        if (!renderer) {
          renderer = createStreamingRenderer(type);
          streamingCache.set(type, renderer);
        }
        return renderer;
      },
      has(type: string) {
        return isStreaming(type);
      },
    },

    async *render(type: string, ctx: RenderContext, preferStreaming = false) {
      const shouldStream = preferStreaming || isStreaming(type);

      if (shouldStream) {
        const renderer = this.streaming.get(type);
        if (renderer) {
          yield* renderer(ctx);
          return;
        }
      }

      // Fall back to sync
      const syncRenderer = this.sync.get(type);
      if (syncRenderer) {
        yield await syncRenderer(ctx);
      } else {
        throw new Error(`No renderer found for component type: ${type}`);
      }
    },
  };
}

// =============================================================================
// Stream Utilities
// =============================================================================

/**
 * Merge multiple component streams into one.
 * Yields outputs from all streams as they arrive.
 */
export async function* mergeStreams(
  ...streams: AsyncIterable<ComponentOutput>[]
): AsyncIterable<ComponentOutput> {
  // Create async iterators for all streams
  const iterators = streams.map((s) => s[Symbol.asyncIterator]());
  const active = new Set(iterators);

  // Keep polling until all streams are done
  while (active.size > 0) {
    const promises = Array.from(active).map(async (iter) => {
      const result = await iter.next();
      return { iter, result };
    });

    const { iter, result } = await Promise.race(promises);

    if (result.done) {
      active.delete(iter);
    } else {
      yield result.value;
    }
  }
}

/**
 * Throttle a component stream to emit at most once per interval.
 */
export async function* throttleStream(
  stream: AsyncIterable<ComponentOutput>,
  intervalMs: number
): AsyncIterable<ComponentOutput> {
  let lastEmit = 0;
  let pending: ComponentOutput | null = null;

  for await (const output of stream) {
    const now = Date.now();

    if (now - lastEmit >= intervalMs) {
      yield output;
      lastEmit = now;
      pending = null;
    } else {
      pending = output;
    }
  }

  // Emit final pending output
  if (pending) {
    yield pending;
  }
}

/**
 * Debounce a component stream to emit only after a quiet period.
 */
export async function* debounceStream(
  stream: AsyncIterable<ComponentOutput>,
  waitMs: number
): AsyncIterable<ComponentOutput> {
  let latest: ComponentOutput | null = null;
  let timer: TimerId | null = null;

  const outputs: ComponentOutput[] = [];
  let resolve: (() => void) | null = null;

  // Process the stream
  const processor = (async () => {
    for await (const output of stream) {
      latest = output;

      if (timer) {
        clearTimer(timer);
      }

      timer = setTimer(() => {
        if (latest) {
          outputs.push(latest);
          latest = null;
          if (resolve) {
            resolve();
            resolve = null;
          }
        }
      }, waitMs);
    }

    // Final emit
    if (timer) {
      clearTimer(timer);
    }
    if (latest) {
      outputs.push(latest);
      // Use type assertion - resolve is set by the while loop below
      const currentResolve = resolve as (() => void) | null;
      if (currentResolve) {
        currentResolve();
      }
    }
  })();

  // Yield outputs as they become available
  while (true) {
    if (outputs.length > 0) {
      yield outputs.shift()!;
    } else {
      await new Promise<void>((r) => {
        resolve = r;
      });

      // Check if processor is done
      const isDone = await Promise.race([
        processor.then(() => true),
        Promise.resolve(false),
      ]);

      if (isDone && outputs.length === 0) {
        break;
      }
    }
  }
}
