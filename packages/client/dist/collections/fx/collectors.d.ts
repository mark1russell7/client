/**
 * Collectors for Stream-style collection operations.
 *
 * Provides Java Stream API-style collectors for transforming iterables
 * into various collection types. Inspired by java.util.stream.Collectors.
 *
 * @example
 * import { collect, toList, groupingBy } from './collectors'
 *
 * const grouped = collect(users, groupingBy(u => u.age))
 */
import { type ArrayList } from "../impl/array-list.js";
import { type HashMap } from "../impl/hash-map.js";
import { type HashSet } from "../impl/hash-set.js";
/**
 * A Collector represents a mutable reduction operation.
 *
 * @template T - The type of input elements
 * @template A - The mutable accumulation type
 * @template R - The final result type
 */
export interface Collector<T, A, R> {
    /**
     * Creates the initial accumulator.
     */
    supplier: () => A;
    /**
     * Incorporates an element into the accumulator.
     */
    accumulator: (acc: A, element: T) => void;
    /**
     * Combines two accumulators (for parallel streams).
     */
    combiner?: (acc1: A, acc2: A) => A;
    /**
     * Transforms the accumulator into the final result.
     */
    finisher: (acc: A) => R;
}
/**
 * Collects elements using a collector.
 *
 * @example
 * const list = collect([1, 2, 3], toList())
 * const set = collect([1, 2, 2, 3], toSet())
 */
export declare function collect<T, A, R>(iterable: Iterable<T>, collector: Collector<T, A, R>): R;
/**
 * Collects elements into an ArrayList.
 */
export declare function toList<T>(): Collector<T, ArrayList<T>, ArrayList<T>>;
/**
 * Collects elements into a HashSet.
 */
export declare function toSet<T>(): Collector<T, HashSet<T>, HashSet<T>>;
/**
 * Collects elements into a native Array.
 */
export declare function toArray<T>(): Collector<T, T[], T[]>;
/**
 * Collects elements into a HashMap using key and value extractors.
 */
export declare function toMap<T, K, V>(keyExtractor: (element: T) => K, valueExtractor: (element: T) => V): Collector<T, HashMap<K, V>, HashMap<K, V>>;
/**
 * Groups elements by a classifier function.
 *
 * @example
 * const byAge = collect(users, groupingBy(u => u.age))
 * // Map<number, ArrayList<User>>
 */
export declare function groupingBy<T, K>(classifier: (element: T) => K): Collector<T, HashMap<K, ArrayList<T>>, HashMap<K, ArrayList<T>>>;
/**
 * Groups and transforms with a downstream collector.
 *
 * @example
 * const countByAge = collect(
 *   users,
 *   groupingBy(u => u.age, counting())
 * )
 * // Map<number, number>
 */
export declare function groupingByWith<T, K, A, D>(classifier: (element: T) => K, downstream: Collector<T, A, D>): Collector<T, HashMap<K, A>, HashMap<K, D>>;
/**
 * Partitions elements into two groups based on a predicate.
 *
 * @example
 * const partitioned = collect(
 *   numbers,
 *   partitioningBy(n => n % 2 === 0)
 * )
 * // Map<boolean, ArrayList<number>>
 */
export declare function partitioningBy<T>(predicate: (element: T) => boolean): Collector<T, HashMap<boolean, ArrayList<T>>, HashMap<boolean, ArrayList<T>>>;
/**
 * Counts the number of elements.
 */
export declare function counting<T>(): Collector<T, number, number>;
/**
 * Sums numeric elements.
 */
export declare function summingNumber<T>(mapper: (element: T) => number): Collector<T, number, number>;
/**
 * Averages numeric elements.
 */
export declare function averagingNumber<T>(mapper: (element: T) => number): Collector<T, {
    sum: number;
    count: number;
}, number>;
/**
 * Finds the minimum element.
 */
export declare function minBy<T>(comparator: (a: T, b: T) => number): Collector<T, T | undefined, T | undefined>;
/**
 * Finds the maximum element.
 */
export declare function maxBy<T>(comparator: (a: T, b: T) => number): Collector<T, T | undefined, T | undefined>;
/**
 * Joins elements into a string.
 *
 * @example
 * const csv = collect(['a', 'b', 'c'], joining(', '))
 * // "a, b, c"
 *
 * const bracketed = collect(
 *   ['a', 'b', 'c'],
 *   joining(', ', '[', ']')
 * )
 * // "[a, b, c]"
 */
export declare function joining<T>(delimiter?: string, prefix?: string, suffix?: string): Collector<T, string[], string>;
/**
 * Applies a mapping function before collecting.
 *
 * @example
 * const names = collect(
 *   users,
 *   mapping(u => u.name, toList())
 * )
 */
export declare function mapping<T, U, A, R>(mapper: (element: T) => U, downstream: Collector<U, A, R>): Collector<T, A, R>;
/**
 * Filters elements before collecting.
 */
export declare function filtering<T, A, R>(predicate: (element: T) => boolean, downstream: Collector<T, A, R>): Collector<T, A, R>;
/**
 * FlatMaps elements before collecting.
 */
export declare function flatMapping<T, U, A, R>(mapper: (element: T) => Iterable<U>, downstream: Collector<U, A, R>): Collector<T, A, R>;
/**
 * General reduction collector.
 */
export declare function reducing<T>(identity: T, reducer: (acc: T, element: T) => T): Collector<T, T, T>;
/**
 * Reducing with mapper.
 */
export declare function reducingWith<T, U>(identity: U, mapper: (element: T) => U, reducer: (acc: U, mapped: U) => U): Collector<T, U, U>;
/**
 * Collects with two collectors and combines results.
 *
 * @example
 * const stats = collect(
 *   numbers,
 *   teeing(
 *     summingNumber(n => n),
 *     counting(),
 *     (sum, count) => ({ sum, count, avg: sum / count })
 *   )
 * )
 */
export declare function teeing<T, A1, A2, R1, R2, R>(collector1: Collector<T, A1, R1>, collector2: Collector<T, A2, R2>, combiner: (r1: R1, r2: R2) => R): Collector<T, [A1, A2], R>;
/**
 * Collects the first element.
 */
export declare function first<T>(): Collector<T, T | undefined, T | undefined>;
/**
 * Collects the last element.
 */
export declare function last<T>(): Collector<T, T | undefined, T | undefined>;
/**
 * Creates summary statistics.
 */
export interface SummaryStatistics {
    count: number;
    sum: number;
    min: number;
    max: number;
    average: number;
}
export declare function summarizingNumber<T>(mapper: (element: T) => number): Collector<T, Partial<SummaryStatistics>, SummaryStatistics>;
//# sourceMappingURL=collectors.d.ts.map