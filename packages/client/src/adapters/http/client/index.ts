/**
 * HTTP Client Transport Adapter
 *
 * Public API for HTTP client adapter.
 * Exports transport and re-exports shared utilities for convenience.
 */

// Client Transport
export { HttpTransport } from "./transport.js";
export type { HttpTransportOptions } from "./types.js";

// Re-export shared utilities for convenience
export {
  // Constants
  HTTP,
  HTTPMethod,
  HTTPStatus,
  HTTPHeaders,

  // Status Code Utilities
  HTTPStatusToCode,
  HTTPCodeMap, // Legacy alias
  isSuccessStatus,
  isClientErrorStatus,
  isServerErrorStatus,
  isRetryableStatus,
  getStatusCode,
  formatHTTPError,

  // Header Utilities
  type HeaderConverter,
  type HTTPHeadersMap,
  createDefaultHeaderConverter,

  // Strategies
  type UrlStrategy,
  type HttpMethodStrategy,
  type UrlPattern,
  defaultUrlPattern,
  restfulUrlPattern,
  restfulHttpMethodStrategy,
  postOnlyStrategy,

  // Error Utilities
  HTTPErrorCode,
  type HTTPErrorDetails,
  createHTTPStatusError,
  createNetworkError,
  createTimeoutError,
  createAbortError,
} from "../shared/index.js";
