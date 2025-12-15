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

import { arrayList, type ArrayList } from "../impl/array-list.js";
import { hashMap, type HashMap } from "../impl/hash-map.js";
import { hashSet, type HashSet } from "../impl/hash-set.js";

// ============================================================================
// Collector interface
// ============================================================================

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
export function collect<T, A, R>(
  iterable: Iterable<T>,
  collector: Collector<T, A, R>
): R {
  const acc = collector.supplier();
  for (const element of iterable) {
    collector.accumulator(acc, element);
  }
  return collector.finisher(acc);
}

// ============================================================================
// Basic collectors
// ============================================================================

/**
 * Collects elements into an ArrayList.
 */
export function toList<T>(): Collector<T, ArrayList<T>, ArrayList<T>> {
  return {
    supplier: () => arrayList<T>(),
    accumulator: (list, element) => list.add(element),
    finisher: (list) => list,
  };
}

/**
 * Collects elements into a HashSet.
 */
export function toSet<T>(): Collector<T, HashSet<T>, HashSet<T>> {
  return {
    supplier: () => hashSet<T>(),
    accumulator: (set, element) => set.add(element),
    finisher: (set) => set,
  };
}

/**
 * Collects elements into a native Array.
 */
export function toArray<T>(): Collector<T, T[], T[]> {
  return {
    supplier: () => [],
    accumulator: (arr, element) => arr.push(element),
    finisher: (arr) => arr,
  };
}

/**
 * Collects elements into a HashMap using key and value extractors.
 */
export function toMap<T, K, V>(
  keyExtractor: (element: T) => K,
  valueExtractor: (element: T) => V
): Collector<T, HashMap<K, V>, HashMap<K, V>> {
  return {
    supplier: () => hashMap<K, V>(),
    accumulator: (map, element) => {
      map.set(keyExtractor(element), valueExtractor(element));
    },
    finisher: (map) => map,
  };
}

// ============================================================================
// Grouping collectors
// ============================================================================

/**
 * Groups elements by a classifier function.
 *
 * @example
 * const byAge = collect(users, groupingBy(u => u.age))
 * // Map<number, ArrayList<User>>
 */
export function groupingBy<T, K>(
  classifier: (element: T) => K
): Collector<T, HashMap<K, ArrayList<T>>, HashMap<K, ArrayList<T>>> {
  return {
    supplier: () => hashMap<K, ArrayList<T>>(),
    accumulator: (map, element) => {
      const key = classifier(element);
      const list = map.computeIfAbsent(key, () => arrayList<T>());
      list.add(element);
    },
    finisher: (map) => map,
  };
}

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
export function groupingByWith<T, K, A, D>(
  classifier: (element: T) => K,
  downstream: Collector<T, A, D>
): Collector<T, HashMap<K, A>, HashMap<K, D>> {
  return {
    supplier: () => hashMap<K, A>(),
    accumulator: (map, element) => {
      const key = classifier(element);
      const acc = map.computeIfAbsent(key, () => downstream.supplier());
      downstream.accumulator(acc, element);
    },
    finisher: (map) => {
      const result = hashMap<K, D>();
      for (const entry of map.entries()) {
        result.set(entry.key, downstream.finisher(entry.value));
      }
      return result;
    },
  };
}

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
export function partitioningBy<T>(
  predicate: (element: T) => boolean
): Collector<T, HashMap<boolean, ArrayList<T>>, HashMap<boolean, ArrayList<T>>> {
  return groupingBy((element) => predicate(element));
}

// ============================================================================
// Aggregation collectors
// ============================================================================

/**
 * Counts the number of elements.
 */
export function counting<T>(): Collector<T, number, number> {
  return {
    supplier: () => 0,
    accumulator: (count) => count + 1,
    finisher: (count) => count,
  };
}

/**
 * Sums numeric elements.
 */
export function summingNumber<T>(
  mapper: (element: T) => number
): Collector<T, number, number> {
  return {
    supplier: () => 0,
    accumulator: (sum, element) => sum + mapper(element),
    finisher: (sum) => sum,
  };
}

/**
 * Averages numeric elements.
 */
export function averagingNumber<T>(
  mapper: (element: T) => number
): Collector<T, { sum: number; count: number }, number> {
  return {
    supplier: () => ({ sum: 0, count: 0 }),
    accumulator: (acc, element) => {
      acc.sum += mapper(element);
      acc.count++;
    },
    finisher: (acc) => (acc.count === 0 ? 0 : acc.sum / acc.count),
  };
}

/**
 * Finds the minimum element.
 */
export function minBy<T>(
  comparator: (a: T, b: T) => number
): Collector<T, T | undefined, T | undefined> {
  return {
    supplier: () => undefined,
    accumulator: (min, element) => {
      if (min === undefined || comparator(element, min) < 0) {
        return element;
      }
      return min;
    },
    finisher: (min) => min,
  };
}

/**
 * Finds the maximum element.
 */
