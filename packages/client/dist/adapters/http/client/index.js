/**
 * HTTP Client Transport Adapter
 *
 * Public API for HTTP client adapter.
 * Exports transport and re-exports shared utilities for convenience.
 */
// Client Transport
export { HttpTransport } from "./transport.js";
// Re-export shared utilities for convenience
export { 
// Constants
HTTP, HTTPMethod, HTTPStatus, HTTPHeaders, 
// Status Code Utilities
HTTPStatusToCode, HTTPCodeMap, // Legacy alias
isSuccessStatus, isClientErrorStatus, isServerErrorStatus, isRetryableStatus, getStatusCode, formatHTTPError, createDefaultHeaderConverter, defaultUrlPattern, restfulUrlPattern, restfulHttpMethodStrategy, postOnlyStrategy, 
// Error Utilities
HTTPErrorCode, createHTTPStatusError, createNetworkError, createTimeoutError, createAbortError, } from "../shared/index.js";
//# sourceMappingURL=index.js.map