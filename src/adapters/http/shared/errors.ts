/**
 * HTTP Error Types
 *
 * Type-safe error codes and utilities for HTTP adapter errors.
 * No more magic strings!
 */

import { HTTPStatus } from "./constants";
import { formatHTTPError, getStatusCode, isRetryableStatus } from "./status-codes";

/**
 * HTTP Error Codes (Type-safe)
 *
 * Categorizes errors into semantic codes instead of magic strings.
 */
export enum HTTPErrorCode {
  // Network errors
  NETWORK_ERROR = "NETWORK_ERROR",
  CONNECTION_REFUSED = "CONNECTION_REFUSED",
  TIMEOUT = "TIMEOUT",
  ABORTED = "ABORTED",

  // HTTP errors (mapped from status codes)
  HTTP_ERROR = "HTTP_ERROR",

  // Parse/serialization errors
  INVALID_RESPONSE = "INVALID_RESPONSE",
  PARSE_ERROR = "PARSE_ERROR",
  SERIALIZE_ERROR = "SERIALIZE_ERROR",

  // Configuration errors
  INVALID_URL = "INVALID_URL",
  INVALID_METHOD = "INVALID_METHOD",

  // Unknown
  UNKNOWN = "UNKNOWN",
}

export const HTTPErrorMessage : Record<HTTPErrorCode, string> = {
  [HTTPErrorCode.PARSE_ERROR] : "Failed to parse response",
  [HTTPErrorCode.SERIALIZE_ERROR] : "Failed to serialize request",
  [HTTPErrorCode.NETWORK_ERROR] : "Network error occurred",
  [HTTPErrorCode.CONNECTION_REFUSED] : "Connection was refused by the server",
  [HTTPErrorCode.TIMEOUT] : "Request timed out",
  [HTTPErrorCode.ABORTED] : "Request was aborted",
  [HTTPErrorCode.HTTP_ERROR] : "HTTP error occurred",
  [HTTPErrorCode.INVALID_RESPONSE] : "Received invalid response from server",
  [HTTPErrorCode.INVALID_URL] : "The provided URL is invalid",
  [HTTPErrorCode.INVALID_METHOD] : "The provided HTTP method is invalid",
  [HTTPErrorCode.UNKNOWN] : "An unknown error occurred",
} as const satisfies Record<HTTPErrorCode, string>;

/**
 * HTTP Error Details
 *
 * Structured error information for HTTP transport errors.
 */
export interface HTTPErrorDetails {
  /** Semantic error code */
  code: HTTPErrorCode | string;

  /** Human-readable error message */
  message: string;

  /** Whether this error is retryable */
  retryable: boolean;

  /** Optional HTTP status code (if applicable) */
  status?: HTTPStatus;

  /** Optional underlying cause */
  cause?: Error | undefined;
}

/**
 * Create HTTP error details from status code
 */
export function createHTTPStatusError(status: HTTPStatus): HTTPErrorDetails {
  return {
    code: getStatusCode(status),
    message: formatHTTPError(status),
    retryable: isRetryableStatus(status),
    status,
  };
}

/**
 * Create network error details
 */
export function createNetworkError(
  message: string,
  cause?: Error
): HTTPErrorDetails {
  return {
    code: HTTPErrorCode.NETWORK_ERROR,
    message,
    retryable: true,
    ...(cause && { cause }),
  };
}

/**
 * Create timeout error details
 */
export function createTimeoutError(timeoutMs: number): HTTPErrorDetails {
  return {
    code: HTTPErrorCode.TIMEOUT,
    message: `Request timed out after ${timeoutMs}ms`,
    retryable: true,
  };
}

/**
 * Create abort error details -- needs fixing
 */
export function createAbortError(): HTTPErrorDetails {
  return createHTTPError();
}

// needs fixing
export function createHTTPError(cause?: Error): HTTPErrorDetails {
  return {
    code: HTTPErrorCode.HTTP_ERROR,
    message: cause?.message ?? HTTPErrorMessage[HTTPErrorCode.HTTP_ERROR],
    retryable: false,
    cause
  };
}

/**
 * Detect error type from Error object
 *
 * Inspects error name/message to categorize fetch errors.
 *
 * needs fixing
 */
export function categorizeError(error: Error): HTTPErrorCode {
  const name = error.name?.toLowerCase() || "";
  const message = error.message?.toLowerCase() || "";

  if (name === "aborterror" || message.includes("abort")) {
    return HTTPErrorCode.ABORTED;
  }

  if (
    name === "timeouterror" ||
    message.includes("timeout") ||
    message.includes("timed out")
  ) {
    return HTTPErrorCode.TIMEOUT;
  }

  if (
    message.includes("fetch") ||
    message.includes("network") ||
    message.includes("connection")
  ) {
    return HTTPErrorCode.NETWORK_ERROR;
  }

  if (message.includes("parse") || message.includes("json")) {
    return HTTPErrorCode.PARSE_ERROR;
  }

  return HTTPErrorCode.UNKNOWN;
}

/**
 * Create error details from generic Error
 */
export function createErrorFromException(error: Error): HTTPErrorDetails {
  const code = categorizeError(error);

  return {
    code,
    message: error.message,
    retryable: code === HTTPErrorCode.NETWORK_ERROR || code === HTTPErrorCode.TIMEOUT,
    cause: error,
  };
}

/**
 * Check if error code represents a retryable error
 */
export function isRetryableError(code: HTTPErrorCode | string): boolean {
  switch (code) {
    case HTTPErrorCode.NETWORK_ERROR:
    case HTTPErrorCode.CONNECTION_REFUSED:
    case HTTPErrorCode.TIMEOUT:
      return true;
    default:
      return false;
  }
}
