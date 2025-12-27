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
import { arrayList } from "../impl/array-list.js";
import { hashMap } from "../impl/hash-map.js";
import { hashSet } from "../impl/hash-set.js";
/**
 * Collects elements using a collector.
 *
 * @example
 * const list = collect([1, 2, 3], toList())
 * const set = collect([1, 2, 2, 3], toSet())
 */
export function collect(iterable, collector) {
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
export function toList() {
    return {
        supplier: () => arrayList(),
        accumulator: (list, element) => list.add(element),
        finisher: (list) => list,
    };
}
/**
 * Collects elements into a HashSet.
 */
export function toSet() {
    return {
        supplier: () => hashSet(),
        accumulator: (set, element) => set.add(element),
        finisher: (set) => set,
    };
}
/**
 * Collects elements into a native Array.
 */
export function toArray() {
    return {
        supplier: () => [],
        accumulator: (arr, element) => arr.push(element),
        finisher: (arr) => arr,
    };
}
/**
 * Collects elements into a HashMap using key and value extractors.
 */
export function toMap(keyExtractor, valueExtractor) {
    return {
        supplier: () => hashMap(),
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
export function groupingBy(classifier) {
    return {
        supplier: () => hashMap(),
        accumulator: (map, element) => {
            const key = classifier(element);
            const list = map.computeIfAbsent(key, () => arrayList());
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
export function groupingByWith(classifier, downstream) {
    return {
        supplier: () => hashMap(),
        accumulator: (map, element) => {
            const key = classifier(element);
            const acc = map.computeIfAbsent(key, () => downstream.supplier());
            downstream.accumulator(acc, element);
        },
        finisher: (map) => {
            const result = hashMap();
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
export function partitioningBy(predicate) {
    return groupingBy((element) => predicate(element));
}
// ============================================================================
// Aggregation collectors
// ============================================================================
/**
 * Counts the number of elements.
 */
export function counting() {
    return {
        supplier: () => 0,
        accumulator: (count) => count + 1,
        finisher: (count) => count,
    };
}
/**
 * Sums numeric elements.
 */
export function summingNumber(mapper) {
    return {
        supplier: () => 0,
        accumulator: (sum, element) => sum + mapper(element),
        finisher: (sum) => sum,
    };
}
/**
 * Averages numeric elements.
 */
export function averagingNumber(mapper) {
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
export function minBy(comparator) {
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
export function maxBy(comparator) {
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
export function joining(delimiter = "", prefix = "", suffix = "") {
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
export function mapping(mapper, downstream) {
    return {
        supplier: downstream.supplier,
        accumulator: (acc, element) => downstream.accumulator(acc, mapper(element)),
        finisher: downstream.finisher,
    };
}
/**
 * Filters elements before collecting.
 */
export function filtering(predicate, downstream) {
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
export function flatMapping(mapper, downstream) {
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
export function reducing(identity, reducer) {
    return {
        supplier: () => identity,
        accumulator: (acc, element) => reducer(acc, element),
        finisher: (acc) => acc,
    };
}
/**
 * Reducing with mapper.
 */
export function reducingWith(identity, mapper, reducer) {
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
export function teeing(collector1, collector2, combiner) {
    return {
        supplier: () => [collector1.supplier(), collector2.supplier()],
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
export function first() {
    return {
        supplier: () => undefined,
        accumulator: (first, element) => (first === undefined ? element : first),
        finisher: (first) => first,
    };
}
/**
 * Collects the last element.
 */
export function last() {
    return {
        supplier: () => undefined,
        accumulator: (_last, element) => element,
        finisher: (last) => last,
    };
}
export function summarizingNumber(mapper) {
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
            count: stats.count,
            sum: stats.sum,
            min: stats.min,
            max: stats.max,
            average: stats.count === 0 ? 0 : stats.sum / stats.count,
        }),
    };
}
//# sourceMappingURL=collectors.js.map