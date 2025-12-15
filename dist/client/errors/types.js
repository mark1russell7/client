/**
 * Universal Error System - Type Definitions
 *
 * Protocol-agnostic error metadata system.
 * Works across HTTP, WebSocket, gRPC, Local transports.
 */
/**
 * Error severity levels.
 */
export var ErrorSeverity;
(function (ErrorSeverity) {
    /** Informational - not an actual error */
    ErrorSeverity["INFO"] = "info";
    /** Warning - degraded but functional */
    ErrorSeverity["WARNING"] = "warning";
    /** Error - operation failed */
    ErrorSeverity["ERROR"] = "error";
    /** Critical - system-level failure */
    ErrorSeverity["CRITICAL"] = "critical";
})(ErrorSeverity || (ErrorSeverity = {}));
/**
 * Error categories for classification.
 */
export var ErrorCategory;
(function (ErrorCategory) {
    /** Network-level errors (connectivity, DNS, etc.) */
    ErrorCategory["NETWORK"] = "network";
    /** Client-side errors (validation, configuration) */
    ErrorCategory["CLIENT"] = "client";
    /** Server-side errors (5xx, internal errors) */
    ErrorCategory["SERVER"] = "server";
    /** Protocol-level errors (parsing, encoding) */
    ErrorCategory["PROTOCOL"] = "protocol";
    /** Authentication/authorization errors */
    ErrorCategory["AUTH"] = "auth";
    /** Rate limiting and throttling */
    ErrorCategory["RATE_LIMIT"] = "rate_limit";
    /** Timeout errors */
    ErrorCategory["TIMEOUT"] = "timeout";
    /** Cancellation errors */
    ErrorCategory["CANCELLED"] = "cancelled";
    /** Unknown/uncategorized errors */
    ErrorCategory["UNKNOWN"] = "unknown";
})(ErrorCategory || (ErrorCategory = {}));
//# sourceMappingURL=types.js.map