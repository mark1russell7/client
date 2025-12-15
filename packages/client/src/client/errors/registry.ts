/**
 * Universal Error Registry
 *
 * Central source of truth for all error codes across all transports.
 * Each error code has rich metadata including summary, detail, category, etc.
 *
 * NO MAGIC STRINGS - everything is defined in the registry!
 */

import {
  ErrorCategory,
  ErrorSeverity,
  type ErrorRegistry,
  type ErrorMetadata,
} from "./types.js";
import { HTTP_ERROR_REGISTRY } from "./http-errors.js";
import { ErrorCode } from "./codes.js";

/**
 * Create error metadata with defaults.
 */
function defineError(
  code: string,
  meta: Omit<ErrorMetadata, "code">
): ErrorMetadata {
  const result: ErrorMetadata = {
    code,
    summary: meta.summary,
    detail: meta.detail,
    category: meta.category,
    retryable: meta.retryable,
    severity: meta.severity,
    userMessage: meta.userMessage,
    devMessage: meta.devMessage,
  };

  if (meta.httpStatus !== undefined) {
    result.httpStatus = meta.httpStatus;
  }
  if (meta.suggestions !== undefined) {
    result.suggestions = meta.suggestions;
  }
  if (meta.docsUrl !== undefined) {
    result.docsUrl = meta.docsUrl;
  }

  return result;
}

/**
 * Universal Error Registry
 *
 * Protocol-agnostic error codes with rich metadata.
 */
