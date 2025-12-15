/**
 * Sponge - Generator Accumulator
 *
 * Absorbs all yields from a generator and returns a single value.
 * The default behavior returns the last yielded value.
 * Custom accumulators can combine all yields into a single result.
 */
import type { OutputConfig, HandlerOutputConfig } from "./consumption.js";
import type { ProcedurePath } from "../procedures/types.js";
/**
 * Accumulator function that combines yielded values.
 * Called with accumulated array and new value.
 * Returns the combined result.
 */
export type Accumulator<T> = (accumulated: T[], current: T) => T;
/**
 * Default accumulator - returns the last value.
 */
export declare const lastValueAccumulator: Accumulator<unknown>;
/**
 * Array accumulator - collects all values into array.
 */
export declare const arrayAccumulator: Accumulator<unknown>;
/**
 * Object merge accumulator - shallow merges objects.
 */
export declare const mergeAccumulator: Accumulator<Record<string, unknown>>;
/**
 * Sponge result with value and metadata.
 */
export interface SpongeResult<T> {
    /** The final accumulated value */
    value: T;
    /** Number of values that were yielded */
    yieldCount: number;
    /** Whether the generator was a streaming generator (yielded more than once) */
    wasStreaming: boolean;
}
/**
 * Absorb all yields from an async generator and return a single value.
 *
 * @param generator - The async generator to absorb
 * @param accumulator - Function to combine values (default: last value)
 * @returns The accumulated result
 *
 * @example
 * ```typescript
 * // Single yield procedure
 * async function* getUser(id: string) {
 *   yield await fetchUser(id);
 * }
 * const result = await sponge(getUser("123"));
 * // result.value = user, result.yieldCount = 1
 *
 * // Multi-yield streaming procedure
 * async function* streamUpdates() {
 *   yield "initial";
 *   yield "update1";
 *   yield "update2";
 * }
 * const result = await sponge(streamUpdates());
 * // result.value = "update2" (last), result.yieldCount = 3
 * ```
 */
export declare function sponge<T>(generator: AsyncGenerator<T, void, unknown>, accumulator?: Accumulator<T>): Promise<SpongeResult<T>>;
/**
 * Absorb generator values and invoke handlers.
 * Progress is called for each yield, complete for final value.
 *
 * @param generator - The async generator
 * @param handlers - Handler callbacks
 * @param resolveProcedure - Function to resolve procedure path callbacks
 * @returns The final value
 */
export declare function spongeWithHandlers<TProgress, TComplete>(generator: AsyncGenerator<TProgress, void, unknown>, handlers: HandlerOutputConfig<TProgress, TComplete>, resolveProcedure?: (path: ProcedurePath, input: unknown) => Promise<void>): Promise<TComplete>;
/**
 * Consume a generator based on output configuration.
 * Returns either a single value (sponge/handler) or an async iterable (stream).
 *
 * @param generator - The async generator to consume
 * @param config - Output configuration
 * @param resolveProcedure - Function to resolve procedure path callbacks
 * @returns Either a single value or an async iterable
 */
export declare function consumeGenerator<T>(generator: AsyncGenerator<T, void, unknown>, config: OutputConfig, resolveProcedure?: (path: ProcedurePath, input: unknown) => Promise<void>): Promise<T | AsyncIterable<T>>;
/**
 * Check if a value is an async generator.
 */
export declare function isAsyncGenerator<T>(value: unknown): value is AsyncGenerator<T, void, unknown>;
/**
 * Convert a value or promise to a single-yield generator.
 * Normalizes sync/async functions to generator format.
 */
export declare function valueToGenerator<T>(value: T | Promise<T>): AsyncGenerator<T, void, unknown>;
/**
 * Convert an async iterable to an async generator.
 */
export declare function iterableToGenerator<T>(iterable: AsyncIterable<T>): AsyncGenerator<T, void, unknown>;
/**
 * Create a generator that yields each value from an array.
 */
export declare function arrayToGenerator<T>(values: T[]): AsyncGenerator<T, void, unknown>;
/**
 * Buffer a generator's yields for backpressure control.
 *
 * @param generator - Source generator
 * @param bufferSize - Maximum buffer size (0 = unbounded)
 */
export declare function bufferedGenerator<T>(generator: AsyncGenerator<T, void, unknown>, bufferSize: number): AsyncGenerator<T, void, unknown>;
/**
 * Take the first N values from a generator.
 */
export declare function take<T>(generator: AsyncGenerator<T, void, unknown>, count: number): AsyncGenerator<T, void, unknown>;
/**
 * Skip the first N values from a generator.
 */
export declare function skip<T>(generator: AsyncGenerator<T, void, unknown>, count: number): AsyncGenerator<T, void, unknown>;
/**
 * Map each yielded value through a transform function.
 */
export declare function mapGenerator<T, U>(generator: AsyncGenerator<T, void, unknown>, transform: (value: T) => U | Promise<U>): AsyncGenerator<U, void, unknown>;
/**
 * Filter yielded values.
 */
export declare function filterGenerator<T>(generator: AsyncGenerator<T, void, unknown>, predicate: (value: T) => boolean | Promise<boolean>): AsyncGenerator<T, void, unknown>;
//# sourceMappingURL=sponge.d.ts.map