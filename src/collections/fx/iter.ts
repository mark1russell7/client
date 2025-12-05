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
export function* map<T, U>(
  iterable: Iterable<T>,
  fn: (value: T, index: number) => U
): Generator<U> {
  let index = 0;
  for (const value of iterable) {
    yield fn(value, index++);
  }
}

/**
 * Filters elements based on a predicate.
 */
export function* filter<T>(
  iterable: Iterable<T>,
  predicate: (value: T, index: number) => boolean
): Generator<T> {
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
export function* flatMap<T, U>(
  iterable: Iterable<T>,
  fn: (value: T, index: number) => Iterable<U>
): Generator<U> {
  let index = 0;
  for (const value of iterable) {
    yield* fn(value, index++);
  }
}

/**
 * Flattens a nested iterable.
 */
export function* flatten<T>(iterable: Iterable<Iterable<T>>): Generator<T> {
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
export function* take<T>(iterable: Iterable<T>, n: number): Generator<T> {
  let count = 0;
  for (const value of iterable) {
    if (count++ >= n) break;
    yield value;
  }
}

/**
 * Skips the first n elements.
 */
export function* skip<T>(iterable: Iterable<T>, n: number): Generator<T> {
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
export function* takeWhile<T>(
  iterable: Iterable<T>,
  predicate: (value: T) => boolean
): Generator<T> {
  for (const value of iterable) {
    if (!predicate(value)) break;
    yield value;
  }
}

/**
 * Skips elements while predicate is true.
 */
export function* skipWhile<T>(
  iterable: Iterable<T>,
  predicate: (value: T) => boolean
): Generator<T> {
  let skipping = true;
  for (const value of iterable) {
    if (skipping && predicate(value)) continue;
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
export function* concat<T>(...iterables: Iterable<T>[]): Generator<T> {
  for (const iterable of iterables) {
    yield* iterable;
  }
}

/**
 * Zips multiple iterables together.
 */
export function* zip<T extends any[]>(
  ...iterables: { [K in keyof T]: Iterable<T[K]> }
): Generator<T> {
  const iterators = iterables.map((it) => it[Symbol.iterator]());

  while (true) {
    const results = iterators.map((it) => it.next());
    if (results.some((r) => r.done)) break;
    yield results.map((r) => r.value) as T;
  }
}

/**
 * Zips with index.
 */
export function* enumerate<T>(iterable: Iterable<T>): Generator<[number, T]> {
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
export function* chunk<T>(iterable: Iterable<T>, size: number): Generator<T[]> {
  let chunk: T[] = [];
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
export function* window<T>(iterable: Iterable<T>, size: number): Generator<T[]> {
  const window: T[] = [];
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
export function partition<T>(
  iterable: Iterable<T>,
  predicate: (value: T) => boolean
): [T[], T[]] {
  const truthy: T[] = [];
  const falsy: T[] = [];

  for (const value of iterable) {
    if (predicate(value)) {
      truthy.push(value);
    } else {
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
export function reduce<T, U>(
  iterable: Iterable<T>,
  fn: (acc: U, value: T, index: number) => U,
  initial: U
): U {
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
export function* scan<T, U>(
  iterable: Iterable<T>,
  fn: (acc: U, value: T) => U,
  initial: U
): Generator<U> {
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
export function* sort<T>(
  iterable: Iterable<T>,
  compare?: (a: T, b: T) => number
): Generator<T> {
  const array = Array.from(iterable);
  array.sort(compare);
  yield* array;
}

/**
 * Reverses elements (materializes the iterable).
 */
export function* reverse<T>(iterable: Iterable<T>): Generator<T> {
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
export function* distinct<T, K = T>(
  iterable: Iterable<T>,
  keyFn?: (value: T) => K
): Generator<T> {
  const seen = new Set<K>();
  for (const value of iterable) {
    const key = (keyFn ? keyFn(value) : value) as K;
    if (!seen.has(key)) {
      seen.add(key);
      yield value;
    }
  }
}

/**
 * Removes consecutive duplicates.
 */
export function* distinctConsecutive<T, K = T>(
  iterable: Iterable<T>,
  keyFn?: (value: T) => K
): Generator<T> {
  let lastKey: K | undefined;
  let first = true;

  for (const value of iterable) {
    const key = (keyFn ? keyFn(value) : value) as K;
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
export function* tap<T>(
  iterable: Iterable<T>,
  fn: (value: T, index: number) => void
): Generator<T> {
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
export function some<T>(
  iterable: Iterable<T>,
  predicate: (value: T) => boolean
): boolean {
  for (const value of iterable) {
    if (predicate(value)) return true;
  }
  return false;
}

/**
 * Returns true if all elements match the predicate.
 */
export function every<T>(
  iterable: Iterable<T>,
  predicate: (value: T) => boolean
): boolean {
  for (const value of iterable) {
    if (!predicate(value)) return false;
  }
  return true;
}

/**
 * Returns true if no elements match the predicate.
 */
export function none<T>(
  iterable: Iterable<T>,
  predicate: (value: T) => boolean
): boolean {
  return !some(iterable, predicate);
}

/**
 * Finds the first element matching the predicate.
 */
export function find<T>(
  iterable: Iterable<T>,
  predicate: (value: T) => boolean
): T | undefined {
  for (const value of iterable) {
    if (predicate(value)) return value;
  }
  return undefined;
}

/**
 * Counts elements (optionally matching a predicate).
 */
export function count<T>(
  iterable: Iterable<T>,
  predicate?: (value: T) => boolean
): number {
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
export function min<T>(
  iterable: Iterable<T>,
  compare?: (a: T, b: T) => number
): T | undefined {
  const cmp = compare || ((a: any, b: any) => a - b);
  let minValue: T | undefined;

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
export function max<T>(
  iterable: Iterable<T>,
  compare?: (a: T, b: T) => number
): T | undefined {
  const cmp = compare || ((a: any, b: any) => a - b);
  let maxValue: T | undefined;

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
export function sum(iterable: Iterable<number>): number {
  let total = 0;
  for (const value of iterable) {
    total += value;
  }
  return total;
}

/**
 * Returns the average of elements.
 */
export function average(iterable: Iterable<number>): number | undefined {
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
export function toArray<T>(iterable: Iterable<T>): T[] {
  return Array.from(iterable);
}

/**
 * Collects elements into a Set.
 */
export function toSet<T>(iterable: Iterable<T>): Set<T> {
  return new Set(iterable);
}

/**
 * Collects elements into a Map.
 */
export function toMap<T, K, V>(
  iterable: Iterable<T>,
  keyFn: (value: T) => K,
  valueFn: (value: T) => V
): Map<K, V> {
  const map = new Map<K, V>();
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
export function pipe<T>(
  value: T,
  ...fns: Array<(value: any) => any>
): any {
  return fns.reduce((acc, fn) => fn(acc), value);
}
