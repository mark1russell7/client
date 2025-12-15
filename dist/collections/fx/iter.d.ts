/**
 * Functional operations for iterables (lazy sync transforms).
 *
 * Provides Stream-like operations with lazy evaluation.
 * All operations return generators for composability.
 *
 * @example
 * const result = pipe(
 *   [1, 2, 3, 4, 5],
 *   map(x => x * 2),
 *   filter(x => x > 5),
 *   take(2),
 *   toArray
 * ) // [6, 8]
 */
/**
 * Maps each element through a function.
 *
 * @example
 * const doubled = map([1, 2, 3], x => x * 2) // [2, 4, 6]
 */
export declare function map<T, U>(iterable: Iterable<T>, fn: (value: T, index: number) => U): Generator<U>;
/**
 * Filters elements based on a predicate.
 */
export declare function filter<T>(iterable: Iterable<T>, predicate: (value: T, index: number) => boolean): Generator<T>;
/**
 * FlatMaps each element to an iterable and flattens.
 */
export declare function flatMap<T, U>(iterable: Iterable<T>, fn: (value: T, index: number) => Iterable<U>): Generator<U>;
/**
 * Flattens a nested iterable.
 */
export declare function flatten<T>(iterable: Iterable<Iterable<T>>): Generator<T>;
/**
 * Takes the first n elements.
 */
export declare function take<T>(iterable: Iterable<T>, n: number): Generator<T>;
/**
 * Skips the first n elements.
 */
export declare function skip<T>(iterable: Iterable<T>, n: number): Generator<T>;
/**
 * Takes elements while predicate is true.
 */
export declare function takeWhile<T>(iterable: Iterable<T>, predicate: (value: T) => boolean): Generator<T>;
/**
 * Skips elements while predicate is true.
 */
export declare function skipWhile<T>(iterable: Iterable<T>, predicate: (value: T) => boolean): Generator<T>;
/**
 * Concatenates multiple iterables.
 */
export declare function concat<T>(...iterables: Iterable<T>[]): Generator<T>;
/**
 * Zips multiple iterables together.
 */
export declare function zip<T extends any[]>(...iterables: {
    [K in keyof T]: Iterable<T[K]>;
}): Generator<T>;
/**
 * Zips with index.
 */
export declare function enumerate<T>(iterable: Iterable<T>): Generator<[number, T]>;
/**
 * Chunks elements into arrays of specified size.
 */
export declare function chunk<T>(iterable: Iterable<T>, size: number): Generator<T[]>;
/**
 * Creates a sliding window of specified size.
 */
export declare function window<T>(iterable: Iterable<T>, size: number): Generator<T[]>;
/**
 * Partitions elements into two arrays based on predicate.
 */
export declare function partition<T>(iterable: Iterable<T>, predicate: (value: T) => boolean): [T[], T[]];
/**
 * Reduces iterable to a single value.
 */
export declare function reduce<T, U>(iterable: Iterable<T>, fn: (acc: U, value: T, index: number) => U, initial: U): U;
/**
 * Scans (like reduce but emits intermediate results).
 */
export declare function scan<T, U>(iterable: Iterable<T>, fn: (acc: U, value: T) => U, initial: U): Generator<U>;
/**
 * Sorts elements (materializes the iterable).
 */
export declare function sort<T>(iterable: Iterable<T>, compare?: (a: T, b: T) => number): Generator<T>;
/**
 * Reverses elements (materializes the iterable).
 */
export declare function reverse<T>(iterable: Iterable<T>): Generator<T>;
/**
 * Removes duplicate elements (by reference or key function).
 */
export declare function distinct<T, K = T>(iterable: Iterable<T>, keyFn?: (value: T) => K): Generator<T>;
/**
 * Removes consecutive duplicates.
 */
export declare function distinctConsecutive<T, K = T>(iterable: Iterable<T>, keyFn?: (value: T) => K): Generator<T>;
/**
 * Performs a side effect for each element without modifying the stream.
 */
export declare function tap<T>(iterable: Iterable<T>, fn: (value: T, index: number) => void): Generator<T>;
/**
 * Returns true if any element matches the predicate.
 */
export declare function some<T>(iterable: Iterable<T>, predicate: (value: T) => boolean): boolean;
/**
 * Returns true if all elements match the predicate.
 */
export declare function every<T>(iterable: Iterable<T>, predicate: (value: T) => boolean): boolean;
/**
 * Returns true if no elements match the predicate.
 */
export declare function none<T>(iterable: Iterable<T>, predicate: (value: T) => boolean): boolean;
/**
 * Finds the first element matching the predicate.
 */
export declare function find<T>(iterable: Iterable<T>, predicate: (value: T) => boolean): T | undefined;
/**
 * Counts elements (optionally matching a predicate).
 */
export declare function count<T>(iterable: Iterable<T>, predicate?: (value: T) => boolean): number;
/**
 * Returns the minimum element.
 */
export declare function min<T>(iterable: Iterable<T>, compare?: (a: T, b: T) => number): T | undefined;
/**
 * Returns the maximum element.
 */
export declare function max<T>(iterable: Iterable<T>, compare?: (a: T, b: T) => number): T | undefined;
/**
 * Returns the sum of elements.
 */
export declare function sum(iterable: Iterable<number>): number;
/**
 * Returns the average of elements.
 */
export declare function average(iterable: Iterable<number>): number | undefined;
/**
 * Collects elements into an array.
 */
export declare function toArray<T>(iterable: Iterable<T>): T[];
/**
 * Collects elements into a Set.
 */
export declare function toSet<T>(iterable: Iterable<T>): Set<T>;
/**
 * Collects elements into a Map.
 */
export declare function toMap<T, K, V>(iterable: Iterable<T>, keyFn: (value: T) => K, valueFn: (value: T) => V): Map<K, V>;
/**
 * Pipes a value through a series of transformations.
 *
 * @example
 * const result = pipe(
 *   [1, 2, 3, 4, 5],
 *   (it) => map(it, x => x * 2),
 *   (it) => filter(it, x => x > 5),
 *   (it) => take(it, 2),
 *   toArray
 * ) // [6, 8]
 */
export declare function pipe<T>(value: T, ...fns: Array<(value: any) => any>): any;
//# sourceMappingURL=iter.d.ts.map