/**
 * Default implementations of equality, hashing, and comparison functions.
 *
 * Provides sensible defaults for primitive types and utilities for
 * creating custom comparators.
 */
import type { Eq, Hash, Compare } from "../core/traits.js";
/**
 * Default equality using strict equality (===).
 * Works for primitives and reference equality for objects.
 */
export declare const defaultEq: Eq<any>;
/**
 * Structural equality for objects (shallow comparison of properties).
 * Compares own enumerable properties using ===.
 */
export declare const shallowEq: Eq<any>;
/**
 * Deep structural equality (recursive comparison).
 * Handles nested objects and arrays.
 */
export declare const deepEq: Eq<any>;
/**
 * Equality by comparing a specific property.
 *
 * @example
 * const userEq = eqBy<User, 'id'>('id')
 * // or with accessor function:
 * const userEq = eqBy<User>((u) => u.id)
 */
export declare const eqBy: <T, K extends keyof T = keyof T>(keyOrFn: K | ((value: T) => any)) => Eq<T>;
/**
 * Default hash function for primitives and objects.
 * For objects, hashes the JSON string representation.
 */
export declare const defaultHash: Hash<any>;
/**
 * Hash function for strings using djb2 algorithm.
 */
export declare const hashString: (str: string) => number;
/**
 * Hash function for numbers.
 */
export declare const hashNumber: (num: number) => number;
/**
 * Combine multiple hash values.
 * Useful for hashing objects with multiple fields.
 *
 * @example
 * const pointHash: Hash<Point> = (p) =>
 *   combineHashes(hashNumber(p.x), hashNumber(p.y))
 */
export declare const combineHashes: (...hashes: number[]) => number;
/**
 * Create a hash function that hashes by a specific property.
 *
 * @example
 * const userHash = hashBy<User>((u) => u.id)
 */
export declare const hashBy: <T>(accessor: (value: T) => any) => Hash<T>;
/**
 * Natural ordering comparison for primitives.
 * Numbers, strings, booleans, dates are compared naturally.
 */
export declare const defaultCompare: Compare<any>;
/**
 * Numeric comparison (for numbers).
 */
export declare const numberCompare: Compare<number>;
/**
 * String comparison using locale-aware sorting.
 */
export declare const stringCompare: Compare<string>;
/**
 * Case-insensitive string comparison.
 */
export declare const stringCompareIgnoreCase: Compare<string>;
/**
 * Date comparison.
 */
export declare const dateCompare: Compare<Date>;
/**
 * Boolean comparison (false < true).
 */
export declare const booleanCompare: Compare<boolean>;
/**
 * Reverses a comparator.
 *
 * @example
 * const descending = reversed(numberCompare)
 */
export declare const reversed: <T>(compare: Compare<T>) => Compare<T>;
/**
 * Creates a comparator that compares by a specific property or function.
 *
 * @example
 * const byAge = comparing<Person>((p) => p.age)
 * const byName = comparing<Person, 'name'>('name')
 */
export declare const comparing: <T, K extends keyof T = keyof T>(keyOrFn: K | ((value: T) => any), compare?: Compare<any>) => Compare<T>;
/**
 * Chains comparators. If the first comparator returns 0 (equal),
 * tries the next comparator, and so on.
 *
 * @example
 * const userCompare = thenComparing(
 *   comparing<User>('lastName'),
 *   comparing<User>('firstName'),
 *   comparing<User>('age')
 * )
 */
export declare const thenComparing: <T>(...comparators: Compare<T>[]) => Compare<T>;
/**
 * Creates a comparator that treats null/undefined as less than all other values.
 *
 * @example
 * const compare = nullsFirst(numberCompare)
 */
export declare const nullsFirst: <T>(compare: Compare<T>) => Compare<T | null | undefined>;
/**
 * Creates a comparator that treats null/undefined as greater than all other values.
 *
 * @example
 * const compare = nullsLast(numberCompare)
 */
export declare const nullsLast: <T>(compare: Compare<T>) => Compare<T | null | undefined>;
/**
 * Creates a comparator from a key extraction function.
 * Elements are compared by their extracted keys.
 *
 * @example
 * const byLength = comparingKey<string>((s) => s.length)
 */
export declare const comparingKey: <T, K>(keyExtractor: (value: T) => K, keyCompare?: Compare<K>) => Compare<T>;
//# sourceMappingURL=defaults.d.ts.map