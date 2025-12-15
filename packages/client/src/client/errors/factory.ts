/**
 * Error Factory Functions
 *
 * Create rich errors from error codes with full metadata.
 * Zero magic strings - everything driven by registry.
 */

import {
  type RichError,
  type ErrorContext,
  type ErrorMetadata,
} from "./types.js";
import { getErrorMetadata } from "./registry.js";
import { httpStatusToErrorCode } from "./http-errors.js";
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
export function createError(
  code: string,
  context?: Partial<ErrorContext>,
  cause?: Error
): RichError {
  const metadata = getErrorMetadata(code);

  const fullContext: ErrorContext = {
    timestamp: Date.now(),
    ...context,
  };

  return {
    code,
    metadata,
    context: fullContext,
    ...(cause && { cause }),
  };
}

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
export function createErrorFromHTTPStatus(
  status: number,
  context?: Partial<ErrorContext>
): RichError {
  // Use registry - no magic strings!
  const code = httpStatusToErrorCode(status);
  return createError(code, context);
}

export type ErrorPattern = {
  code: ErrorCode;
  detect: (name: string, message: string) => boolean;
}

/**
 * Error detection patterns.
 *
 * Maps error characteristics to error codes.
 * Uses ErrorCode enum - NO MAGIC STRINGS!
 */
const ERROR_PATTERNS : ErrorPattern[] = [
  {
    code: ErrorCode.ABORTED,
    detect: (name: string, message: string) =>
      name === "aborterror" || message.includes("abort"),
  },
  {
    code: ErrorCode.TIMEOUT,
    detect: (name: string, message: string) =>
      name === "timeouterror" ||
      message.includes("timeout") ||
      message.includes("timed out"),
  },
  {
    code: ErrorCode.DNS_ERROR,
    detect: (_name: string, message: string) =>
      message.includes("dns") ||
      message.includes("enotfound") ||
      message.includes("getaddrinfo"),
  },
  {
    code: ErrorCode.CONNECTION_REFUSED,
    detect: (_name: string, message: string) =>
      message.includes("econnrefused") ||
      message.includes("connection refused"),
  },
  {
    code: ErrorCode.NETWORK_ERROR,
    detect: (_name: string, message: string) =>
      message.includes("fetch") ||
      message.includes("network") ||
      message.includes("connection"),
  },
  {
    code: ErrorCode.PARSE_ERROR,
    detect: (_name: string, message: string) =>
      message.includes("parse") ||
      message.includes("json") ||
      message.includes("unexpected token"),
  },
  {
    code: ErrorCode.SERIALIZE_ERROR,
    detect: (_name: string, message: string) =>
      message.includes("serialize") ||
      message.includes("stringify") ||
      message.includes("circular"),
  },
] as const satisfies ErrorPattern[];

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
export function createErrorFromException(
  error: Error,
  context?: Partial<ErrorContext>
): RichError {
  const name = error.name?.toLowerCase() ?? "";
  const message = error.message?.toLowerCase() ?? "";

  // Use pattern matching - declarative, not imperative!
  const pattern = ERROR_PATTERNS.find((p) => p.detect(name, message));
  const code = pattern?.code ?? ErrorCode.UNKNOWN;

  return createError(code, context, error);
}

/**
 * Convert RichError to Status for universal client.
 *
 * @param error - Rich error
 * @returns Status object
 */
export function richErrorToStatus(error: RichError): {
  type: "error";
  code: string;
  message: string;
  retryable: boolean;
  metadata: ErrorMetadata;
} {
  return {
    type: "error",
    code: error.code,
    message: error.metadata.summary,
    retryable: error.metadata.retryable,
    metadata: error.metadata,
  };
}

/**
 * Format error for logging.
 *
 * @param error - Rich error
 * @param includeStack - Include stack trace if cause exists
 * @returns Formatted error string
 */
export function formatError(error: RichError, includeStack = false): string {
  const lines: string[] = [
    `[${error.code}] ${error.metadata.summary}`,
    `  Detail: ${error.metadata.detail}`,
    `  Category: ${error.metadata.category}`,
    `  Retryable: ${error.metadata.retryable}`,
    `  Severity: ${error.metadata.severity}`,
  ];

  if (error.context.requestId) {
    lines.push(`  Request ID: ${error.context.requestId}`);
  }

  if (error.context.transport) {
    lines.push(`  Transport: ${error.context.transport}`);
  }

  if (error.context.method) {
    const m = error.context.method;
    const methodStr = m.version
      ? `${m.version}:${m.service}.${m.operation}`
      : `${m.service}.${m.operation}`;
    lines.push(`  Method: ${methodStr}`);
  }

  if (error.metadata.suggestions && error.metadata.suggestions.length > 0) {
    lines.push(`  Suggestions:`);
    for (const suggestion of error.metadata.suggestions) {
      lines.push(`    - ${suggestion}`);
    }
  }

  if (error.cause) {
    lines.push(`  Cause: ${error.cause.message}`);
    if (includeStack && error.cause.stack) {
      lines.push(`  Stack: ${error.cause.stack}`);
    }
  }

  return lines.join("\n");
}

/**
 * Check if error is retryable.
 */
export function isRetryable(error: RichError): boolean {
  return error.metadata.retryable;
}

/**
 * Check if error is in a specific category.
 */
export function isErrorCategory(
  error: RichError,
  category: string
): boolean {
  return error.metadata.category === category;
}
