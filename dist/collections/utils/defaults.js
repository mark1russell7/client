/**
 * Default implementations of equality, hashing, and comparison functions.
 *
 * Provides sensible defaults for primitive types and utilities for
 * creating custom comparators.
 */
// ============================================================================
// Default Equality
// ============================================================================
/**
 * Default equality using strict equality (===).
 * Works for primitives and reference equality for objects.
 */
export const defaultEq = (a, b) => a === b;
/**
 * Structural equality for objects (shallow comparison of properties).
 * Compares own enumerable properties using ===.
 */
export const shallowEq = (a, b) => {
    if (a === b)
        return true;
    if (typeof a !== "object" || typeof b !== "object")
        return false;
    if (a === null || b === null)
        return false;
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length)
        return false;
    for (const key of keysA) {
        if (!Object.prototype.hasOwnProperty.call(b, key))
            return false;
        if (a[key] !== b[key])
            return false;
    }
    return true;
};
/**
 * Deep structural equality (recursive comparison).
 * Handles nested objects and arrays.
 */
export const deepEq = (a, b) => {
    if (a === b)
        return true;
    if (typeof a !== typeof b)
        return false;
    if (typeof a !== "object" || a === null || b === null)
        return false;
    if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length)
            return false;
        for (let i = 0; i < a.length; i++) {
            if (!deepEq(a[i], b[i]))
                return false;
        }
        return true;
    }
    if (Array.isArray(a) !== Array.isArray(b))
        return false;
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length)
        return false;
    for (const key of keysA) {
        if (!Object.prototype.hasOwnProperty.call(b, key))
            return false;
        if (!deepEq(a[key], b[key]))
            return false;
    }
    return true;
};
/**
 * Equality by comparing a specific property.
 *
 * @example
 * const userEq = eqBy<User, 'id'>('id')
 * // or with accessor function:
 * const userEq = eqBy<User>((u) => u.id)
 */
export const eqBy = (keyOrFn) => {
    const accessor = typeof keyOrFn === "function" ? keyOrFn : (v) => v[keyOrFn];
    return (a, b) => accessor(a) === accessor(b);
};
// ============================================================================
// Default Hashing
// ============================================================================
/**
 * Default hash function for primitives and objects.
 * For objects, hashes the JSON string representation.
 */
export const defaultHash = (value) => {
    if (value === null)
        return 0;
    if (value === undefined)
        return 1;
    const type = typeof value;
    switch (type) {
        case "boolean":
            return value ? 1 : 0;
        case "number":
            return hashNumber(value);
        case "string":
            return hashString(value);
        case "symbol":
            return hashString(value.toString());
        case "bigint":
            return hashString(value.toString());
        case "object":
            // For objects, hash their JSON representation
            // This is not ideal for all cases but provides a reasonable default
            try {
                return hashString(JSON.stringify(value));
            }
            catch {
                // If JSON.stringify fails, fall back to toString
                return hashString(value.toString());
            }
        default:
            return 2;
    }
};
/**
 * Hash function for strings using djb2 algorithm.
 */
export const hashString = (str) => {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) + hash) + str.charCodeAt(i); // hash * 33 + c
        hash = hash & hash; // Convert to 32-bit integer
    }
    return hash >>> 0; // Convert to unsigned
};
/**
 * Hash function for numbers.
 */
export const hashNumber = (num) => {
    if (Number.isNaN(num))
        return 0;
    if (!Number.isFinite(num))
        return num > 0 ? 1 : -1;
    // For integers, use the number itself
    if (Number.isInteger(num)) {
        return num | 0; // Convert to 32-bit int
    }
    // For floats, hash the string representation
    return hashString(num.toString());
};
/**
 * Combine multiple hash values.
 * Useful for hashing objects with multiple fields.
 *
 * @example
 * const pointHash: Hash<Point> = (p) =>
 *   combineHashes(hashNumber(p.x), hashNumber(p.y))
 */
export const combineHashes = (...hashes) => {
    let combined = 0;
    for (const hash of hashes) {
        combined = ((combined << 5) - combined) + hash;
        combined = combined & combined; // Convert to 32-bit int
    }
    return combined >>> 0; // Convert to unsigned
};
/**
 * Create a hash function that hashes by a specific property.
 *
 * @example
 * const userHash = hashBy<User>((u) => u.id)
 */
