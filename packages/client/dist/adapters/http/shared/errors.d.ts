/**
 * HTTP Error Types
 *
 * Type-safe error codes and utilities for HTTP adapter errors.
 * No more magic strings!
 */
import { HTTPStatus } from "./constants.js";
/**
 * HTTP Error Codes (Type-safe)
 *
 * Categorizes errors into semantic codes instead of magic strings.
 */
export declare enum HTTPErrorCode {
    NETWORK_ERROR = "NETWORK_ERROR",
    CONNECTION_REFUSED = "CONNECTION_REFUSED",
    TIMEOUT = "TIMEOUT",
    ABORTED = "ABORTED",
    HTTP_ERROR = "HTTP_ERROR",
    INVALID_RESPONSE = "INVALID_RESPONSE",
    PARSE_ERROR = "PARSE_ERROR",
    SERIALIZE_ERROR = "SERIALIZE_ERROR",
    INVALID_URL = "INVALID_URL",
    INVALID_METHOD = "INVALID_METHOD",
    UNKNOWN = "UNKNOWN"
}
export declare const HTTPErrorMessage: Record<HTTPErrorCode, string>;
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
export declare function createHTTPStatusError(status: HTTPStatus): HTTPErrorDetails;
/**
 * Create network error details
 */
export declare function createNetworkError(message: string, cause?: Error): HTTPErrorDetails;
/**
 * Create timeout error details
 */
export declare function createTimeoutError(timeoutMs: number): HTTPErrorDetails;
/**
 * Create abort error details -- needs fixing
 */
export declare function createAbortError(): HTTPErrorDetails;
export declare function createHTTPError(cause?: Error): HTTPErrorDetails;
/**
 * Detect error type from Error object
 *
 * Inspects error name/message to categorize fetch errors.
 *
 * needs fixing
 */
export declare function categorizeError(error: Error): HTTPErrorCode;
/**
 * Create error details from generic Error
 */
export declare function createErrorFromException(error: Error): HTTPErrorDetails;
/**
 * Check if error code represents a retryable error
 */
export declare function isRetryableError(code: HTTPErrorCode | string): boolean;
//# sourceMappingURL=errors.d.ts.map