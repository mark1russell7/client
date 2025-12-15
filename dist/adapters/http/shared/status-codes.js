/**
 * HTTP Status Code Utilities
 *
 * Utilities for working with HTTP status codes, including mappings
 * and classification helpers.
 */
import { HTTPStatus, HTTP } from "./constants.js";
/**
 * HTTP Status Code to String Code Mapping
 *
 * Maps numeric status codes to semantic string codes.
 */
export const HTTPStatusToCode = {
    [HTTPStatus.UNKNOWN]: "UNKNOWN",
    [HTTPStatus.CONTINUE]: "CONTINUE",
    [HTTPStatus.SWITCHING_PROTOCOLS]: "SWITCHING_PROTOCOLS",
    [HTTPStatus.PROCESSING]: "PROCESSING",
    [HTTPStatus.EARLY_HINTS]: "EARLY_HINTS",
    [HTTPStatus.RESPONSE_IS_TOO_LARGE]: "RESPONSE_IS_TOO_LARGE",
    [HTTPStatus.OK]: "OK",
    [HTTPStatus.CREATED]: "CREATED",
    [HTTPStatus.ACCEPTED]: "ACCEPTED",
    [HTTPStatus.NON_AUTHORITATIVE_INFORMATION]: "NON_AUTHORITATIVE_INFORMATION",
    [HTTPStatus.NO_CONTENT]: "NO_CONTENT",
    [HTTPStatus.RESET_CONTENT]: "RESET_CONTENT",
    [HTTPStatus.PARTIAL_CONTENT]: "PARTIAL_CONTENT",
    [HTTPStatus.MULTI_STATUS]: "MULTI_STATUS",
    [HTTPStatus.ALREADY_REPORTED]: "ALREADY_REPORTED",
    [HTTPStatus.IM_USED]: "IM_USED",
    [HTTPStatus.MULTIPLE_CHOICES]: "MULTIPLE_CHOICES",
    [HTTPStatus.MOVED_PERMANENTLY]: "MOVED_PERMANENTLY",
    [HTTPStatus.FOUND]: "FOUND",
    [HTTPStatus.SEE_OTHER]: "SEE_OTHER",
    [HTTPStatus.NOT_MODIFIED]: "NOT_MODIFIED",
    [HTTPStatus.USE_PROXY]: "USE_PROXY",
    [HTTPStatus.TEMPORARY_REDIRECT]: "TEMPORARY_REDIRECT",
    [HTTPStatus.PERMANENT_REDIRECT]: "PERMANENT_REDIRECT",
    [HTTPStatus.BAD_REQUEST]: "BAD_REQUEST",
    [HTTPStatus.UNAUTHORIZED]: "UNAUTHORIZED",
    [HTTPStatus.FORBIDDEN]: "FORBIDDEN",
    [HTTPStatus.NOT_FOUND]: "NOT_FOUND",
    [HTTPStatus.METHOD_NOT_ALLOWED]: "METHOD_NOT_ALLOWED",
    [HTTPStatus.NOT_ACCEPTABLE]: "NOT_ACCEPTABLE",
    [HTTPStatus.PROXY_AUTHENTICATION_REQUIRED]: "PROXY_AUTHENTICATION_REQUIRED",
    [HTTPStatus.REQUEST_TIMEOUT]: "REQUEST_TIMEOUT",
    [HTTPStatus.CONFLICT]: "CONFLICT",
    [HTTPStatus.GONE]: "GONE",
    [HTTPStatus.LENGTH_REQUIRED]: "LENGTH_REQUIRED",
    [HTTPStatus.PRECONDITION_FAILED]: "PRECONDITION_FAILED",
    [HTTPStatus.PAYLOAD_TOO_LARGE]: "PAYLOAD_TOO_LARGE",
    [HTTPStatus.URI_TOO_LONG]: "URI_TOO_LONG",
    [HTTPStatus.UNSUPPORTED_MEDIA_TYPE]: "UNSUPPORTED_MEDIA_TYPE",
    [HTTPStatus.RANGE_NOT_SATISFIABLE]: "RANGE_NOT_SATISFIABLE",
    [HTTPStatus.EXPECTATION_FAILED]: "EXPECTATION_FAILED",
    [HTTPStatus.IM_A_TEAPOT]: "IM_A_TEAPOT",
    [HTTPStatus.MISDIRECTED_REQUEST]: "MISDIRECTED_REQUEST",
    [HTTPStatus.UNPROCESSABLE_ENTITY]: "UNPROCESSABLE_ENTITY",
    [HTTPStatus.LOCKED]: "LOCKED",
    [HTTPStatus.FAILED_DEPENDENCY]: "FAILED_DEPENDENCY",
    [HTTPStatus.TOO_EARLY]: "TOO_EARLY",
    [HTTPStatus.UPGRADE_REQUIRED]: "UPGRADE_REQUIRED",
    [HTTPStatus.PRECONDITION_REQUIRED]: "PRECONDITION_REQUIRED",
    [HTTPStatus.TOO_MANY_REQUESTS]: "TOO_MANY_REQUESTS",
    [HTTPStatus.REQUEST_HEADER_FIELDS_TOO_LARGE]: "REQUEST_HEADER_FIELDS_TOO_LARGE",
    [HTTPStatus.UNAVAILABLE_FOR_LEGAL_REASONS]: "UNAVAILABLE_FOR_LEGAL_REASONS",
    [HTTPStatus.CLIENT_CLOSED_REQUEST]: "CLIENT_CLOSED_REQUEST",
    [HTTPStatus.INTERNAL_SERVER_ERROR]: "INTERNAL_SERVER_ERROR",
    [HTTPStatus.NOT_IMPLEMENTED]: "NOT_IMPLEMENTED",
    [HTTPStatus.BAD_GATEWAY]: "BAD_GATEWAY",
    [HTTPStatus.SERVICE_UNAVAILABLE]: "SERVICE_UNAVAILABLE",
    [HTTPStatus.GATEWAY_TIMEOUT]: "GATEWAY_TIMEOUT",
    [HTTPStatus.HTTP_VERSION_NOT_SUPPORTED]: "HTTP_VERSION_NOT_SUPPORTED",
    [HTTPStatus.VARIANT_ALSO_NEGOTIATES]: "VARIANT_ALSO_NEGOTIATES",
    [HTTPStatus.INSUFFICIENT_STORAGE]: "INSUFFICIENT_STORAGE",
    [HTTPStatus.LOOP_DETECTED]: "LOOP_DETECTED",
    [HTTPStatus.NOT_EXTENDED]: "NOT_EXTENDED",
    [HTTPStatus.NETWORK_AUTHENTICATION_REQUIRED]: "NETWORK_AUTHENTICATION_REQUIRED",
    [HTTPStatus.HTTP_NETWORK_CONNECT_TIMEOUT_ERROR]: "HTTP_NETWORK_CONNECT_TIMEOUT_ERROR",
};
/**
 * Legacy alias for backwards compatibility
 * @deprecated Use HTTPStatusToCode instead
 */
