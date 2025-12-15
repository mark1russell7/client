/**
 * Consumption Types
 *
 * Types for configuring how procedure outputs are consumed.
 * Supports sponge (accumulate), stream (iterate), and handler modes.
 */
import type { ProcedurePath } from "../procedures/types.js";
/**
 * Sponge mode - accumulate all yields into a single value.
 * For single-yield procedures: returns immediately.
 * For multi-yield procedures: returns final accumulated value.
 */
export interface SpongeOutputConfig {
    type: "sponge";
    /**
     * Accumulator function for multi-yield procedures.
     * If not provided, returns only the last yielded value.
     */
    accumulate?: <T>(accumulated: T[], current: T) => T;
}
/**
 * Stream mode - return AsyncIterator of yields.
 */
export interface StreamOutputConfig {
    type: "stream";
    /**
     * Buffer size for stream backpressure.
     * Default: unbuffered (0 = no limit)
     */
    bufferSize?: number;
}
/**
 * Handler callback type - either a function or a procedure path.
 * Procedure paths allow declarative handler routing.
 */
export type HandlerCallback<T = unknown> = ((data: T) => void | Promise<void>) | ProcedurePath;
/**
 * Handler mode - callbacks for progress/complete/error events.
 * Handlers can be functions or procedure paths for declarative routing.
 */
export interface HandlerOutputConfig<TProgress = unknown, TComplete = unknown> {
    /**
     * Called for each intermediate yield (streaming procedures).
     * Can be a callback function or a procedure path.
     */
    progress?: HandlerCallback<TProgress>;
    /**
     * Called when the procedure completes with final value.
     * Can be a callback function or a procedure path.
     */
    complete?: HandlerCallback<TComplete>;
    /**
     * Called if the procedure throws an error.
     * Can be a callback function or a procedure path.
     */
    error?: HandlerCallback<Error>;
}
/**
 * Output consumption configuration.
 *
 * @example
 * ```typescript
 * // Sponge mode - accumulate to single value
 * { type: "sponge" }
 *
 * // Stream mode - async iterator
 * { type: "stream" }
 *
 * // Handler mode - callbacks
 * {
 *   progress: (data) => console.log("Progress:", data),
 *   complete: (data) => console.log("Done:", data),
 * }
 *
 * // Handler mode - declarative procedure routing
 * {
 *   progress: ["ui", "progress-bar", "update"],
 *   complete: ["files", "save-local"],
 * }
 * ```
 */
export type OutputConfig<TProgress = unknown, TComplete = unknown> = SpongeOutputConfig | StreamOutputConfig | HandlerOutputConfig<TProgress, TComplete>;
/**
 * Default output config when none specified.
 * Sponge mode for backward compatibility.
 */
export declare const DEFAULT_OUTPUT_CONFIG: SpongeOutputConfig;
/**
 * Route leaf with input/output configuration.
 * Leaves are the terminal nodes in a route tree.
 *
 * @example
 * ```typescript
 * // Simple input only (sponge by default)
 * { in: { id: "123" } }
 *
 * // With explicit output config
 * { in: { id: "123" }, out: { type: "stream" } }
 *
 * // With handler callbacks
 * {
 *   in: { fileId: "abc" },
 *   out: {
 *     progress: (p) => updateUI(p),
 *     complete: (data) => save(data),
 *   }
 * }
 * ```
 */
export interface RouteLeafWithConfig<TInput = unknown, TProgress = unknown, TComplete = unknown> {
    /** Procedure input payload */
    in: TInput;
    /** Output consumption configuration (default: sponge) */
    out?: OutputConfig<TProgress, TComplete>;
}
/**
 * Legacy route leaf - plain input object (backward compatible).
 * Treated as { in: input, out: { type: "sponge" } }
 */
export type LegacyRouteLeaf = Record<string, unknown>;
/**
 * Unified route leaf type.
 * Supports both new { in, out } format and legacy plain objects.
 */
export type RouteLeaf<TInput = unknown> = RouteLeafWithConfig<TInput> | LegacyRouteLeaf;
/**
 * Check if a route leaf uses the new { in, out } format.
 */
export declare function isRouteLeafWithConfig(leaf: RouteLeaf): leaf is RouteLeafWithConfig;
/**
 * Check if output config is sponge mode.
 */
export declare function isSpongeConfig(config: OutputConfig | undefined): config is SpongeOutputConfig;
/**
 * Check if output config is stream mode.
 */
export declare function isStreamConfig(config: OutputConfig | undefined): config is StreamOutputConfig;
/**
 * Check if output config is handler mode.
 */
export declare function isHandlerConfig(config: OutputConfig | undefined): config is HandlerOutputConfig;
/**
 * Check if a handler callback is a procedure path.
 */
export declare function isProcedureCallback(callback: HandlerCallback | undefined): callback is ProcedurePath;
/**
 * Extract input from a route leaf (handles both formats).
 */
export declare function extractInput<TInput>(leaf: RouteLeaf<TInput>): TInput;
/**
 * Extract output config from a route leaf.
 * Returns sponge config for legacy leaves.
 */
export declare function extractOutputConfig(leaf: RouteLeaf): OutputConfig;
/**
 * Create a sponge output config.
 */
export declare function sponge(options?: Omit<SpongeOutputConfig, "type">): SpongeOutputConfig;
/**
 * Create a stream output config.
 */
export declare function stream(options?: Omit<StreamOutputConfig, "type">): StreamOutputConfig;
/**
 * Create a handler output config.
 */
export declare function handlers<TProgress = unknown, TComplete = unknown>(config: HandlerOutputConfig<TProgress, TComplete>): HandlerOutputConfig<TProgress, TComplete>;
//# sourceMappingURL=consumption.d.ts.map