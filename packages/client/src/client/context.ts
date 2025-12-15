/**
 * Client Context System
 *
 * Provides hierarchical context passing for middleware configuration.
 * Context can be set at client-level, inherited by child clients, and
 * overridden per-call.
 *
 * @example
 * ```typescript
 * // Client-level context
 * const authedClient = client.withContext({
 *   auth: { token: "user-token" },
 *   timeout: { overall: 5000 }
 * });
 *
 * // Per-call override
 * await authedClient.call(method, payload, {
 *   context: { retry: { maxAttempts: 10 } }
 * });
 * ```
 */

import type { Metadata } from "./types.js";
import type {
  RetryContext,
  CacheContext,
  TimeoutContext,
  AuthContext,
  TracingContext,
  CircuitBreakerContext,
  RateLimitContext,
  BatchingContext,
  PaginationContext,
} from "./middleware/contexts.js";

// =============================================================================
// Context Input Types
// =============================================================================

/**
 * All possible middleware context fields that can be passed by the user.
 * This is the union of all middleware context types, made partial for input.
 */
export type MiddlewareContextFields = Partial<
  RetryContext &
    CacheContext &
    TimeoutContext &
    AuthContext &
    TracingContext &
    CircuitBreakerContext &
    RateLimitContext &
    BatchingContext &
    PaginationContext
>;

/**
 * Context input type for client.withContext() and per-call context.
 *
 * When TContext is the accumulated context type from middleware,
 * this allows passing any subset of that context plus any middleware fields.
 */
export type ClientContextInput<TContext = {}> = TContext extends object
  ? Partial<TContext> & MiddlewareContextFields
  : MiddlewareContextFields;

// =============================================================================
// Call Options
// =============================================================================

/**
 * Schema definition for per-call validation override.
 * Only available when Zod middleware is installed.
 */
export interface SchemaOverride {
  /** Input/request payload schema */
  input?: unknown; // z.ZodType when zod is installed
  /** Output/response payload schema */
  output?: unknown; // z.ZodType when zod is installed
}

/**
 * Options for client.call() and client.stream() methods.
 *
 * Provides fine-grained control over individual requests including
 * context overrides, raw metadata, cancellation, and validation.
 *
 * @example
 * ```typescript
 * // Full options example
 * await client.call(method, payload, {
 *   context: { auth: { token: "override-token" } },
 *   metadata: { "x-custom-header": "value" },
 *   signal: abortController.signal,
 *   schema: { input: MyInputSchema, output: MyOutputSchema }
 * });
 * ```
 */
export interface CallOptions<TContext = {}> {
  /**
   * Per-call context override.
   * Merged with client context, with per-call values taking priority.
   */
  context?: ClientContextInput<TContext>;

  /**
   * Additional raw metadata to include in the request.
   * Applied after context merge, so takes highest priority.
   */
  metadata?: Metadata;

  /**
   * Abort signal for request cancellation.
   */
  signal?: AbortSignal;

  /**
   * Per-call schema override for validation.
   * Requires Zod middleware to be installed.
   */
  schema?: SchemaOverride;
}

// =============================================================================
// Context Merging
// =============================================================================

/**
 * Deep merge context objects with later values taking priority.
 *
 * Merges nested objects recursively, while replacing primitives and arrays.
 * Undefined values are skipped (don't override existing values).
 *
 * @example
 * ```typescript
 * const base = { auth: { token: "a", userId: "1" }, timeout: { overall: 5000 } };
 * const override = { auth: { token: "b" }, retry: { maxAttempts: 3 } };
 *
 * mergeContext(base, override);
 * // Result: {
 * //   auth: { token: "b", userId: "1" },
 * //   timeout: { overall: 5000 },
 * //   retry: { maxAttempts: 3 }
 * // }
 * ```
 */
export function mergeContext<T extends object>(
  base: T | undefined,
  ...overrides: (Partial<T> | undefined)[]
): T {
  const result = { ...(base ?? {}) } as T;

  for (const override of overrides) {
    if (!override) continue;

    for (const [key, value] of Object.entries(override)) {
      if (value === undefined) continue;

      if (isPlainObject(value) && isPlainObject((result as Record<string, unknown>)[key])) {
        // Deep merge objects
        (result as Record<string, unknown>)[key] = mergeContext(
          (result as Record<string, unknown>)[key] as object,
          value,
        );
      } else {
        // Replace primitives, arrays, and other values
        (result as Record<string, unknown>)[key] = value;
      }
    }
  }

  return result;
}

/**
 * Check if a value is a plain object (not array, null, Date, etc.).
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

// =============================================================================
// Type Helpers
// =============================================================================

/**
 * Check if options object is CallOptions or legacy Metadata.
 *
 * CallOptions has at least one of: context, signal, schema
 * Metadata is a plain object without these specific keys.
 */
export function isCallOptions<TContext>(
  options: CallOptions<TContext> | Metadata | undefined,
): options is CallOptions<TContext> {
  if (!options || typeof options !== "object") {
    return false;
  }

  return "context" in options || "signal" in options || "schema" in options;
}

/**
 * Normalize call options to always be CallOptions format.
 * Handles backward compatibility with legacy Metadata parameter.
 */
export function normalizeCallOptions<TContext>(
  options: CallOptions<TContext> | Metadata | undefined,
): CallOptions<TContext> {
  if (!options) {
    return {};
  }

  if (isCallOptions<TContext>(options)) {
    return options;
  }

  // Legacy: raw Metadata object
  return { metadata: options };
}
