/**
 * Sponge - Generator Accumulator
 *
 * Absorbs all yields from a generator and returns a single value.
 * The default behavior returns the last yielded value.
 * Custom accumulators can combine all yields into a single result.
 */

import type {
  OutputConfig,
  HandlerOutputConfig,
  HandlerCallback,
} from "./consumption.js";
import {
  isSpongeConfig,
  isStreamConfig,
  isHandlerConfig,
  isProcedureCallback,
} from "./consumption.js";
import type { ProcedurePath } from "../procedures/types.js";

// =============================================================================
// Accumulator Types
// =============================================================================

/**
 * Accumulator function that combines yielded values.
 * Called with accumulated array and new value.
 * Returns the combined result.
 */
export type Accumulator<T> = (accumulated: T[], current: T) => T;

/**
 * Default accumulator - returns the last value.
 */
export const lastValueAccumulator: Accumulator<unknown> = (_accumulated, current) => current;

/**
 * Array accumulator - collects all values into array.
 */
export const arrayAccumulator: Accumulator<unknown> = (accumulated, current) => {
  accumulated.push(current);
  return accumulated;
};

/**
 * Object merge accumulator - shallow merges objects.
 */
export const mergeAccumulator: Accumulator<Record<string, unknown>> = (accumulated, current) => {
  return { ...accumulated.reduce((a, b) => ({ ...a, ...b }), {}), ...current };
};

// =============================================================================
// Sponge Execution
// =============================================================================

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
export async function sponge<T>(
  generator: AsyncGenerator<T, void, unknown>,
  accumulator: Accumulator<T> = lastValueAccumulator as Accumulator<T>
): Promise<SpongeResult<T>> {
  const values: T[] = [];
  let finalValue: T | undefined;

  for await (const value of generator) {
    values.push(value);
    finalValue = accumulator(values, value);
  }

  if (values.length === 0) {
    throw new Error("Generator yielded no values");
  }

  return {
    value: finalValue as T,
    yieldCount: values.length,
    wasStreaming: values.length > 1,
  };
}

/**
 * Absorb generator values and invoke handlers.
 * Progress is called for each yield, complete for final value.
 *
 * @param generator - The async generator
 * @param handlers - Handler callbacks
 * @param resolveProcedure - Function to resolve procedure path callbacks
 * @returns The final value
 */
export async function spongeWithHandlers<TProgress, TComplete>(
  generator: AsyncGenerator<TProgress, void, unknown>,
  handlers: HandlerOutputConfig<TProgress, TComplete>,
  resolveProcedure?: (path: ProcedurePath, input: unknown) => Promise<void>
): Promise<TComplete> {
  const values: TProgress[] = [];
  let finalValue: TProgress | undefined;

  try {
    for await (const value of generator) {
      values.push(value);
      finalValue = value;

      // Call progress handler for each yield
      if (handlers.progress) {
        await invokeHandler(handlers.progress as HandlerCallback<unknown>, value, resolveProcedure);
      }
    }

    if (values.length === 0) {
      throw new Error("Generator yielded no values");
    }

    // Call complete handler with final value
    if (handlers.complete) {
      await invokeHandler(handlers.complete as HandlerCallback<unknown>, finalValue as unknown as TComplete, resolveProcedure);
    }

    return finalValue as unknown as TComplete;
  } catch (error) {
    // Call error handler
    if (handlers.error) {
      const err = error instanceof Error ? error : new Error(String(error));
      await invokeHandler(handlers.error as HandlerCallback<unknown>, err, resolveProcedure);
    }
    throw error;
  }
}

/**
 * Invoke a handler callback (function or procedure path).
 */
async function invokeHandler(
  handler: HandlerCallback<unknown>,
  value: unknown,
  resolveProcedure?: (path: ProcedurePath, input: unknown) => Promise<void>
): Promise<void> {
  if (isProcedureCallback(handler)) {
    // Procedure path - call the procedure
    if (!resolveProcedure) {
      throw new Error("Procedure path handlers require a procedure resolver");
    }
    await resolveProcedure(handler, value);
  } else {
    // Function callback
    await handler(value);
  }
}

// =============================================================================
// Generator Consumption
// =============================================================================

/**
 * Consume a generator based on output configuration.
 * Returns either a single value (sponge/handler) or an async iterable (stream).
 *
 * @param generator - The async generator to consume
 * @param config - Output configuration
 * @param resolveProcedure - Function to resolve procedure path callbacks
 * @returns Either a single value or an async iterable
 */
