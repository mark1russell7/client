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
// ============================================================================
// Mapping and transformation
// ============================================================================
/**
 * Maps each element through a function.
 *
 * @example
 * const doubled = map([1, 2, 3], x => x * 2) // [2, 4, 6]
 */
export function* map(iterable, fn) {
    let index = 0;
    for (const value of iterable) {
        yield fn(value, index++);
    }
}
/**
 * Filters elements based on a predicate.
 */
export function* filter(iterable, predicate) {
    let index = 0;
    for (const value of iterable) {
        if (predicate(value, index++)) {
            yield value;
        }
    }
}
/**
 * FlatMaps each element to an iterable and flattens.
 */
export function* flatMap(iterable, fn) {
    let index = 0;
    for (const value of iterable) {
        yield* fn(value, index++);
    }
}
/**
 * Flattens a nested iterable.
 */
export function* flatten(iterable) {
    for (const inner of iterable) {
        yield* inner;
    }
}
// ============================================================================
// Limiting and skipping
// ============================================================================
/**
 * Takes the first n elements.
 */
export function* take(iterable, n) {
    let count = 0;
    for (const value of iterable) {
        if (count++ >= n)
            break;
        yield value;
    }
}
/**
 * Skips the first n elements.
 */
export function* skip(iterable, n) {
    let count = 0;
    for (const value of iterable) {
        if (count++ >= n) {
            yield value;
        }
    }
}
/**
 * Takes elements while predicate is true.
 */
export function* takeWhile(iterable, predicate) {
    for (const value of iterable) {
        if (!predicate(value))
            break;
        yield value;
    }
}
/**
 * Skips elements while predicate is true.
 */
export function* skipWhile(iterable, predicate) {
    let skipping = true;
    for (const value of iterable) {
        if (skipping && predicate(value))
            continue;
        skipping = false;
        yield value;
    }
}
// ============================================================================
// Combining
// ============================================================================
/**
 * Concatenates multiple iterables.
 */
export function* concat(...iterables) {
    for (const iterable of iterables) {
        yield* iterable;
    }
}
/**
 * Zips multiple iterables together.
 */
export function* zip(...iterables) {
    const iterators = iterables.map((it) => it[Symbol.iterator]());
    while (true) {
        const results = iterators.map((it) => it.next());
        if (results.some((r) => r.done))
            break;
        yield results.map((r) => r.value);
    }
}
/**
 * Zips with index.
 */
export function* enumerate(iterable) {
    let index = 0;
    for (const value of iterable) {
        yield [index++, value];
    }
}
// ============================================================================
// Partitioning
// ============================================================================
/**
 * Chunks elements into arrays of specified size.
 */
export function* chunk(iterable, size) {
    let chunk = [];
    for (const value of iterable) {
        chunk.push(value);
        if (chunk.length === size) {
            yield chunk;
            chunk = [];
        }
    }
    if (chunk.length > 0) {
        yield chunk;
    }
}
/**
 * Creates a sliding window of specified size.
 */
export function* window(iterable, size) {
    const window = [];
    for (const value of iterable) {
        window.push(value);
        if (window.length > size) {
            window.shift();
        }
        if (window.length === size) {
            yield [...window];
        }
    }
}
/**
 * Partitions elements into two arrays based on predicate.
 */
export function partition(iterable, predicate) {
    const truthy = [];
    const falsy = [];
    for (const value of iterable) {
        if (predicate(value)) {
            truthy.push(value);
        }
        else {
            falsy.push(value);
        }
    }
    return [truthy, falsy];
}
// ============================================================================
// Reducing and folding
// ============================================================================
/**
 * Reduces iterable to a single value.
 */
export function reduce(iterable, fn, initial) {
    let acc = initial;
    let index = 0;
    for (const value of iterable) {
        acc = fn(acc, value, index++);
    }
    return acc;
}
/**
 * Scans (like reduce but emits intermediate results).
 */
export function* scan(iterable, fn, initial) {
    let acc = initial;
    yield acc;
    for (const value of iterable) {
        acc = fn(acc, value);
        yield acc;
    }
}
// ============================================================================
// Sorting and ordering
// ============================================================================
/**
 * Sorts elements (materializes the iterable).
 */
