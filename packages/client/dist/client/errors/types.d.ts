/**
 * Universal Error System - Type Definitions
 *
 * Protocol-agnostic error metadata system.
 * Works across HTTP, WebSocket, gRPC, Local transports.
 */
/**
 * Error severity levels.
 */
export declare enum ErrorSeverity {
    /** Informational - not an actual error */
    INFO = "info",
    /** Warning - degraded but functional */
    WARNING = "warning",
    /** Error - operation failed */
    ERROR = "error",
    /** Critical - system-level failure */
    CRITICAL = "critical"
}
/**
 * Error categories for classification.
 */
export declare enum ErrorCategory {
    /** Network-level errors (connectivity, DNS, etc.) */
    NETWORK = "network",
    /** Client-side errors (validation, configuration) */
    CLIENT = "client",
    /** Server-side errors (5xx, internal errors) */
    SERVER = "server",
    /** Protocol-level errors (parsing, encoding) */
    PROTOCOL = "protocol",
    /** Authentication/authorization errors */
    AUTH = "auth",
    /** Rate limiting and throttling */
    RATE_LIMIT = "rate_limit",
    /** Timeout errors */
    TIMEOUT = "timeout",
    /** Cancellation errors */
    CANCELLED = "cancelled",
    /** Unknown/uncategorized errors */
    UNKNOWN = "unknown"
}
/**
 * Complete error metadata for an error code.
 *
 * Central registry entry containing all information about an error.
 */
export interface ErrorMetadata {
    /** Unique error code identifier */
    code: string;
    /** Short human-readable summary (1 line) */
    summary: string;
    /** Detailed explanation of what this error means */
    detail: string;
    /** Error category for classification */
    category: ErrorCategory;
    /** Whether this error is retryable */
    retryable: boolean;
    /** Severity level */
    severity: ErrorSeverity;
    /** End-user friendly message (non-technical) */
    userMessage: string;
    /** Developer-facing diagnostic message */
    devMessage: string;
    /** HTTP status code (if applicable) */
    httpStatus?: number;
    /** Suggested user actions */
    suggestions?: string[];
    /** Related documentation URL */
    docsUrl?: string;
}
/**
 * Error registry - maps error codes to metadata.
 */
export type ErrorRegistry = Record<string, ErrorMetadata>;
/**
 * Error context - runtime information attached to an error.
 */
export interface ErrorContext {
    /** Timestamp when error occurred */
    timestamp: number;
    /** Request ID for correlation */
    requestId?: string;
    /** Transport that generated the error */
    transport?: string;
    /** Method that was being called */
    method?: {
        service: string;
        operation: string;
        version?: string;
    };
    /** Additional runtime context */
    [key: string]: unknown;
}
/**
 * Rich error details combining metadata and context.
 */
export interface RichError {
    /** Error code from registry */
    code: string;
    /** Error metadata (summary, detail, etc.) */
    metadata: ErrorMetadata;
    /** Runtime context */
    context: ErrorContext;
    /** Original cause (if wrapped) */
    cause?: Error;
}
/**
 * Error factory function type.
 */
export type ErrorFactory = (code: string, context?: Partial<ErrorContext>, cause?: Error) => RichError;
//# sourceMappingURL=types.d.ts.map