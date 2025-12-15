/**
 * HTTP Header Utilities
 *
 * Provides constants for standard HTTP headers and utilities for
 * converting between universal metadata and HTTP headers.
 */
import type { Metadata } from "../../../client/types.js";
/**
 * Standard HTTP Header Names
 *
 * Type-safe constants for commonly used HTTP headers.
 * No more magic strings!
 */
export declare const HTTPHeaders: {
    readonly CONTENT_TYPE: "Content-Type";
    readonly CONTENT_LENGTH: "Content-Length";
    readonly AUTHORIZATION: "Authorization";
    readonly USER_AGENT: "User-Agent";
    readonly ACCEPT: "Accept";
    readonly ACCEPT_ENCODING: "Accept-Encoding";
    readonly ACCEPT_LANGUAGE: "Accept-Language";
    readonly CACHE_CONTROL: "Cache-Control";
    readonly CONNECTION: "Connection";
    readonly HOST: "Host";
    readonly ORIGIN: "Origin";
    readonly REFERER: "Referer";
    readonly REQUEST_ID: "X-Request-Id";
    readonly API_KEY: "X-API-Key";
    readonly TRACE_ID: "X-Trace-Id";
    readonly SPAN_ID: "X-Span-Id";
    readonly PARENT_SPAN_ID: "X-Parent-Span-Id";
    readonly TIMEOUT: "X-Timeout";
    readonly SERVER_TIMING: "Server-Timing";
};
/**
 * Type for HTTP header names
 */
export type HTTPHeader = (typeof HTTPHeaders)[keyof typeof HTTPHeaders];
/**
 * Type for HTTP headers object
 */
export type HTTPHeadersMap = Record<string, string>;
/**
 * Header Converter Interface
 *
 * Defines the contract for converting between universal Metadata
 * and protocol-specific HTTP headers.
 *
 * This abstraction allows:
 * - Custom header naming conventions
 * - Different authentication schemes
 * - Multiple tracing formats
 * - Extensible serialization strategies
 */
export interface HeaderConverter {
    /**
     * Convert universal metadata to HTTP headers
     *
     * @param metadata - Universal metadata
     * @returns HTTP headers map
     */
    metadataToHeaders(metadata: Metadata): HTTPHeadersMap;
    /**
     * Convert HTTP headers to universal metadata
     *
     * @param headers - HTTP headers (Headers or plain object)
     * @returns Universal metadata
     */
    headersToMetadata(headers: Headers | HTTPHeadersMap): Metadata;
}
/**
 * Default Header Converter Implementation
 *
 * Implements standard conventions for converting metadata to headers:
 * - Auth: Bearer token, API key
 * - Tracing: X-Trace-Id, X-Span-Id format
 * - Timeouts: X-Timeout header
 * - Custom fields: Pass through as-is
 */
export declare class DefaultHeaderConverter implements HeaderConverter {
    metadataToHeaders(metadata: Metadata): HTTPHeadersMap;
    headersToMetadata(headers: Headers | HTTPHeadersMap): Metadata;
}
/**
 * Create a default header converter instance
 */
export declare function createDefaultHeaderConverter(): HeaderConverter;
/**
 * Utility: Check if headers contain authentication
 */
export declare function hasAuthHeaders(headers: Headers | HTTPHeadersMap): boolean;
/**
 * Utility: Check if headers contain tracing information
 */
export declare function hasTracingHeaders(headers: Headers | HTTPHeadersMap): boolean;
/**
 * Utility: Extract request ID from headers
 */
export declare function getRequestId(headers: Headers | HTTPHeadersMap): string | null;
/**
 * Utility: Set request ID in headers
 */
export declare function setRequestId(headers: HTTPHeadersMap, requestId: string): void;
//# sourceMappingURL=headers.d.ts.map