export const ERROR_REGISTRY: ErrorRegistry = {
  //
  // ═══ Network Errors ═══
  //

  [ErrorCode.NETWORK_ERROR]: defineError(ErrorCode.NETWORK_ERROR, {
    summary: "Network error occurred",
    detail:
      "Failed to establish or maintain network connection. This typically indicates connectivity issues, DNS resolution failures, or network infrastructure problems.",
    category: ErrorCategory.NETWORK,
    retryable: true,
    severity: ErrorSeverity.ERROR,
    userMessage: "Unable to connect to the server. Please check your internet connection.",
    devMessage: "Network-level failure during request execution. Check connectivity, DNS, proxies.",
    suggestions: [
      "Check your internet connection",
      "Verify the server is accessible",
      "Check for proxy or firewall issues",
    ],
  }),

  CONNECTION_REFUSED: defineError(ErrorCode.CONNECTION_REFUSED, {
    summary: "Connection refused by server",
    detail:
      "The server actively refused the connection. This typically means the server is not running, the port is blocked, or a firewall is rejecting the connection.",
    category: ErrorCategory.NETWORK,
    retryable: true,
    severity: ErrorSeverity.ERROR,
    userMessage: "The server refused the connection. Please try again later.",
    devMessage: "Server refused TCP connection. Verify server is running and port is accessible.",
    suggestions: [
      "Verify the server is running",
      "Check the port number is correct",
      "Check firewall rules",
    ],
  }),

  DNS_ERROR: defineError(ErrorCode.DNS_ERROR, {
    summary: "DNS resolution failed",
    detail: "Failed to resolve the hostname to an IP address. This indicates DNS server issues or invalid hostname.",
    category: ErrorCategory.NETWORK,
    retryable: true,
    severity: ErrorSeverity.ERROR,
    userMessage: "Unable to find the server. Please check the server address.",
    devMessage: "DNS lookup failed. Check hostname and DNS server configuration.",
    suggestions: [
      "Verify the hostname is correct",
      "Check DNS server settings",
      "Try using an IP address directly",
    ],
  }),

  //
  // ═══ Timeout Errors ═══
  //

  TIMEOUT: defineError(ErrorCode.TIMEOUT, {
    summary: "Request timed out",
    detail:
      "The request exceeded the configured timeout duration. This may indicate slow server response, network congestion, or overly aggressive timeout settings.",
    category: ErrorCategory.TIMEOUT,
    retryable: true,
    severity: ErrorSeverity.WARNING,
    userMessage: "The request took too long to complete. Please try again.",
    devMessage: "Request exceeded timeout threshold. Consider increasing timeout or optimizing server response time.",
    httpStatus: 408,
    suggestions: [
      "Try again with a longer timeout",
      "Check server performance",
      "Verify network latency",
    ],
  }),

  CONNECTION_TIMEOUT: defineError(ErrorCode.CONNECTION_TIMEOUT, {
    summary: "Connection timeout",
    detail: "Failed to establish connection within the timeout period. This indicates slow network or unresponsive server.",
    category: ErrorCategory.TIMEOUT,
    retryable: true,
    severity: ErrorSeverity.WARNING,
    userMessage: "Unable to connect to the server in time. Please try again.",
    devMessage: "TCP connection handshake timed out. Check network latency and server responsiveness.",
    suggestions: [
      "Increase connection timeout",
      "Check network latency",
      "Verify server is responding",
    ],
  }),

  READ_TIMEOUT: defineError(ErrorCode.READ_TIMEOUT, {
    summary: "Read timeout",
    detail: "Server accepted the connection but failed to send response within timeout period.",
    category: ErrorCategory.TIMEOUT,
    retryable: true,
    severity: ErrorSeverity.WARNING,
    userMessage: "The server is taking too long to respond. Please try again.",
    devMessage: "Server accepted request but response timed out. Check server processing time.",
    suggestions: [
      "Increase read timeout",
      "Check server performance",
      "Verify request isn't causing long processing",
    ],
  }),

  //
  // ═══ Cancellation Errors ═══
  //

  ABORTED: defineError(ErrorCode.ABORTED, {
    summary: "Request was aborted",
    detail: "The request was explicitly cancelled by the client via AbortSignal. This is user-initiated.",
    category: ErrorCategory.CANCELLED,
    retryable: false,
    severity: ErrorSeverity.INFO,
    userMessage: "The request was cancelled.",
    devMessage: "Request aborted via AbortSignal. This is expected and not an error condition.",
    suggestions: ["This is intentional - no action needed"],
  }),

  DEADLINE_EXCEEDED: defineError(ErrorCode.DEADLINE_EXCEEDED, {
    summary: "Deadline exceeded",
    detail: "The overall deadline for the operation (including retries) was exceeded.",
    category: ErrorCategory.TIMEOUT,
    retryable: false,
    severity: ErrorSeverity.ERROR,
    userMessage: "The operation took too long to complete.",
    devMessage: "Overall deadline exceeded across all retry attempts. Consider increasing overall timeout.",
    suggestions: [
      "Increase overall deadline",
      "Reduce per-attempt timeout to allow more retries",
      "Optimize operation to complete faster",
    ],
  }),

  //
  // ═══ Protocol/Parsing Errors ═══
  //

  PARSE_ERROR: defineError(ErrorCode.PARSE_ERROR, {
    summary: "Failed to parse response",
    detail: "The response body could not be parsed. This typically indicates invalid JSON, corrupted data, or protocol mismatch.",
    category: ErrorCategory.PROTOCOL,
    retryable: false,
    severity: ErrorSeverity.ERROR,
    userMessage: "Received invalid response from server. Please contact support.",
    devMessage: "Failed to parse response body. Check content-type and response format match expectations.",
    suggestions: [
      "Verify response content-type header",
      "Check server is returning expected format",
      "Inspect raw response body for corruption",
    ],
  }),

  SERIALIZE_ERROR: defineError(ErrorCode.SERIALIZE_ERROR, {
    summary: "Failed to serialize request",
    detail: "The request payload could not be serialized. This indicates invalid data structure or circular references.",
    category: ErrorCategory.PROTOCOL,
    retryable: false,
    severity: ErrorSeverity.ERROR,
    userMessage: "Failed to send request. Please contact support.",
    devMessage: "Failed to serialize request payload. Check for circular references or unsupported types.",
    suggestions: [
      "Check payload for circular references",
      "Verify all values are serializable",
      "Review payload structure",
    ],
  }),

  INVALID_RESPONSE: defineError(ErrorCode.INVALID_RESPONSE, {
    summary: "Invalid response format",
    detail: "The response format doesn't match the expected schema. This indicates API version mismatch or protocol violation.",
    category: ErrorCategory.PROTOCOL,
    retryable: false,
    severity: ErrorSeverity.ERROR,
    userMessage: "Received unexpected response from server. Please contact support.",
    devMessage: "Response schema doesn't match expected format. Check API version compatibility.",
    suggestions: [
      "Verify API version compatibility",
      "Check response schema matches expectations",
      "Review API documentation",
    ],
  }),

  PROTOCOL_ERROR: defineError(ErrorCode.PROTOCOL_ERROR, {
    summary: "Protocol violation",
    detail: "A violation of the transport protocol occurred. This indicates implementation bugs or version mismatch.",
    category: ErrorCategory.PROTOCOL,
    retryable: false,
    severity: ErrorSeverity.ERROR,
    userMessage: "Communication error with server. Please contact support.",
    devMessage: "Transport protocol violation detected. Check client/server version compatibility.",
    suggestions: [
      "Verify client and server versions are compatible",
      "Check protocol implementation",
      "Review transport adapter code",
    ],
  }),

  //
  // ═══ Client Errors (4xx) ═══
  //

  BAD_REQUEST: defineError(ErrorCode.BAD_REQUEST, {
    summary: "Bad request",
    detail: "The request is malformed or contains invalid data. Server cannot process it.",
    category: ErrorCategory.CLIENT,
    retryable: false,
    severity: ErrorSeverity.ERROR,
    userMessage: "The request is invalid. Please check your input and try again.",
    devMessage: "Request validation failed. Check payload structure and required fields.",
    httpStatus: 400,
    suggestions: [
      "Validate request payload",
      "Check required fields are present",
      "Verify data types match expectations",
    ],
  }),

  UNAUTHORIZED: defineError(ErrorCode.UNAUTHORIZED, {
    summary: "Unauthorized",
    detail: "Authentication is required but was not provided or is invalid.",
    category: ErrorCategory.AUTH,
    retryable: false,
    severity: ErrorSeverity.ERROR,
    userMessage: "Authentication required. Please sign in.",
    devMessage: "Missing or invalid authentication credentials. Check auth token/API key.",
    httpStatus: 401,
    suggestions: [
      "Provide valid authentication credentials",
      "Check token hasn't expired",
      "Verify API key is correct",
    ],
  }),

  FORBIDDEN: defineError(ErrorCode.FORBIDDEN, {
    summary: "Forbidden",
    detail: "The authenticated user doesn't have permission to access this resource.",
    category: ErrorCategory.AUTH,
    retryable: false,
    severity: ErrorSeverity.ERROR,
    userMessage: "You don't have permission to access this resource.",
    devMessage: "Insufficient permissions. Check user roles and resource ACLs.",
    httpStatus: 403,
    suggestions: [
      "Verify user has required permissions",
      "Check resource access control lists",
      "Contact administrator for access",
    ],
  }),

  NOT_FOUND: defineError(ErrorCode.NOT_FOUND, {
    summary: "Not found",
    detail: "The requested resource does not exist.",
    category: ErrorCategory.CLIENT,
    retryable: false,
    severity: ErrorSeverity.ERROR,
    userMessage: "The requested item was not found.",
    devMessage: "Resource not found. Verify ID/path is correct and resource exists.",
    httpStatus: 404,
    suggestions: [
      "Verify the resource ID is correct",
      "Check the resource hasn't been deleted",
      "Review API endpoint path",
    ],
  }),

  METHOD_NOT_ALLOWED: defineError(ErrorCode.METHOD_NOT_ALLOWED, {
    summary: "Method not allowed",
    detail: "The HTTP method is not supported for this endpoint.",
    category: ErrorCategory.CLIENT,
    retryable: false,
    severity: ErrorSeverity.ERROR,
    userMessage: "This operation is not supported.",
    devMessage: "HTTP method not allowed for this endpoint. Check API documentation for supported methods.",
    httpStatus: 405,
    suggestions: [
      "Check the correct HTTP method for this operation",
      "Review API documentation",
      "Verify endpoint path is correct",
    ],
  }),

  CONFLICT: defineError(ErrorCode.CONFLICT, {
    summary: "Conflict",
    detail: "The request conflicts with the current state of the resource.",
    category: ErrorCategory.CLIENT,
    retryable: false,
    severity: ErrorSeverity.ERROR,
    userMessage: "This operation conflicts with the current state. Please refresh and try again.",
    devMessage: "State conflict detected. Check for concurrent modifications or constraint violations.",
    httpStatus: 409,
    suggestions: [
      "Refresh resource state",
      "Check for concurrent modifications",
      "Verify resource constraints",
    ],
  }),

  PAYLOAD_TOO_LARGE: defineError(ErrorCode.PAYLOAD_TOO_LARGE, {
    summary: "Payload too large",
    detail: "The request payload exceeds the maximum allowed size.",
    category: ErrorCategory.CLIENT,
    retryable: false,
    severity: ErrorSeverity.ERROR,
    userMessage: "The request is too large. Please reduce the amount of data and try again.",
    devMessage: "Request exceeds maximum payload size. Check server limits and reduce payload.",
    httpStatus: 413,
    suggestions: [
      "Reduce payload size",
      "Split request into multiple smaller requests",
      "Check server payload size limits",
    ],
  }),

  UNPROCESSABLE_ENTITY: defineError(ErrorCode.UNPROCESSABLE_ENTITY, {
    summary: "Unprocessable entity",
    detail: "The request is well-formed but contains semantic errors.",
    category: ErrorCategory.CLIENT,
    retryable: false,
    severity: ErrorSeverity.ERROR,
    userMessage: "The request contains invalid data. Please check your input.",
    devMessage: "Semantic validation failed. Check business logic constraints and data relationships.",
    httpStatus: 422,
    suggestions: [
      "Validate business logic constraints",
      "Check data relationships",
      "Review validation error details",
    ],
  }),

  TOO_MANY_REQUESTS: defineError(ErrorCode.TOO_MANY_REQUESTS, {
    summary: "Too many requests",
    detail: "Rate limit exceeded. Too many requests in a given timeframe.",
    category: ErrorCategory.RATE_LIMIT,
    retryable: true,
    severity: ErrorSeverity.WARNING,
    userMessage: "Too many requests. Please wait and try again.",
    devMessage: "Rate limit exceeded. Implement backoff and check rate limit headers.",
    httpStatus: 429,
    suggestions: [
      "Implement exponential backoff",
      "Check Retry-After header",
      "Reduce request rate",
      "Consider request batching",
    ],
  }),

  //
  // ═══ Server Errors (5xx) ═══
  //

  INTERNAL_ERROR: defineError(ErrorCode.INTERNAL_ERROR, {
    summary: "Internal server error",
    detail: "The server encountered an unexpected condition. This is a server-side bug.",
    category: ErrorCategory.SERVER,
    retryable: true,
    severity: ErrorSeverity.CRITICAL,
    userMessage: "Server error occurred. Please try again later.",
    devMessage: "Internal server error. Check server logs for details.",
    httpStatus: 500,
    suggestions: [
      "Retry the request",
      "Check server logs",
      "Contact server team",
    ],
  }),

  NOT_IMPLEMENTED: defineError(ErrorCode.NOT_IMPLEMENTED, {
    summary: "Not implemented",
    detail: "The server doesn't support this operation yet.",
    category: ErrorCategory.SERVER,
    retryable: false,
    severity: ErrorSeverity.ERROR,
    userMessage: "This feature is not available yet.",
    devMessage: "Operation not implemented on server. Check API version and feature availability.",
    httpStatus: 501,
    suggestions: [
      "Check API version",
      "Review feature availability",
      "Use alternative endpoint if available",
    ],
  }),

  BAD_GATEWAY: defineError(ErrorCode.BAD_GATEWAY, {
    summary: "Bad gateway",
    detail: "The gateway or proxy received an invalid response from upstream server.",
    category: ErrorCategory.SERVER,
    retryable: true,
    severity: ErrorSeverity.ERROR,
    userMessage: "Server communication error. Please try again.",
    devMessage: "Gateway received invalid upstream response. Check proxy/gateway logs.",
    httpStatus: 502,
    suggestions: [
      "Retry the request",
      "Check gateway/proxy health",
      "Verify upstream server is functioning",
    ],
  }),

  SERVICE_UNAVAILABLE: defineError(ErrorCode.SERVICE_UNAVAILABLE, {
    summary: "Service unavailable",
    detail: "The server is temporarily unable to handle requests. May be overloaded or under maintenance.",
    category: ErrorCategory.SERVER,
    retryable: true,
    severity: ErrorSeverity.WARNING,
    userMessage: "Service temporarily unavailable. Please try again later.",
    devMessage: "Server temporarily unavailable. Check Retry-After header and server status.",
    httpStatus: 503,
    suggestions: [
      "Check Retry-After header",
      "Implement exponential backoff",
      "Check service status page",
    ],
  }),

  GATEWAY_TIMEOUT: defineError(ErrorCode.GATEWAY_TIMEOUT, {
    summary: "Gateway timeout",
    detail: "The gateway or proxy timed out waiting for upstream server response.",
    category: ErrorCategory.TIMEOUT,
    retryable: true,
    severity: ErrorSeverity.ERROR,
    userMessage: "Server timeout. Please try again.",
    devMessage: "Gateway timeout waiting for upstream. Check upstream server response time.",
    httpStatus: 504,
    suggestions: [
      "Retry the request",
      "Check upstream server performance",
      "Increase gateway timeout if reasonable",
    ],
  }),

  //
  // ═══ Configuration Errors ═══
  //

  INVALID_CONFIG: defineError(ErrorCode.INVALID_CONFIG, {
    summary: "Invalid configuration",
    detail: "The client or transport configuration is invalid.",
    category: ErrorCategory.CLIENT,
    retryable: false,
    severity: ErrorSeverity.CRITICAL,
    userMessage: "Configuration error. Please contact support.",
    devMessage: "Invalid client/transport configuration. Review initialization parameters.",
    suggestions: [
      "Review configuration parameters",
      "Check required fields are provided",
      "Verify configuration schema",
    ],
  }),

  INVALID_URL: defineError(ErrorCode.INVALID_URL, {
    summary: "Invalid URL",
    detail: "The provided URL is malformed or invalid.",
    category: ErrorCategory.CLIENT,
    retryable: false,
    severity: ErrorSeverity.ERROR,
    userMessage: "Invalid server address.",
    devMessage: "URL parsing failed. Check URL format and components.",
    suggestions: [
      "Verify URL format is correct",
      "Check protocol (http/https)",
      "Verify hostname is valid",
    ],
  }),

  INVALID_METHOD: defineError(ErrorCode.INVALID_METHOD, {
    summary: "Invalid method",
    detail: "The method specification is invalid or malformed.",
    category: ErrorCategory.CLIENT,
    retryable: false,
    severity: ErrorSeverity.ERROR,
    userMessage: "Invalid operation.",
    devMessage: "Method specification is invalid. Check service/operation names.",
    suggestions: [
      "Verify method structure is correct",
      "Check service and operation names",
      "Review Method type definition",
    ],
  }),

  //
  // ═══ Unknown ═══
  //

  UNKNOWN: defineError(ErrorCode.UNKNOWN, {
    summary: "Unknown error",
    detail: "An unexpected error occurred that couldn't be categorized.",
    category: ErrorCategory.UNKNOWN,
    retryable: false,
    severity: ErrorSeverity.ERROR,
    userMessage: "An unexpected error occurred. Please try again or contact support.",
    devMessage: "Uncategorized error. Check error details and logs for more information.",
    suggestions: [
      "Check error message for details",
      "Review logs",
      "Contact support if error persists",
    ],
  }),

  // Merge HTTP-specific errors
  ...HTTP_ERROR_REGISTRY,
} as const satisfies ErrorRegistry;

/**
 * Get error metadata by code.
 *
 * Returns UNKNOWN metadata if code not found in registry.
 */
export function getErrorMetadata(code: string): ErrorMetadata {
  return ERROR_REGISTRY[code] ?? ERROR_REGISTRY["UNKNOWN"]!;
}

/**
 * Check if an error code exists in the registry.
 */
export function isKnownError(code: string): boolean {
  return code in ERROR_REGISTRY;
}

/**
 * Get all error codes by category.
 */
export function getErrorsByCategory(category: ErrorCategory): ErrorMetadata[] {
  return Object.values(ERROR_REGISTRY).filter((meta) => meta.category === category);
}

/**
 * Get all retryable error codes.
 */
export function getRetryableErrors(): ErrorMetadata[] {
  return Object.values(ERROR_REGISTRY).filter((meta) => meta.retryable);
}

/**
 * Map HTTP status code to error code.
 */
export function httpStatusToErrorCode(status: number): string {
  const match = Object.values(ERROR_REGISTRY).find(
    (meta) => meta.httpStatus === status
  );
  return match?.code ?? "UNKNOWN";
}
