/**
 * HTTP Error Types
 *
 * Type-safe error codes and utilities for HTTP adapter errors.
 * No more magic strings!
 */
import { HTTPStatus } from "./constants.js";
import { formatHTTPError, getStatusCode, isRetryableStatus } from "./status-codes.js";
/**
 * HTTP Error Codes (Type-safe)
 *
 * Categorizes errors into semantic codes instead of magic strings.
 */
export var HTTPErrorCode;
(function (HTTPErrorCode) {
    // Network errors
    HTTPErrorCode["NETWORK_ERROR"] = "NETWORK_ERROR";
    HTTPErrorCode["CONNECTION_REFUSED"] = "CONNECTION_REFUSED";
    HTTPErrorCode["TIMEOUT"] = "TIMEOUT";
    HTTPErrorCode["ABORTED"] = "ABORTED";
    // HTTP errors (mapped from status codes)
    HTTPErrorCode["HTTP_ERROR"] = "HTTP_ERROR";
    // Parse/serialization errors
    HTTPErrorCode["INVALID_RESPONSE"] = "INVALID_RESPONSE";
    HTTPErrorCode["PARSE_ERROR"] = "PARSE_ERROR";
    HTTPErrorCode["SERIALIZE_ERROR"] = "SERIALIZE_ERROR";
    // Configuration errors
    HTTPErrorCode["INVALID_URL"] = "INVALID_URL";
    HTTPErrorCode["INVALID_METHOD"] = "INVALID_METHOD";
    // Unknown
    HTTPErrorCode["UNKNOWN"] = "UNKNOWN";
})(HTTPErrorCode || (HTTPErrorCode = {}));
export const HTTPErrorMessage = {
    [HTTPErrorCode.PARSE_ERROR]: "Failed to parse response",
    [HTTPErrorCode.SERIALIZE_ERROR]: "Failed to serialize request",
    [HTTPErrorCode.NETWORK_ERROR]: "Network error occurred",
    [HTTPErrorCode.CONNECTION_REFUSED]: "Connection was refused by the server",
    [HTTPErrorCode.TIMEOUT]: "Request timed out",
    [HTTPErrorCode.ABORTED]: "Request was aborted",
    [HTTPErrorCode.HTTP_ERROR]: "HTTP error occurred",
    [HTTPErrorCode.INVALID_RESPONSE]: "Received invalid response from server",
    [HTTPErrorCode.INVALID_URL]: "The provided URL is invalid",
    [HTTPErrorCode.INVALID_METHOD]: "The provided HTTP method is invalid",
    [HTTPErrorCode.UNKNOWN]: "An unknown error occurred",
};
/**
 * Create HTTP error details from status code
 */
export function createHTTPStatusError(status) {
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
export function createNetworkError(message, cause) {
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
export function createTimeoutError(timeoutMs) {
    return {
        code: HTTPErrorCode.TIMEOUT,
        message: `Request timed out after ${timeoutMs}ms`,
        retryable: true,
    };
}
/**
 * Create abort error details -- needs fixing
 */
export function createAbortError() {
    return createHTTPError();
}
// needs fixing
export function createHTTPError(cause) {
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
export function categorizeError(error) {
    const name = error.name?.toLowerCase() || "";
    const message = error.message?.toLowerCase() || "";
    if (name === "aborterror" || message.includes("abort")) {
        return HTTPErrorCode.ABORTED;
    }
    if (name === "timeouterror" ||
        message.includes("timeout") ||
        message.includes("timed out")) {
        return HTTPErrorCode.TIMEOUT;
    }
    if (message.includes("fetch") ||
        message.includes("network") ||
        message.includes("connection")) {
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
export function createErrorFromException(error) {
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
export function isRetryableError(code) {
    switch (code) {
        case HTTPErrorCode.NETWORK_ERROR:
        case HTTPErrorCode.CONNECTION_REFUSED:
        case HTTPErrorCode.TIMEOUT:
            return true;
        default:
            return false;
    }
}
//# sourceMappingURL=errors.js.map