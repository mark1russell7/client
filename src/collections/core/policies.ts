/**
 * Policy types for configurable collection behaviors.
 *
 * Policies define how collections handle edge cases like overflow,
 * underflow, and eviction. These are used by behavior decorators
 * to provide flexible, composable behavior.
 */

// ============================================================================
// Overflow Policies - what to do when a bounded collection is full
// ============================================================================

/**
 * Policy for handling overflow when adding to a full bounded collection.
 *
 * - 'throw': Throw an error when attempting to add to a full collection
 * - 'drop-oldest': Remove the oldest element and add the new one
 * - 'drop-newest': Ignore the new element (don't add it)
 * - 'reject': Return false/None but don't throw (graceful failure)
 * - 'grow': Automatically increase capacity (becomes unbounded)
 * - 'block': For async collections, wait until space is available
 */
export type OverflowPolicy =
  | "throw"
  | "drop-oldest"
  | "drop-newest"
  | "reject"
  | "grow"
  | "block";

/**
 * Context information provided when overflow occurs.
 */
export interface OverflowContext<T> {
  /** The element that triggered the overflow. */
  readonly newElement: T;
  /** Current size of the collection. */
  readonly currentSize: number;
  /** Maximum capacity of the collection. */
  readonly capacity: number;
  /** Timestamp when overflow occurred. */
  readonly timestamp: number;
}

/**
 * Callback invoked when overflow occurs.
 * Can be used for logging, metrics, or custom handling.
 */
export type OverflowHandler<T> = (context: OverflowContext<T>) => void;

// ============================================================================
// Underflow Policies - what to do when removing from an empty collection
// ============================================================================

/**
 * Policy for handling underflow when removing from an empty collection.
 *
 * - 'throw': Throw an error when attempting to remove from empty collection
 * - 'return-none': Return None/undefined (graceful failure)
 * - 'return-default': Return a default value provided by user
 * - 'block': For async collections, wait until an element is available
 */
export type UnderflowPolicy =
  | "throw"
  | "return-none"
  | "return-default"
  | "block";

/**
 * Context information provided when underflow occurs.
 */
export interface UnderflowContext {
  /** The operation that triggered the underflow. */
  readonly operation: string;
  /** Timestamp when underflow occurred. */
  readonly timestamp: number;
}

/**
 * Callback invoked when underflow occurs.
 */
export type UnderflowHandler = (context: UnderflowContext) => void;

// ============================================================================
// Eviction Policies - how to choose which element to remove
// ============================================================================

/**
 * Policy for choosing which element to evict from a bounded collection.
 *
 * - 'lru': Least Recently Used - evict element not accessed for longest time
 * - 'lfu': Least Frequently Used - evict element accessed least often
 * - 'fifo': First In First Out - evict oldest inserted element
 * - 'lifo': Last In First Out - evict newest inserted element (stack-like)
 * - 'random': Evict a random element
 * - 'ttl': Time To Live - evict elements that have expired
 * - 'priority': Evict element with lowest priority
 * - 'custom': User-provided eviction function
 */
export type EvictionPolicy =
  | "lru"
  | "lfu"
  | "fifo"
  | "lifo"
  | "random"
  | "ttl"
  | "priority"
  | "custom";

/**
 * Metadata tracked for eviction decisions.
 */
export interface EvictionMetadata {
  /** When the element was inserted. */
  readonly insertedAt: number;
  /** When the element was last accessed. */
  lastAccessedAt: number;
  /** How many times the element has been accessed. */
  accessCount: number;
  /** Time-to-live expiration timestamp (if applicable). */
  readonly expiresAt?: number;
  /** Priority value (higher = more important, if applicable). */
  readonly priority?: number;
}

/**
 * Information about an element that can be evicted.
 */
export interface EvictionCandidate<T> {
  /** The element value. */
  readonly element: T;
  /** Eviction metadata for this element. */
  readonly metadata: EvictionMetadata;
}

/**
 * Custom eviction function.
 * Given candidates, returns the element to evict.
 */
export type EvictionSelector<T> = (
  candidates: EvictionCandidate<T>[]
) => T | undefined;

// ============================================================================
// Retry Policies - for async operations
// ============================================================================

/**
 * Policy for retrying failed async operations.
 */
