/**
 * Aggregation Result Types
 *
 * Standardized, consistent result types for all aggregation primitives.
 * These provide a uniform interface for handling aggregation outcomes.
 */
/**
 * Base result from a single aggregation step or procedure call.
 *
 * @example
 * ```typescript
 * // Success case
 * { success: true, value: { id: 1, name: "user" }, duration: 42 }
 *
 * // Error case
 * { success: false, error: "Connection timeout", duration: 5000 }
 * ```
 */
export type StepResult<T> = {
    success: true;
    value: T;
    duration: number;
} | {
    success: false;
    error: string;
    duration: number;
};
/**
 * Create a successful step result.
 */
export declare function successResult<T>(value: T, duration: number): StepResult<T>;
/**
 * Create a failed step result.
 */
export declare function errorResult<T>(error: string | Error, duration: number): StepResult<T>;
/**
 * Result from a chain (sequential) aggregation.
 *
 * @example
 * ```typescript
 * {
 *   results: [
 *     { success: true, value: { created: true }, duration: 100 },
 *     { success: true, value: { committed: true }, duration: 50 },
 *   ],
 *   final: { committed: true },
 *   success: true,
 *   duration: 150
 * }
 * ```
 */
export interface ChainResult<T = unknown> {
    /** Results from each step in order */
    results: StepResult<unknown>[];
    /** The final step's value (or undefined if chain is empty) */
    final: T | undefined;
    /** Whether all steps succeeded */
    success: boolean;
    /** Total duration of all steps */
    duration: number;
}
/**
 * Create a chain result from step results.
 */
export declare function createChainResult<T>(results: StepResult<unknown>[]): ChainResult<T>;
/**
 * Result from a parallel aggregation.
 *
 * @example
 * ```typescript
 * {
 *   results: [
 *     { success: true, value: "pkg1-built", duration: 1000 },
 *     { success: false, error: "Build failed", duration: 500 },
 *   ],
 *   allSucceeded: false,
 *   errors: [{ index: 1, error: "Build failed" }],
 *   duration: 1000  // max duration (parallel)
 * }
 * ```
 */
export interface ParallelResult<T = unknown> {
    /** Results from each task in order */
    results: StepResult<T>[];
    /** Whether all tasks succeeded */
    allSucceeded: boolean;
    /** Error details for failed tasks */
    errors: Array<{
        index: number;
        error: string;
    }>;
    /** Duration of the longest task (wall-clock time) */
    duration: number;
}
/**
 * Create a parallel result from task results.
 */
export declare function createParallelResult<T>(results: StepResult<T>[]): ParallelResult<T>;
/**
 * Result from a conditional aggregation.
 *
 * @example
 * ```typescript
 * {
 *   condition: true,
 *   branch: 'then',
 *   value: { committed: true },
 *   success: true,
 *   duration: 50
 * }
 * ```
 */
export interface ConditionalResult<T = unknown> {
    /** The evaluated condition value */
    condition: boolean;
    /** Which branch was taken */
    branch: 'then' | 'else' | 'none';
    /** The result value from the branch (undefined if no branch taken) */
    value: T | undefined;
    /** Whether the branch execution succeeded */
    success: boolean;
    /** Duration of the branch execution */
    duration: number;
}
/**
 * Result from a reduce aggregation.
 *
 * @example
 * ```typescript
 * {
 *   accumulator: 150,
 *   iterations: 3,
 *   success: true,
 *   duration: 45
 * }
 * ```
 */
export interface ReduceResult<T = unknown> {
    /** The final accumulated value */
    accumulator: T;
    /** Number of iterations performed */
    iterations: number;
    /** Whether all iterations succeeded */
    success: boolean;
    /** Total duration */
    duration: number;
}
/**
 * Result from a map aggregation.
 *
 * @example
 * ```typescript
 * {
 *   items: [
 *     { success: true, value: "processed-1", duration: 10 },
 *     { success: true, value: "processed-2", duration: 12 },
 *   ],
 *   values: ["processed-1", "processed-2"],
 *   allSucceeded: true,
 *   duration: 22
 * }
 * ```
 */
export interface MapResult<T = unknown> {
    /** Result for each item */
    items: StepResult<T>[];
    /** Just the values (for successful items) */
    values: T[];
    /** Whether all items succeeded */
    allSucceeded: boolean;
    /** Total duration */
    duration: number;
}
/**
 * Create a map result from item results.
 */
export declare function createMapResult<T>(items: StepResult<T>[]): MapResult<T>;
/**
 * Check if a step result is successful.
 */
export declare function isSuccess<T>(result: StepResult<T>): result is StepResult<T> & {
    success: true;
};
/**
 * Check if a step result is an error.
 */
export declare function isError<T>(result: StepResult<T>): result is StepResult<T> & {
    success: false;
};
/**
 * Extract the value from a successful result, or throw on error.
 */
export declare function unwrap<T>(result: StepResult<T>): T;
/**
 * Extract the value from a successful result, or return a default.
 */
export declare function unwrapOr<T>(result: StepResult<T>, defaultValue: T): T;
/**
 * Map a successful result's value, passing through errors.
 */
export declare function mapResult<T, U>(result: StepResult<T>, fn: (value: T) => U): StepResult<U>;
//# sourceMappingURL=results.d.ts.map