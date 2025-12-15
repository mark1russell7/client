/**
 * Error Factory Functions
 *
 * Create rich errors from error codes with full metadata.
 * Zero magic strings - everything driven by registry.
 */
import { type RichError, type ErrorContext, type ErrorMetadata } from "./types.js";
import { ErrorCode } from "./codes.js";
/**
 * Create a rich error from an error code.
 *
 * @param code - Error code from registry
 * @param context - Runtime context (optional)
 * @param cause - Underlying error cause (optional)
 * @returns Rich error with full metadata
 *
 * @example
 * ```typescript
 * const error = createError("TIMEOUT", {
 *   requestId: "req-123",
 *   transport: "http",
 * });
 *
 * console.log(error.metadata.summary); // "Request timed out"
 * console.log(error.metadata.userMessage); // "The request took too long..."
 * console.log(error.metadata.suggestions); // ["Try again with longer timeout", ...]
 * ```
 */
export declare function createError(code: string, context?: Partial<ErrorContext>, cause?: Error): RichError;
/**
 * Create error from HTTP status code.
 *
 * Uses registry lookup - zero magic strings!
 *
 * @param status - HTTP status code
 * @param context - Runtime context
 * @returns Rich error with appropriate error code
 *
 * @example
 * ```typescript
 * const error = createErrorFromHTTPStatus(404, {
 *   requestId: "req-123",
 *   method: { service: "users", operation: "get" },
 * });
 * ```
 */
export declare function createErrorFromHTTPStatus(status: number, context?: Partial<ErrorContext>): RichError;
export type ErrorPattern = {
    code: ErrorCode;
    detect: (name: string, message: string) => boolean;
};
/**
 * Create error from native Error exception.
 *
 * Uses pattern matching - no scattered magic strings!
 *
 * @param error - Native Error object
 * @param context - Runtime context
 * @returns Rich error
 *
 * @example
 * ```typescript
 * try {
 *   await fetch(...);
 * } catch (err) {
 *   const richError = createErrorFromException(err as Error, {
 *     transport: "http",
 *   });
 * }
 * ```
 */
export declare function createErrorFromException(error: Error, context?: Partial<ErrorContext>): RichError;
/**
 * Convert RichError to Status for universal client.
 *
 * @param error - Rich error
 * @returns Status object
 */
export declare function richErrorToStatus(error: RichError): {
    type: "error";
    code: string;
    message: string;
    retryable: boolean;
    metadata: ErrorMetadata;
};
/**
 * Format error for logging.
 *
 * @param error - Rich error
 * @param includeStack - Include stack trace if cause exists
 * @returns Formatted error string
 */
export declare function formatError(error: RichError, includeStack?: boolean): string;
/**
 * Check if error is retryable.
 */
export declare function isRetryable(error: RichError): boolean;
/**
 * Check if error is in a specific category.
 */
export declare function isErrorCategory(error: RichError, category: string): boolean;
//# sourceMappingURL=factory.d.ts.map