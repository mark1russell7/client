/**
 * Universal Error System
 *
 * Protocol-agnostic error handling with rich metadata.
 *
 * @example
 * ```typescript
 * import { createError, formatError } from "@common/client/errors";
 *
 * // Create rich error
 * const error = createError("TIMEOUT", {
 *   requestId: "req-123",
 *   transport: "http",
 *   method: { service: "users", operation: "get" },
 * });
 *
 * // Access metadata
 * console.log(error.metadata.summary);      // "Request timed out"
 * console.log(error.metadata.detail);       // Full explanation
 * console.log(error.metadata.userMessage);  // User-friendly message
 * console.log(error.metadata.devMessage);   // Developer diagnostic
 * console.log(error.metadata.suggestions);  // Suggested actions
 * console.log(error.metadata.retryable);    // true
 *
 * // Format for logging
 * console.log(formatError(error));
 * ```
 */

// Types
export type {
  ErrorMetadata,
  ErrorRegistry,
  ErrorContext,
  RichError,
  ErrorFactory,
} from "./types.js";

export { ErrorSeverity, ErrorCategory } from "./types.js";

// Error Codes Enum
export { ErrorCode } from "./codes.js";

// Registry
export {
  ERROR_REGISTRY,
  getErrorMetadata,
  isKnownError,
  getErrorsByCategory,
  getRetryableErrors,
} from "./registry.js";

// Factory
export {
  createError,
  createErrorFromHTTPStatus,
  createErrorFromException,
  richErrorToStatus,
  formatError,
  isRetryable,
  isErrorCategory,
} from "./factory.js";

// HTTP Status Constants
export { HTTPStatus } from "./http-status.js";

// HTTP Errors
export {
  HTTP_ERROR_REGISTRY,
  httpStatusToErrorCode,
  errorCodeToHTTPStatus,
} from "./http-errors.js";