export const hashBy = (accessor) => {
    return (value) => defaultHash(accessor(value));
};
// ============================================================================
// Default Comparison
// ============================================================================
/**
 * Natural ordering comparison for primitives.
 * Numbers, strings, booleans, dates are compared naturally.
 */
export const defaultCompare = (a, b) => {
    if (a === b)
        return 0;
    if (a === null || a === undefined)
        return -1;
    if (b === null || b === undefined)
        return 1;
    // Handle dates
    if (a instanceof Date && b instanceof Date) {
        return a.getTime() - b.getTime();
    }
    // Handle numbers
    if (typeof a === "number" && typeof b === "number") {
        if (Number.isNaN(a))
            return Number.isNaN(b) ? 0 : -1;
        if (Number.isNaN(b))
            return 1;
        return a - b;
    }
    // Handle strings
    if (typeof a === "string" && typeof b === "string") {
        return a.localeCompare(b);
    }
    // Handle booleans
    if (typeof a === "boolean" && typeof b === "boolean") {
        return a === b ? 0 : a ? 1 : -1;
    }
    // Fallback: convert to string and compare
    return String(a).localeCompare(String(b));
};
/**
 * Numeric comparison (for numbers).
 */
export const numberCompare = (a, b) => {
    if (Number.isNaN(a))
        return Number.isNaN(b) ? 0 : -1;
    if (Number.isNaN(b))
        return 1;
    return a - b;
};
/**
 * String comparison using locale-aware sorting.
 */
export const stringCompare = (a, b) => a.localeCompare(b);
/**
 * Case-insensitive string comparison.
 */
export const stringCompareIgnoreCase = (a, b) => a.toLowerCase().localeCompare(b.toLowerCase());
/**
 * Date comparison.
 */
export const dateCompare = (a, b) => a.getTime() - b.getTime();
/**
 * Boolean comparison (false < true).
 */
export const booleanCompare = (a, b) => a === b ? 0 : a ? 1 : -1;
// ============================================================================
// Comparator Combinators
// ============================================================================
/**
 * Reverses a comparator.
 *
 * @example
 * const descending = reversed(numberCompare)
 */
export const reversed = (compare) => (a, b) => compare(b, a);
/**
 * Creates a comparator that compares by a specific property or function.
 *
 * @example
 * const byAge = comparing<Person>((p) => p.age)
 * const byName = comparing<Person, 'name'>('name')
 */
export const comparing = (keyOrFn, compare = defaultCompare) => {
    const accessor = typeof keyOrFn === "function" ? keyOrFn : (v) => v[keyOrFn];
    return (a, b) => compare(accessor(a), accessor(b));
};
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
export const thenComparing = (...comparators) => {
    return (a, b) => {
        for (const compare of comparators) {
            const result = compare(a, b);
            if (result !== 0)
                return result;
        }
        return 0;
    };
};
/**
 * Creates a comparator that treats null/undefined as less than all other values.
 *
 * @example
 * const compare = nullsFirst(numberCompare)
 */
export const nullsFirst = (compare) => {
    return (a, b) => {
        if (a == null && b == null)
            return 0;
        if (a == null)
            return -1;
        if (b == null)
            return 1;
        return compare(a, b);
    };
};
/**
 * Creates a comparator that treats null/undefined as greater than all other values.
 *
 * @example
 * const compare = nullsLast(numberCompare)
 */
export const nullsLast = (compare) => {
    return (a, b) => {
        if (a == null && b == null)
            return 0;
        if (a == null)
            return 1;
        if (b == null)
            return -1;
        return compare(a, b);
    };
};
/**
 * Creates a comparator from a key extraction function.
 * Elements are compared by their extracted keys.
 *
 * @example
 * const byLength = comparingKey<string>((s) => s.length)
 */
export const comparingKey = (keyExtractor, keyCompare = defaultCompare) => {
    return (a, b) => keyCompare(keyExtractor(a), keyExtractor(b));
};
//# sourceMappingURL=defaults.js.map