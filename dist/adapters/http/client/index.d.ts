/**
 * HTTP Client Transport Adapter
 *
 * Public API for HTTP client adapter.
 * Exports transport and re-exports shared utilities for convenience.
 */
export { HttpTransport } from "./transport";
export type { HttpTransportOptions } from "./types";
export { HTTP, HTTPMethod, HTTPStatus, HTTPHeaders, HTTPStatusToCode, HTTPCodeMap, // Legacy alias
isSuccessStatus, isClientErrorStatus, isServerErrorStatus, isRetryableStatus, getStatusCode, formatHTTPError, type HeaderConverter, type HTTPHeadersMap, createDefaultHeaderConverter, type UrlStrategy, type HttpMethodStrategy, type UrlPattern, defaultUrlPattern, restfulUrlPattern, restfulHttpMethodStrategy, postOnlyStrategy, HTTPErrorCode, type HTTPErrorDetails, createHTTPStatusError, createNetworkError, createTimeoutError, createAbortError, } from "../shared";
//# sourceMappingURL=index.d.ts.map