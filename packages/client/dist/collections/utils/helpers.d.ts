/**
 * Common helper utilities for collections.
 *
 * Provides shared functionality to reduce code duplication across implementations.
 */
import type { Eq } from "../core/traits.js";
/**
 * Checks if an index is within valid bounds [0, size).
 * Throws RangeError if out of bounds.
 *
 * @param index The index to check
 * @param size The size of the collection
 * @param collectionName Optional name for error message
 * @throws RangeError if index is out of bounds
 */
export declare function checkBounds(index: number, size: number, collectionName?: string): void;
/**
 * Checks if an index is valid for insertion [0, size].
 * Allows index === size for append operations.
 *
 * @param index The index to check
 * @param size The size of the collection
 * @param collectionName Optional name for error message
 * @throws RangeError if index is out of bounds
 */
export declare function checkInsertBounds(index: number, size: number, collectionName?: string): void;
/**
 * Checks if a range [start, end) is valid.
 *
 * @param start Start index (inclusive)
 * @param end End index (exclusive)
 * @param size The size of the collection
 * @param collectionName Optional name for error message
 * @throws RangeError if range is invalid
 */
export declare function checkRangeBounds(start: number, end: number, size: number, collectionName?: string): void;
/**
 * Finds the index of an element in an array using custom equality.
 *
 * @param array The array to search
 * @param element The element to find
 * @param eq Equality function
 * @returns Index of element, or -1 if not found
 */
export declare function findIndex<T>(array: T[], element: T, eq: Eq<T>): number;
/**
 * Finds the last index of an element in an array using custom equality.
 *
 * @param array The array to search
 * @param element The element to find
 * @param eq Equality function
 * @returns Last index of element, or -1 if not found
 */
export declare function findLastIndex<T>(array: T[], element: T, eq: Eq<T>): number;
/**
 * Checks if an array contains an element using custom equality.
 *
 * @param array The array to search
 * @param element The element to find
 * @param eq Equality function
 * @returns true if element is found
 */
export declare function arrayContains<T>(array: T[], element: T, eq: Eq<T>): boolean;
/**
 * Removes the first occurrence of an element from an array.
 *
 * @param array The array to modify
 * @param element The element to remove
 * @param eq Equality function
 * @returns true if element was found and removed
 */
export declare function arrayRemove<T>(array: T[], element: T, eq: Eq<T>): boolean;
/**
 * Removes all occurrences of an element from an array.
 *
 * @param array The array to modify
 * @param element The element to remove
 * @param eq Equality function
 * @returns Number of elements removed
 */
export declare function arrayRemoveAll<T>(array: T[], element: T, eq: Eq<T>): number;
/**
 * Creates a simple iterator for an array.
 *
 * @param array The array to iterate
 * @returns Iterator over the array
 */
export declare function arrayIterator<T>(array: T[]): Iterator<T>;
/**
 * Creates a reversed iterator for an array.
 *
 * @param array The array to iterate
 * @returns Reversed iterator over the array
 */
export declare function reverseArrayIterator<T>(array: T[]): Iterator<T>;
/**
 * Converts an iterable to an array.
 *
 * @param iterable The iterable to convert
 * @returns Array containing all elements
 */
export declare function toArray<T>(iterable: Iterable<T>): T[];
/**
 * Ensures a value is not null or undefined.
 *
 * @param value The value to check
 * @param message Error message
 * @returns The non-null value
 * @throws Error if value is null or undefined
 */
export declare function requireNonNull<T>(value: T | null | undefined, message?: string): T;
/**
 * Ensures a collection is not empty.
 *
 * @param size Current size
 * @param collectionName Optional name for error message
 * @throws Error if collection is empty
 */
export declare function requireNonEmpty(size: number, collectionName?: string): void;
/**
 * Clamps a value between min and max.
 *
 * @param value The value to clamp
 * @param min Minimum value
 * @param max Maximum value
 * @returns Clamped value
 */
export declare function clamp(value: number, min: number, max: number): number;
/**
 * Calculates hash code for a string.
 * Uses Java's String.hashCode() algorithm.
 *
 * @param str The string to hash
 * @returns Hash code
 */
export declare function stringHashCode(str: string): number;
//# sourceMappingURL=helpers.d.ts.map