export const HTTPCodeMap = HTTPStatusToCode;
/**
 * String Code to HTTP Status Mapping (Reverse of HTTPStatusToCode)
 *
 * Maps semantic string codes back to numeric status codes.
 */
export const CodeToHTTPStatus = Object.fromEntries(Object.entries(HTTPStatusToCode).map(([status, code]) => [code, Number(status)]));
/**
 * Check if status code represents success (2xx)
 */
export function isSuccessStatus(status) {
    return status >= HTTPStatus.OK && status < HTTPStatus.MULTIPLE_CHOICES;
}
/**
 * Check if status code represents informational response (1xx)
 */
export function isInformationalStatus(status) {
    return status >= HTTPStatus.CONTINUE && status < HTTPStatus.OK;
}
/**
 * Check if status code represents redirection (3xx)
 */
export function isRedirectStatus(status) {
    return status >= HTTPStatus.MULTIPLE_CHOICES && status < HTTPStatus.BAD_REQUEST;
}
/**
 * Check if status code represents client error (4xx)
 */
export function isClientErrorStatus(status) {
    return status >= HTTPStatus.BAD_REQUEST && status < HTTPStatus.INTERNAL_SERVER_ERROR;
}
/**
 * Check if status code represents server error (5xx)
 */
export function isServerErrorStatus(status) {
    return status >= HTTPStatus.INTERNAL_SERVER_ERROR && status < 600;
}
/**
 * Check if status code represents any error (4xx or 5xx)
 */
export function isErrorStatus(status) {
    return isClientErrorStatus(status) || isServerErrorStatus(status);
}
/**
 * Check if status code is typically retryable
 *
 * Default policy: server errors and specific client errors (timeout, rate limit) are retryable.
 * Can be overridden via retry middleware configuration.
 */
export function isRetryableStatus(status) {
    // Server errors are generally retryable
    if (isServerErrorStatus(status)) {
        return true;
    }
    // Specific client errors that are retryable
    if (status === HTTPStatus.REQUEST_TIMEOUT ||
        status === HTTPStatus.TOO_MANY_REQUESTS) {
        return true;
    }
    return false;
}
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
export function getStatusCode(status) {
    return HTTPStatusToCode[status] ?? HTTPStatusToCode[HTTPStatus.UNKNOWN];
}
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
export function getStatusFromCode(code) {
    return CodeToHTTPStatus[code] ?? HTTPStatus.UNKNOWN;
}
/**
 * Format HTTP error message
 *
 * @example
 * ```typescript
 * formatHTTPError(HTTPStatus.NOT_FOUND) // "HTTP 404"
 * formatHTTPError(500) // "HTTP 500"
 * ```
 */
export function formatHTTPError(status) {
    return `${HTTP} ${status}`;
}
/**
 * Validate if a number is a valid HTTP status code
 */
export function isValidHTTPStatus(status) {
    return status in HTTPStatusToCode;
}
//# sourceMappingURL=status-codes.js.map