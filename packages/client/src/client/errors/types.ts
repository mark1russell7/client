/**
 * Universal Error System - Type Definitions
 *
 * Protocol-agnostic error metadata system.
 * Works across HTTP, WebSocket, gRPC, Local transports.
 */

/**
 * Error severity levels.
 */
export const ErrorSeverity = {
  /** Informational - not an actual error */
  INFO: "info",
  /** Warning - degraded but functional */
  WARNING: "warning",
  /** Error - operation failed */
  ERROR: "error",
  /** Critical - system-level failure */
  CRITICAL: "critical",
} as const;

/** This type is the union of the values of `ErrorSeverity`. */
export type ErrorSeverity = (typeof ErrorSeverity)[keyof typeof ErrorSeverity];

/** These types keep each member of `ErrorSeverity` usable as a type. */
// eslint-disable-next-line @typescript-eslint/no-namespace
export declare namespace ErrorSeverity {
  export type INFO = typeof ErrorSeverity.INFO;
  export type WARNING = typeof ErrorSeverity.WARNING;
  export type ERROR = typeof ErrorSeverity.ERROR;
  export type CRITICAL = typeof ErrorSeverity.CRITICAL;
}

/**
 * Error categories for classification.
 */
export const ErrorCategory = {
  /** Network-level errors (connectivity, DNS, etc.) */
  NETWORK: "network",
  /** Client-side errors (validation, configuration) */
  CLIENT: "client",
  /** Server-side errors (5xx, internal errors) */
  SERVER: "server",
  /** Protocol-level errors (parsing, encoding) */
  PROTOCOL: "protocol",
  /** Authentication/authorization errors */
  AUTH: "auth",
  /** Rate limiting and throttling */
  RATE_LIMIT: "rate_limit",
  /** Timeout errors */
  TIMEOUT: "timeout",
  /** Cancellation errors */
  CANCELLED: "cancelled",
  /** Unknown/uncategorized errors */
  UNKNOWN: "unknown",
} as const;

/** This type is the union of the values of `ErrorCategory`. */
export type ErrorCategory = (typeof ErrorCategory)[keyof typeof ErrorCategory];

/** These types keep each member of `ErrorCategory` usable as a type. */
// eslint-disable-next-line @typescript-eslint/no-namespace
export declare namespace ErrorCategory {
  export type NETWORK = typeof ErrorCategory.NETWORK;
  export type CLIENT = typeof ErrorCategory.CLIENT;
  export type SERVER = typeof ErrorCategory.SERVER;
  export type PROTOCOL = typeof ErrorCategory.PROTOCOL;
  export type AUTH = typeof ErrorCategory.AUTH;
  export type RATE_LIMIT = typeof ErrorCategory.RATE_LIMIT;
  export type TIMEOUT = typeof ErrorCategory.TIMEOUT;
  export type CANCELLED = typeof ErrorCategory.CANCELLED;
  export type UNKNOWN = typeof ErrorCategory.UNKNOWN;
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
export type ErrorFactory = (
  code: string,
  context?: Partial<ErrorContext>,
  cause?: Error
) => RichError;