export function maxBy<T>(
  comparator: (a: T, b: T) => number
): Collector<T, T | undefined, T | undefined> {
  return {
    supplier: () => undefined,
    accumulator: (max, element) => {
      if (max === undefined || comparator(element, max) > 0) {
        return element;
      }
      return max;
    },
    finisher: (max) => max,
  };
}

// ============================================================================
// String collectors
// ============================================================================

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
export function joining<T>(
  delimiter: string = "",
  prefix: string = "",
  suffix: string = ""
): Collector<T, string[], string> {
  return {
    supplier: () => [],
    accumulator: (parts, element) => parts.push(String(element)),
    finisher: (parts) => prefix + parts.join(delimiter) + suffix,
  };
}

// ============================================================================
// Mapping collectors
// ============================================================================

/**
 * Applies a mapping function before collecting.
 *
 * @example
 * const names = collect(
 *   users,
 *   mapping(u => u.name, toList())
 * )
 */
export function mapping<T, U, A, R>(
  mapper: (element: T) => U,
  downstream: Collector<U, A, R>
): Collector<T, A, R> {
  return {
    supplier: downstream.supplier,
    accumulator: (acc, element) => downstream.accumulator(acc, mapper(element)),
    finisher: downstream.finisher,
  };
}

/**
 * Filters elements before collecting.
 */
export function filtering<T, A, R>(
  predicate: (element: T) => boolean,
  downstream: Collector<T, A, R>
): Collector<T, A, R> {
  return {
    supplier: downstream.supplier,
    accumulator: (acc, element) => {
      if (predicate(element)) {
        downstream.accumulator(acc, element);
      }
    },
    finisher: downstream.finisher,
  };
}

/**
 * FlatMaps elements before collecting.
 */
export function flatMapping<T, U, A, R>(
  mapper: (element: T) => Iterable<U>,
  downstream: Collector<U, A, R>
): Collector<T, A, R> {
  return {
    supplier: downstream.supplier,
    accumulator: (acc, element) => {
      for (const mapped of mapper(element)) {
        downstream.accumulator(acc, mapped);
      }
    },
    finisher: downstream.finisher,
  };
}

// ============================================================================
// Reducing collectors
// ============================================================================

/**
 * General reduction collector.
 */
export function reducing<T>(
  identity: T,
  reducer: (acc: T, element: T) => T
): Collector<T, T, T> {
  return {
    supplier: () => identity,
    accumulator: (acc, element) => reducer(acc, element),
    finisher: (acc) => acc,
  };
}

/**
 * Reducing with mapper.
 */
export function reducingWith<T, U>(
  identity: U,
  mapper: (element: T) => U,
  reducer: (acc: U, mapped: U) => U
): Collector<T, U, U> {
  return {
    supplier: () => identity,
    accumulator: (acc, element) => reducer(acc, mapper(element)),
    finisher: (acc) => acc,
  };
}

// ============================================================================
// Composite collectors
// ============================================================================

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
export function teeing<T, A1, A2, R1, R2, R>(
  collector1: Collector<T, A1, R1>,
  collector2: Collector<T, A2, R2>,
  combiner: (r1: R1, r2: R2) => R
): Collector<T, [A1, A2], R> {
  return {
    supplier: () => [collector1.supplier(), collector2.supplier()] as [A1, A2],
    accumulator: ([acc1, acc2], element) => {
      collector1.accumulator(acc1, element);
      collector2.accumulator(acc2, element);
    },
    finisher: ([acc1, acc2]) => {
      return combiner(collector1.finisher(acc1), collector2.finisher(acc2));
    },
  };
}

// ============================================================================
// Utility collectors
// ============================================================================

/**
 * Collects the first element.
 */
export function first<T>(): Collector<T, T | undefined, T | undefined> {
  return {
    supplier: () => undefined,
    accumulator: (first, element) => (first === undefined ? element : first),
    finisher: (first) => first,
  };
}

/**
 * Collects the last element.
 */
export function last<T>(): Collector<T, T | undefined, T | undefined> {
  return {
    supplier: () => undefined,
    accumulator: (_last, element) => element,
    finisher: (last) => last,
  };
}

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

export function summarizingNumber<T>(
  mapper: (element: T) => number
): Collector<T, Partial<SummaryStatistics>, SummaryStatistics> {
  return {
    supplier: () => ({
      count: 0,
      sum: 0,
      min: Infinity,
      max: -Infinity,
    }),
    accumulator: (stats, element) => {
      const value = mapper(element);
      stats.count = (stats.count || 0) + 1;
      stats.sum = (stats.sum || 0) + value;
      stats.min = Math.min(stats.min || Infinity, value);
      stats.max = Math.max(stats.max || -Infinity, value);
    },
    finisher: (stats) => ({
      count: stats.count!,
      sum: stats.sum!,
      min: stats.min!,
      max: stats.max!,
      average: stats.count! === 0 ? 0 : stats.sum! / stats.count!,
    }),
  };
}
