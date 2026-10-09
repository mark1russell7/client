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

/** This function ends an iterator and does not wait: a source with a pending item ends after it. */
function endSource(iterator: AsyncIterator<unknown>): void {
  try {
    void Promise.resolve(iterator.return?.()).catch(() => undefined);
  } catch {
    // A source whose return() throws has nothing more to end
  }
}

/**
 * A queue with one writer and one reader: the reader waits on one wake-up, not on each source.
 */
class Mailbox<T> {
  private readonly items: T[] = [];
  private wake: (() => void) | null = null;
  private ended = false;
  private failure: { error: unknown } | null = null;

  push(item: T): void {
    this.items.push(item);
    this.notify();
  }

  end(failure?: { error: unknown }): void {
    this.ended = true;
    if (failure) this.failure = failure;
    this.notify();
  }

  get isEnded(): boolean {
    return this.ended;
  }

  private notify(): void {
    const wake = this.wake;
    this.wake = null;
    wake?.();
  }

  /** The items, then the failure (if any) when the writer has ended. */
  async *drain(): AsyncGenerator<T, void, undefined> {
    for (;;) {
      if (this.items.length > 0) {
        yield this.items.shift()!;
        continue;
      }
      if (this.ended) {
        if (this.failure) throw this.failure.error;
        return;
      }
      await new Promise<void>((resolve) => {
        this.wake = resolve;
      });
    }
  }
}

/**
 * Merge multiple component streams into one.
 * Yields outputs from all streams as they arrive.
 *
 * Each source has at most one pending `next()`, and the reader waits on one shared wake-up.
 * (Before, each round raced the pending promises of all sources: an idle source collected one
 * reaction per item of the other sources, 81 MiB at 200k items. Deep dive DATA-12.) When the
 * reader stops, or a source fails, the function ends the other sources.
 */
export async function* mergeStreams(
  ...streams: AsyncIterable<ComponentOutput>[]
): AsyncIterable<ComponentOutput> {
  type Settled =
    | { index: number; result: IteratorResult<ComponentOutput> }
    | { index: number; error: unknown };

  const iterators = streams.map((stream) => stream[Symbol.asyncIterator]());
  const active = new Set<number>();
  const settled = new Mailbox<Settled>();

  const pull = (index: number): void => {
    iterators[index]!.next().then(
      (result) => settled.push({ index, result }),
      (error: unknown) => settled.push({ index, error }),
    );
  };

  iterators.forEach((_, index) => {
    active.add(index);
    pull(index);
  });

  try {
    if (active.size === 0) return;
    for await (const item of settled.drain()) {
      if ("error" in item) {
        active.delete(item.index);
        throw item.error;
      }
      if (item.result.done) {
        active.delete(item.index);
        if (active.size === 0) return;
        continue;
      }
      yield item.result.value;
      // The next item of this source, after the reader took this one
      pull(item.index);
    }
  } finally {
    for (const index of active) endSource(iterators[index]!);
  }
}

/** The state of a timed stream: the source, the outputs, and the stop flag of the reader. */
interface TimedStream {
  iterator: AsyncIterator<ComponentOutput>;
  outputs: Mailbox<ComponentOutput>;
  stopped: boolean;
}

/**
 * Read a source in the background and give each item to `onItem`. `onEnd` runs when the source
 * ends or fails, before the outputs end. When the reader stops, the source is not read further.
 */
async function* timedStream(
  stream: AsyncIterable<ComponentOutput>,
  onItem: (output: ComponentOutput, state: TimedStream) => void,
  onEnd: (state: TimedStream) => void,
  onStop: () => void,
): AsyncIterable<ComponentOutput> {
  const state: TimedStream = {
    iterator: stream[Symbol.asyncIterator](),
    outputs: new Mailbox<ComponentOutput>(),
    stopped: false,
  };

  void (async () => {
    let failure: { error: unknown } | undefined;
    try {
      while (!state.stopped) {
        const result = await state.iterator.next();
        if (result.done || state.stopped) break;
        onItem(result.value, state);
      }
    } catch (error) {
      failure = { error };
    } finally {
      if (!state.stopped) onEnd(state);
      state.outputs.end(failure);
    }
  })();

  try {
    yield* state.outputs.drain();
  } finally {
    if (!state.outputs.isEnded) {
      // The reader stopped early: no more reads of the source (deep dive DATA-12)
      state.stopped = true;
      onStop();
      endSource(state.iterator);
    }
  }
}

/**
 * Throttle a component stream to emit at most once per interval.
 *
 * The first item of an interval goes out at once. The last item that arrives during the
 * interval goes out when the interval ends. (Before, it waited until the source ended: deep
 * dive DATA-12.) When the source ends, a waiting item goes out at once.
 */
export function throttleStream(
  stream: AsyncIterable<ComponentOutput>,
  intervalMs: number
): AsyncIterable<ComponentOutput> {
  let lastEmit = -Infinity;
  let pending: { output: ComponentOutput } | null = null;
  let timer: TimerId | null = null;

  const stopTimer = (): void => {
    if (timer !== null) {
      clearTimer(timer);
      timer = null;
    }
  };

  return timedStream(
    stream,
    (output, state) => {
      const now = Date.now();
      if (timer === null && now - lastEmit >= intervalMs) {
        lastEmit = now;
        state.outputs.push(output);
        return;
      }
      pending = { output };
      if (timer === null) {
        timer = setTimer(() => {
          timer = null;
          if (pending && !state.stopped) {
            lastEmit = Date.now();
            state.outputs.push(pending.output);
            pending = null;
          }
        }, Math.max(0, lastEmit + intervalMs - now));
      }
    },
    (state) => {
      stopTimer();
      if (pending) {
        state.outputs.push(pending.output);
        pending = null;
      }
    },
    stopTimer,
  );
}

/**
 * Debounce a component stream to emit only after a quiet period.
 *
 * When the stream ends, the last output goes out at once (BUGS-2026-07 H29). When the reader
 * stops, the source is not read further (deep dive DATA-12).
 */
export function debounceStream(
  stream: AsyncIterable<ComponentOutput>,
  waitMs: number
): AsyncIterable<ComponentOutput> {
  let latest: { output: ComponentOutput } | null = null;
  let timer: TimerId | null = null;

  const stopTimer = (): void => {
    if (timer !== null) {
      clearTimer(timer);
      timer = null;
    }
  };

  return timedStream(
    stream,
    (output, state) => {
      latest = { output };
      stopTimer();
      timer = setTimer(() => {
        timer = null;
        if (latest && !state.stopped) {
          state.outputs.push(latest.output);
          latest = null;
        }
      }, waitMs);
    },
    (state) => {
      stopTimer();
      if (latest) {
        state.outputs.push(latest.output);
        latest = null;
      }
    },
    stopTimer,
  );
}
