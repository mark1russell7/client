/**
 * Universal Client Library
 *
 * Protocol-agnostic RPC client with middleware composition,
 * transport adapters, and a rich collections framework.
 */
export * from "./collections";
export { Client, ClientError } from "./client";
export { HttpTransport, LocalTransport, WebSocketTransport, MockTransport, mockBuilder, } from "./client";
export { defaultUrlPattern, restfulHttpMethodStrategy, postOnlyStrategy, } from "./client";
export type { Transport, Method, Metadata, Message, ResponseItem, Status, ClientContext, ClientRunner, ClientMiddleware, ClientOptions, HttpTransportOptions, UrlStrategy, HttpMethodStrategy, LocalTransportOptions, Handler, WebSocketTransportOptions, WebSocketState, MockTransportOptions, MockResponse, ResponseMatcher, CallHistoryEntry, } from "./client";
export type { ErrorMetadata, ErrorRegistry, ErrorContext, RichError } from "./client";
export { ErrorSeverity, ErrorCategory } from "./client";
export { ERROR_REGISTRY, getErrorMetadata, isKnownError, createError, createErrorFromHTTPStatus, createErrorFromException, formatError, } from "./client";
//# sourceMappingURL=index.d.ts.map