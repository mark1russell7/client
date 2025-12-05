/**
 * HTTP Header Utilities
 *
 * Provides constants for standard HTTP headers and utilities for
 * converting between universal metadata and HTTP headers.
 */
/**
 * Standard HTTP Header Names
 *
 * Type-safe constants for commonly used HTTP headers.
 * No more magic strings!
 */
export const HTTPHeaders = {
    // Standard HTTP headers
    CONTENT_TYPE: "Content-Type",
    CONTENT_LENGTH: "Content-Length",
    AUTHORIZATION: "Authorization",
    USER_AGENT: "User-Agent",
    ACCEPT: "Accept",
    ACCEPT_ENCODING: "Accept-Encoding",
    ACCEPT_LANGUAGE: "Accept-Language",
    CACHE_CONTROL: "Cache-Control",
    CONNECTION: "Connection",
    HOST: "Host",
    ORIGIN: "Origin",
    REFERER: "Referer",
    // Custom RPC headers
    REQUEST_ID: "X-Request-Id",
    // Authentication headers
    API_KEY: "X-API-Key",
    // Tracing headers (OpenTelemetry/Jaeger compatible)
    TRACE_ID: "X-Trace-Id",
    SPAN_ID: "X-Span-Id",
    PARENT_SPAN_ID: "X-Parent-Span-Id",
    // Timeout headers
    TIMEOUT: "X-Timeout",
    // Server timing
    SERVER_TIMING: "Server-Timing",
};
/**
 * Default Header Converter Implementation
 *
 * Implements standard conventions for converting metadata to headers:
 * - Auth: Bearer token, API key
 * - Tracing: X-Trace-Id, X-Span-Id format
 * - Timeouts: X-Timeout header
 * - Custom fields: Pass through as-is
 */
export class DefaultHeaderConverter {
    metadataToHeaders(metadata) {
        const headers = {};
        // Authentication
        if (metadata.auth?.token) {
            headers[HTTPHeaders.AUTHORIZATION] = `Bearer ${metadata.auth.token}`;
        }
        if (metadata.auth?.apiKey) {
            headers[HTTPHeaders.API_KEY] = metadata.auth.apiKey;
        }
        // Distributed Tracing
        if (metadata.tracing?.traceId) {
            headers[HTTPHeaders.TRACE_ID] = metadata.tracing.traceId;
        }
        if (metadata.tracing?.spanId) {
            headers[HTTPHeaders.SPAN_ID] = metadata.tracing.spanId;
        }
        if (metadata.tracing?.parentSpanId) {
            headers[HTTPHeaders.PARENT_SPAN_ID] = metadata.tracing.parentSpanId;
        }
        // Timeouts
        if (metadata.timeout?.overall) {
            headers[HTTPHeaders.TIMEOUT] = String(metadata.timeout.overall);
        }
        // Custom fields (string values only)
        for (const [key, value] of Object.entries(metadata)) {
            // Skip known structured fields
            if (["tracing", "auth", "timeout", "retry"].includes(key)) {
                continue;
            }
            // Pass through string values
            if (typeof value === "string") {
                headers[key] = value;
            }
        }
        return headers;
    }
    headersToMetadata(headers) {
        const metadata = {};
        // Normalize to getter function
        const get = (name) => {
            if (headers instanceof Headers) {
                return headers.get(name);
            }
            return headers[name] ?? headers[name.toLowerCase()] ?? null;
        };
        // Extract tracing headers
        const traceId = get(HTTPHeaders.TRACE_ID);
        const spanId = get(HTTPHeaders.SPAN_ID);
        const parentSpanId = get(HTTPHeaders.PARENT_SPAN_ID);
        if (traceId || spanId) {
            metadata.tracing = {
                traceId: traceId || "",
                spanId: spanId || "",
                ...(parentSpanId && { parentSpanId }),
            };
        }
        // Extract timing headers
        const serverTiming = get(HTTPHeaders.SERVER_TIMING);
        if (serverTiming) {
            metadata.timing = serverTiming;
        }
        // Extract timeout
        const timeout = get(HTTPHeaders.TIMEOUT);
        if (timeout) {
            const timeoutMs = parseInt(timeout, 10);
            if (!isNaN(timeoutMs)) {
                metadata.timeout = { overall: timeoutMs };
            }
        }
        // Extract API key (but not Authorization - that's sensitive)
        const apiKey = get(HTTPHeaders.API_KEY);
        if (apiKey) {
            metadata.auth = { apiKey };
        }
        return metadata;
    }
}
/**
 * Create a default header converter instance
 */
export function createDefaultHeaderConverter() {
    return new DefaultHeaderConverter();
}
/**
 * Utility: Check if headers contain authentication
 */
export function hasAuthHeaders(headers) {
    const get = (name) => {
        if (headers instanceof Headers) {
            return headers.get(name);
        }
        return headers[name] ?? headers[name.toLowerCase()] ?? null;
    };
    return !!(get(HTTPHeaders.AUTHORIZATION) || get(HTTPHeaders.API_KEY));
}
/**
 * Utility: Check if headers contain tracing information
 */
export function hasTracingHeaders(headers) {
    const get = (name) => {
        if (headers instanceof Headers) {
            return headers.get(name);
        }
        return headers[name] ?? headers[name.toLowerCase()] ?? null;
    };
    return !!(get(HTTPHeaders.TRACE_ID) || get(HTTPHeaders.SPAN_ID));
}
/**
 * Utility: Extract request ID from headers
 */
export function getRequestId(headers) {
    if (headers instanceof Headers) {
        return headers.get(HTTPHeaders.REQUEST_ID);
    }
    return headers[HTTPHeaders.REQUEST_ID] ?? headers[HTTPHeaders.REQUEST_ID.toLowerCase()] ?? null;
}
/**
 * Utility: Set request ID in headers
 */
export function setRequestId(headers, requestId) {
    headers[HTTPHeaders.REQUEST_ID] = requestId;
}
//# sourceMappingURL=headers.js.map