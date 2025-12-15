/**
 * Streaming Registry
 *
 * Creates a splay-compatible StreamingRegistry for components that
 * yield multiple outputs over time (live updates, progressive rendering).
 */
const setTimer = globalThis.setTimeout;
const clearTimer = globalThis.clearTimeout;
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
 * import { createStreamingRegistry } from "@mark1russell7/splay-client";
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
export function createStreamingRegistry(callStreaming, options = {}) {
    const { namespace, bufferSize = 16 } = options;
    /**
     * Build the procedure path for a component type.
     */
    function buildPath(type) {
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
    function createRenderer(type) {
        const procedurePath = buildPath(type);
        return async function* (ctx) {
            // Build the input for the component procedure
            const input = {
                data: ctx.data,
                size: ctx.size,
                path: ctx.path,
                depth: ctx.depth,
            };
            // Stream from the procedure
            const stream = callStreaming(procedurePath, input);
            // Yield each output with optional buffering
            let buffer = [];
            for await (const output of stream) {
                if (bufferSize <= 1) {
                    // No buffering - yield immediately
                    yield output;
                }
                else {
                    // Add to buffer
                    buffer.push(output);
                    // Yield when buffer is full
                    if (buffer.length >= bufferSize) {
                        // Yield the most recent output (discard older ones)
                        yield buffer[buffer.length - 1];
                        buffer = [];
                    }
                }
            }
            // Yield any remaining buffered output
            if (buffer.length > 0) {
                yield buffer[buffer.length - 1];
            }
        };
    }
    // Cache of created renderers
    const rendererCache = new Map();
    return {
        /**
         * Get a streaming renderer for a component type.
         */
        get(type) {
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
        has(_type) {
            return true; // Optimistic - actual check at call time
        },
    };
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
export function createDualRegistry(callSync, callStreaming, isStreaming, options = {}) {
    const { namespace } = options;
    function buildPath(type) {
        const basePath = ["components"];
        if (namespace) {
            basePath.push(namespace);
        }
        basePath.push(type);
        return basePath;
    }
    // Create sync renderer
    function createSyncRenderer(type) {
        const path = buildPath(type);
        return async (ctx) => {
            return callSync(path, {
                data: ctx.data,
                size: ctx.size,
                path: ctx.path,
                depth: ctx.depth,
            });
        };
    }
    // Create streaming renderer
    function createStreamingRenderer(type) {
        const path = buildPath(type);
        return async function* (ctx) {
            const input = {
                data: ctx.data,
                size: ctx.size,
                path: ctx.path,
                depth: ctx.depth,
            };
            for await (const output of callStreaming(path, input)) {
                yield output;
            }
        };
    }
    const syncCache = new Map();
    const streamingCache = new Map();
    return {
        sync: {
            get(type) {
                let renderer = syncCache.get(type);
                if (!renderer) {
                    renderer = createSyncRenderer(type);
                    syncCache.set(type, renderer);
                }
                return renderer;
            },
            has(type) {
                return !isStreaming(type);
            },
        },
        streaming: {
            get(type) {
                let renderer = streamingCache.get(type);
                if (!renderer) {
                    renderer = createStreamingRenderer(type);
                    streamingCache.set(type, renderer);
                }
                return renderer;
            },
            has(type) {
                return isStreaming(type);
            },
        },
        async *render(type, ctx, preferStreaming = false) {
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
            }
            else {
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
export async function* mergeStreams(...streams) {
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
        }
        else {
            yield result.value;
        }
    }
}
/**
 * Throttle a component stream to emit at most once per interval.
 */
export async function* throttleStream(stream, intervalMs) {
    let lastEmit = 0;
    let pending = null;
    for await (const output of stream) {
        const now = Date.now();
        if (now - lastEmit >= intervalMs) {
            yield output;
            lastEmit = now;
            pending = null;
        }
        else {
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
export async function* debounceStream(stream, waitMs) {
    let latest = null;
    let timer = null;
    const outputs = [];
    let resolve = null;
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
            const currentResolve = resolve;
            if (currentResolve) {
                currentResolve();
            }
        }
    })();
    // Yield outputs as they become available
    while (true) {
        if (outputs.length > 0) {
            yield outputs.shift();
        }
        else {
            await new Promise((r) => {
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
//# sourceMappingURL=streaming.js.map