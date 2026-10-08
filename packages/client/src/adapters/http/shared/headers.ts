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
} as const;

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
export class DefaultHeaderConverter implements HeaderConverter {
  metadataToHeaders(metadata: Metadata): HTTPHeadersMap {
    const headers: HTTPHeadersMap = {};

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

  headersToMetadata(headers: Headers | HTTPHeadersMap): Metadata {
    const metadata: Metadata = {};

    // Normalize to getter function
    const get = (name: string): string | null => {
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
      metadata["timing"] = serverTiming;
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
export function createDefaultHeaderConverter(): HeaderConverter {
  return new DefaultHeaderConverter();
}

/**
 * Utility: Check if headers contain authentication
 */
export function hasAuthHeaders(headers: Headers | HTTPHeadersMap): boolean {
  const get = (name: string): string | null => {
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
export function hasTracingHeaders(headers: Headers | HTTPHeadersMap): boolean {
  const get = (name: string): string | null => {
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
export function getRequestId(headers: Headers | HTTPHeadersMap): string | null {
  if (headers instanceof Headers) {
    return headers.get(HTTPHeaders.REQUEST_ID);
  }
  return headers[HTTPHeaders.REQUEST_ID] ?? headers[HTTPHeaders.REQUEST_ID.toLowerCase()] ?? null;
}

/**
 * Utility: Set request ID in headers
 */
export function setRequestId(headers: HTTPHeadersMap, requestId: string): void {
  headers[HTTPHeaders.REQUEST_ID] = requestId;
}
