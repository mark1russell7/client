/**
 * HTTP Status Code Utilities
 *
 * Utilities for working with HTTP status codes, including mappings
 * and classification helpers.
 */
import { HTTPStatus } from "./constants.js";
/**
 * HTTP Status Code to String Code Mapping
 *
 * Maps numeric status codes to semantic string codes.
 */
export declare const HTTPStatusToCode: Record<HTTPStatus, string>;
/**
 * Legacy alias for backwards compatibility
 * @deprecated Use HTTPStatusToCode instead
 */
export declare const HTTPCodeMap: typeof HTTPStatusToCode;
/**
 * String Code to HTTP Status Mapping (Reverse of HTTPStatusToCode)
 *
 * Maps semantic string codes back to numeric status codes.
 */
export declare const CodeToHTTPStatus: Record<string, HTTPStatus>;
/**
 * Check if status code represents success (2xx)
 */
export declare function isSuccessStatus(status: HTTPStatus): boolean;
/**
 * Check if status code represents informational response (1xx)
 */
export declare function isInformationalStatus(status: HTTPStatus): boolean;
/**
 * Check if status code represents redirection (3xx)
 */
export declare function isRedirectStatus(status: HTTPStatus): boolean;
/**
 * Check if status code represents client error (4xx)
 */
export declare function isClientErrorStatus(status: HTTPStatus): boolean;
/**
 * Check if status code represents server error (5xx)
 */
export declare function isServerErrorStatus(status: HTTPStatus): boolean;
/**
 * Check if status code represents any error (4xx or 5xx)
 */
export declare function isErrorStatus(status: HTTPStatus): boolean;
/**
 * Check if status code is typically retryable
 *
 * Default policy: server errors and specific client errors (timeout, rate limit) are retryable.
 * Can be overridden via retry middleware configuration.
 */
export declare function isRetryableStatus(status: HTTPStatus): boolean;
/**
 * Get semantic code string for a status
 *
 * @example
 * ```typescript
 * getStatusCode(HTTPStatus.OK) // "OK"
 * getStatusCode(404) // "NOT_FOUND"
 * getStatusCode(999) // "UNKNOWN"
 * ```
 */
export declare function getStatusCode(status: HTTPStatus): string;
/**
 * Get HTTP status from semantic code string
 *
 * @example
 * ```typescript
 * getStatusFromCode("OK") // HTTPStatus.OK (200)
 * getStatusFromCode("NOT_FOUND") // HTTPStatus.NOT_FOUND (404)
 * getStatusFromCode("INVALID") // HTTPStatus.UNKNOWN (0)
 * ```
 */
export declare function getStatusFromCode(code: string): HTTPStatus;
/**
 * Format HTTP error message
 *
 * @example
 * ```typescript
 * formatHTTPError(HTTPStatus.NOT_FOUND) // "HTTP 404"
 * formatHTTPError(500) // "HTTP 500"
 * ```
 */
export declare function formatHTTPError(status: HTTPStatus): string;
/**
 * Validate if a number is a valid HTTP status code
 */
export declare function isValidHTTPStatus(status: number): status is HTTPStatus;
//# sourceMappingURL=status-codes.d.ts.map