export interface RetryPolicy {
  /** Maximum number of retry attempts. */
  readonly maxAttempts: number;
  /** Initial delay in milliseconds. */
  readonly initialDelay: number;
  /** Backoff strategy. */
  readonly backoff: "none" | "linear" | "exponential";
  /** Maximum delay cap (for backoff). */
  readonly maxDelay?: number;
  /** Jitter to add randomness and avoid thundering herd. */
  readonly jitter?: boolean;
}

/**
 * Context for retry decisions.
 */
export interface RetryContext {
  /** Current attempt number (1-indexed). */
  readonly attempt: number;
  /** The error that caused the retry. */
  readonly error: unknown;
  /** Elapsed time since first attempt. */
  readonly elapsedMs: number;
}

/**
 * Callback to determine if an error is retryable.
 */
export type RetryPredicate = (context: RetryContext) => boolean;

// ============================================================================
// Conflict Resolution Policies - for concurrent modifications
// ============================================================================

/**
 * Policy for resolving conflicts when same key is modified concurrently.
 *
 * - 'last-write-wins': Most recent write takes precedence
 * - 'first-write-wins': First write takes precedence
 * - 'merge': Call merge function to combine values
 * - 'throw': Throw an error on conflict
 */
export type ConflictResolutionPolicy =
  | "last-write-wins"
  | "first-write-wins"
  | "merge"
  | "throw";

/**
 * Function to merge conflicting values.
 */
export type MergeFunction<T> = (current: T, incoming: T) => T;

// ============================================================================
// Compaction Policies - for memory management
// ============================================================================

/**
 * Policy for when to compact internal storage.
 */
export interface CompactionPolicy {
  /** Compact when capacity utilization drops below this ratio (0-1). */
  readonly minLoadFactor?: number;
  /** Compact when wasted space exceeds this many elements. */
  readonly maxWastedSpace?: number;
  /** Automatically compact on every removal. */
  readonly autoCompact?: boolean;
}

// ============================================================================
// Growth Policies - for dynamic capacity
// ============================================================================

/**
 * Policy for how to grow capacity when needed.
 */
export interface GrowthPolicy {
  /** Growth strategy. */
  readonly strategy: "double" | "linear" | "golden-ratio" | "custom";
  /** For linear growth, how many elements to add. */
  readonly linearIncrement?: number;
  /** For custom growth, a function to calculate new capacity. */
  readonly customGrowth?: (currentCapacity: number) => number;
  /** Maximum capacity limit (prevent unbounded growth). */
  readonly maxCapacity?: number;
}

// ============================================================================
// Validation Policies - for type checking
// ============================================================================

/**
 * Validation action when an invalid element is encountered.
 *
 * - 'throw': Throw an error
 * - 'drop': Silently drop the invalid element
 * - 'coerce': Attempt to coerce to valid type
 * - 'log': Log warning but allow
 */
export type ValidationPolicy = "throw" | "drop" | "coerce" | "log";

/**
 * Context for validation failures.
 */
export interface ValidationContext<T> {
  /** The invalid element. */
  readonly element: T;
  /** Validation error message/details. */
  readonly error: unknown;
  /** The operation that triggered validation. */
  readonly operation: string;
}

/**
 * Callback invoked on validation failures.
 */
export type ValidationHandler<T> = (context: ValidationContext<T>) => void;

// ============================================================================
// Default policies
// ============================================================================

/**
 * Default overflow policy: throw an error.
 */
export const DEFAULT_OVERFLOW_POLICY: OverflowPolicy = "throw";

/**
 * Default underflow policy: throw an error.
 */
export const DEFAULT_UNDERFLOW_POLICY: UnderflowPolicy = "throw";

/**
 * Default eviction policy: FIFO (oldest first).
 */
export const DEFAULT_EVICTION_POLICY: EvictionPolicy = "fifo";

/**
 * Default retry policy: 3 attempts with exponential backoff.
 */
export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  initialDelay: 100,
  backoff: "exponential",
  maxDelay: 5000,
  jitter: true,
};

/**
 * Default conflict resolution: last write wins.
 */
export const DEFAULT_CONFLICT_POLICY: ConflictResolutionPolicy =
  "last-write-wins";

/**
 * Default growth policy: double capacity.
 */
export const DEFAULT_GROWTH_POLICY: GrowthPolicy = {
  strategy: "double",
  maxCapacity: Number.MAX_SAFE_INTEGER,
};

/**
 * Default validation policy: throw on invalid.
 */
export const DEFAULT_VALIDATION_POLICY: ValidationPolicy = "throw";