export function* sort(iterable, compare) {
    const array = Array.from(iterable);
    array.sort(compare);
    yield* array;
}
/**
 * Reverses elements (materializes the iterable).
 */
export function* reverse(iterable) {
    const array = Array.from(iterable);
    array.reverse();
    yield* array;
}
// ============================================================================
// Distinct and uniqueness
// ============================================================================
/**
 * Removes duplicate elements (by reference or key function).
 */
export function* distinct(iterable, keyFn) {
    const seen = new Set();
    for (const value of iterable) {
        const key = (keyFn ? keyFn(value) : value);
        if (!seen.has(key)) {
            seen.add(key);
            yield value;
        }
    }
}
/**
 * Removes consecutive duplicates.
 */
export function* distinctConsecutive(iterable, keyFn) {
    let lastKey;
    let first = true;
    for (const value of iterable) {
        const key = (keyFn ? keyFn(value) : value);
        if (first || key !== lastKey) {
            yield value;
            lastKey = key;
            first = false;
        }
    }
}
// ============================================================================
// Peeking and side effects
// ============================================================================
/**
 * Performs a side effect for each element without modifying the stream.
 */
export function* tap(iterable, fn) {
    let index = 0;
    for (const value of iterable) {
        fn(value, index++);
        yield value;
    }
}
// ============================================================================
// Predicates and checks
// ============================================================================
/**
 * Returns true if any element matches the predicate.
 */
export function some(iterable, predicate) {
    for (const value of iterable) {
        if (predicate(value))
            return true;
    }
    return false;
}
/**
 * Returns true if all elements match the predicate.
 */
export function every(iterable, predicate) {
    for (const value of iterable) {
        if (!predicate(value))
            return false;
    }
    return true;
}
/**
 * Returns true if no elements match the predicate.
 */
export function none(iterable, predicate) {
    return !some(iterable, predicate);
}
/**
 * Finds the first element matching the predicate.
 */
export function find(iterable, predicate) {
    for (const value of iterable) {
        if (predicate(value))
            return value;
    }
    return undefined;
}
/**
 * Counts elements (optionally matching a predicate).
 */
export function count(iterable, predicate) {
    let count = 0;
    for (const value of iterable) {
        if (!predicate || predicate(value)) {
            count++;
        }
    }
    return count;
}
// ============================================================================
// Min/Max
// ============================================================================
/**
 * Returns the minimum element.
 */
export function min(iterable, compare) {
    const cmp = compare || ((a, b) => a - b);
    let minValue;
    for (const value of iterable) {
        if (minValue === undefined || cmp(value, minValue) < 0) {
            minValue = value;
        }
    }
    return minValue;
}
/**
 * Returns the maximum element.
 */
export function max(iterable, compare) {
    const cmp = compare || ((a, b) => a - b);
    let maxValue;
    for (const value of iterable) {
        if (maxValue === undefined || cmp(value, maxValue) > 0) {
            maxValue = value;
        }
    }
    return maxValue;
}
/**
 * Returns the sum of elements.
 */
export function sum(iterable) {
    let total = 0;
    for (const value of iterable) {
        total += value;
    }
    return total;
}
/**
 * Returns the average of elements.
 */
export function average(iterable) {
    let total = 0;
    let count = 0;
    for (const value of iterable) {
        total += value;
        count++;
    }
    return count === 0 ? undefined : total / count;
}
// ============================================================================
// Terminal operations (materialization)
// ============================================================================
/**
 * Collects elements into an array.
 */
export function toArray(iterable) {
    return Array.from(iterable);
}
/**
 * Collects elements into a Set.
 */
export function toSet(iterable) {
    return new Set(iterable);
}
/**
 * Collects elements into a Map.
 */
export function toMap(iterable, keyFn, valueFn) {
    const map = new Map();
    for (const value of iterable) {
        map.set(keyFn(value), valueFn(value));
    }
    return map;
}
// ============================================================================
// Pipe utility for composition
// ============================================================================
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
export function pipe(value, ...fns) {
    return fns.reduce((acc, fn) => fn(acc), value);
}
//# sourceMappingURL=iter.js.map