export async function consumeGenerator<T>(
  generator: AsyncGenerator<T, void, unknown>,
  config: OutputConfig,
  resolveProcedure?: (path: ProcedurePath, input: unknown) => Promise<void>
): Promise<T | AsyncIterable<T>> {
  if (isSpongeConfig(config)) {
    const result = await sponge(generator, config.accumulate as Accumulator<T>);
    return result.value;
  }

  if (isStreamConfig(config)) {
    // Return the generator as-is for streaming
    return generator;
  }

  if (isHandlerConfig(config)) {
    // Handler mode - use spongeWithHandlers
    return await spongeWithHandlers(generator, config, resolveProcedure) as T;
  }

  // Default to sponge
  const result = await sponge(generator);
  return result.value;
}

// =============================================================================
// Generator Utilities
// =============================================================================

/**
 * Check if a value is an async generator.
 */
export function isAsyncGenerator<T>(
  value: unknown
): value is AsyncGenerator<T, void, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    Symbol.asyncIterator in value &&
    typeof (value as any).next === "function" &&
    typeof (value as any).return === "function" &&
    typeof (value as any).throw === "function"
  );
}

/**
 * Convert a value or promise to a single-yield generator.
 * Normalizes sync/async functions to generator format.
 */
export async function* valueToGenerator<T>(
  value: T | Promise<T>
): AsyncGenerator<T, void, unknown> {
  yield await value;
}

/**
 * Convert an async iterable to an async generator.
 */
export async function* iterableToGenerator<T>(
  iterable: AsyncIterable<T>
): AsyncGenerator<T, void, unknown> {
  for await (const value of iterable) {
    yield value;
  }
}

/**
 * Create a generator that yields each value from an array.
 */
export async function* arrayToGenerator<T>(
  values: T[]
): AsyncGenerator<T, void, unknown> {
  for (const value of values) {
    yield value;
  }
}

/**
 * Buffer a generator's yields for backpressure control.
 *
 * @param generator - Source generator
 * @param bufferSize - Maximum buffer size (0 = unbounded)
 */
export async function* bufferedGenerator<T>(
  generator: AsyncGenerator<T, void, unknown>,
  bufferSize: number
): AsyncGenerator<T, void, unknown> {
  if (bufferSize <= 0) {
    // Unbounded - pass through
    yield* generator;
    return;
  }

  const buffer: T[] = [];
  let done = false;

  // Start filling buffer
  const fillBuffer = async () => {
    try {
      for await (const value of generator) {
        buffer.push(value);
        // If buffer is full, wait (simple backpressure)
        while (buffer.length >= bufferSize && !done) {
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
      }
    } finally {
      done = true;
    }
  };

  // Start buffer fill in background
  const fillPromise = fillBuffer();

  // Yield from buffer
  try {
    while (!done || buffer.length > 0) {
      if (buffer.length > 0) {
        yield buffer.shift()!;
      } else {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }
  } finally {
    done = true;
    await fillPromise;
  }
}

/**
 * Take the first N values from a generator.
 */
export async function* take<T>(
  generator: AsyncGenerator<T, void, unknown>,
  count: number
): AsyncGenerator<T, void, unknown> {
  let i = 0;
  for await (const value of generator) {
    if (i >= count) {
      await generator.return(undefined);
      break;
    }
    yield value;
    i++;
  }
}

/**
 * Skip the first N values from a generator.
 */
export async function* skip<T>(
  generator: AsyncGenerator<T, void, unknown>,
  count: number
): AsyncGenerator<T, void, unknown> {
  let i = 0;
  for await (const value of generator) {
    if (i >= count) {
      yield value;
    }
    i++;
  }
}

/**
 * Map each yielded value through a transform function.
 */
export async function* mapGenerator<T, U>(
  generator: AsyncGenerator<T, void, unknown>,
  transform: (value: T) => U | Promise<U>
): AsyncGenerator<U, void, unknown> {
  for await (const value of generator) {
    yield await transform(value);
  }
}

/**
 * Filter yielded values.
 */
export async function* filterGenerator<T>(
  generator: AsyncGenerator<T, void, unknown>,
  predicate: (value: T) => boolean | Promise<boolean>
): AsyncGenerator<T, void, unknown> {
  for await (const value of generator) {
    if (await predicate(value)) {
      yield value;
    }
  }
}
