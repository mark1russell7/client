/**
 * Common helper utilities for collections.
 *
 * Provides shared functionality to reduce code duplication across implementations.
 */
// ============================================================================
// Bounds checking utilities
// ============================================================================
/**
 * Checks if an index is within valid bounds [0, size).
 * Throws RangeError if out of bounds.
 *
 * @param index The index to check
 * @param size The size of the collection
 * @param collectionName Optional name for error message
 * @throws RangeError if index is out of bounds
 */
export function checkBounds(index, size, collectionName = "Collection") {
    if (index < 0 || index >= size) {
        throw new RangeError(`${collectionName}: Index ${index} out of bounds [0, ${size})`);
    }
}
/**
 * Checks if an index is valid for insertion [0, size].
 * Allows index === size for append operations.
 *
 * @param index The index to check
 * @param size The size of the collection
 * @param collectionName Optional name for error message
 * @throws RangeError if index is out of bounds
 */
export function checkInsertBounds(index, size, collectionName = "Collection") {
    if (index < 0 || index > size) {
        throw new RangeError(`${collectionName}: Index ${index} out of bounds [0, ${size}]`);
    }
}
/**
 * Checks if a range [start, end) is valid.
 *
 * @param start Start index (inclusive)
 * @param end End index (exclusive)
 * @param size The size of the collection
 * @param collectionName Optional name for error message
 * @throws RangeError if range is invalid
 */
export function checkRangeBounds(start, end, size, collectionName = "Collection") {
    if (start < 0 || end > size || start > end) {
        throw new RangeError(`${collectionName}: Invalid range [${start}, ${end}) for size ${size}`);
    }
}
// ============================================================================
// Equality and search utilities
// ============================================================================
/**
 * Finds the index of an element in an array using custom equality.
 *
 * @param array The array to search
 * @param element The element to find
 * @param eq Equality function
 * @returns Index of element, or -1 if not found
 */
export function findIndex(array, element, eq) {
    for (let i = 0; i < array.length; i++) {
        if (eq(array[i], element)) {
            return i;
        }
    }
    return -1;
}
/**
 * Finds the last index of an element in an array using custom equality.
 *
 * @param array The array to search
 * @param element The element to find
 * @param eq Equality function
 * @returns Last index of element, or -1 if not found
 */
export function findLastIndex(array, element, eq) {
    for (let i = array.length - 1; i >= 0; i--) {
        if (eq(array[i], element)) {
            return i;
        }
    }
    return -1;
}
/**
 * Checks if an array contains an element using custom equality.
 *
 * @param array The array to search
 * @param element The element to find
 * @param eq Equality function
 * @returns true if element is found
 */
export function arrayContains(array, element, eq) {
    return findIndex(array, element, eq) !== -1;
}
/**
 * Removes the first occurrence of an element from an array.
 *
 * @param array The array to modify
 * @param element The element to remove
 * @param eq Equality function
 * @returns true if element was found and removed
 */
export function arrayRemove(array, element, eq) {
    const index = findIndex(array, element, eq);
    if (index === -1)
        return false;
    array.splice(index, 1);
    return true;
}
/**
 * Removes all occurrences of an element from an array.
 *
 * @param array The array to modify
 * @param element The element to remove
 * @param eq Equality function
 * @returns Number of elements removed
 */
export function arrayRemoveAll(array, element, eq) {
    let count = 0;
    for (let i = array.length - 1; i >= 0; i--) {
        if (eq(array[i], element)) {
            array.splice(i, 1);
            count++;
        }
    }
    return count;
}
// ============================================================================
// Iterator utilities
// ============================================================================
/**
 * Creates a simple iterator for an array.
 *
 * @param array The array to iterate
 * @returns Iterator over the array
 */
export function* arrayIterator(array) {
    yield* array;
}
/**
 * Creates a reversed iterator for an array.
 *
 * @param array The array to iterate
 * @returns Reversed iterator over the array
 */
export function* reverseArrayIterator(array) {
    for (let i = array.length - 1; i >= 0; i--) {
        yield array[i];
    }
}
/**
 * Converts an iterable to an array.
 *
 * @param iterable The iterable to convert
 * @returns Array containing all elements
 */
export function toArray(iterable) {
    return Array.from(iterable);
}
// ============================================================================
// Validation utilities
// ============================================================================
/**
 * Ensures a value is not null or undefined.
 *
 * @param value The value to check
 * @param message Error message
 * @returns The non-null value
 * @throws Error if value is null or undefined
 */
export function requireNonNull(value, message = "Value cannot be null or undefined") {
    if (value === null || value === undefined) {
        throw new Error(message);
    }
    return value;
}
/**
 * Ensures a collection is not empty.
 *
 * @param size Current size
 * @param collectionName Optional name for error message
 * @throws Error if collection is empty
 */
export function requireNonEmpty(size, collectionName = "Collection") {
    if (size === 0) {
        throw new Error(`${collectionName} is empty`);
    }
}
// ============================================================================
// Math utilities
// ============================================================================
/**
 * Clamps a value between min and max.
 *
 * @param value The value to clamp
 * @param min Minimum value
 * @param max Maximum value
 * @returns Clamped value
 */
export function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
/**
 * Calculates hash code for a string.
 * Uses Java's String.hashCode() algorithm.
 *
 * @param str The string to hash
 * @returns Hash code
 */
export function stringHashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
    }
    return hash;
}
//# sourceMappingURL=helpers.js.map