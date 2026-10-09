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

  // The custom metadata of a request, as URI-encoded JSON (deep dive TRN-11)
  METADATA: "X-Metadata",

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
  /**
   * Custom fields: a string value with a header-safe key and a Latin-1 value also goes as its
   * own header (for servers that read headers). Every custom field, of any JSON type, goes in
   * the `X-Metadata` header. Before, only string values got through, and a non-Latin-1 value
   * or a key with a space failed the call (deep dive TRN-11). Keys that start with "__" are
   * internal to the process and never go.
   *
   * @throws an error with code METADATA_TOO_LARGE when `X-Metadata` is longer than
   *   METADATA_HEADER_LIMIT characters
   */
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

    const custom: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(metadata)) {
      // Skip known structured fields and the internal keys
      if (STRUCTURED_FIELDS.has(key) || key.startsWith("__") || value === undefined) {
        continue;
      }
      custom[key] = value;
      if (typeof value === "string" && HEADER_TOKEN.test(key) && LATIN1.test(value)) {
        headers[key] = value;
      }
    }

    if (Object.keys(custom).length > 0) {
      const encoded = encodeURIComponent(JSON.stringify(custom));
      if (encoded.length > METADATA_HEADER_LIMIT) {
        throw Object.assign(
          new Error(`The request metadata is too large for a header (${encoded.length} > ${METADATA_HEADER_LIMIT} characters)`),
          { code: "METADATA_TOO_LARGE" },
        );
      }
      headers[HTTPHeaders.METADATA] = encoded;
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

/** The metadata fields that have their own headers, and the middleware state: not custom fields. */
const STRUCTURED_FIELDS = new Set(["tracing", "auth", "timeout", "retry"]);

/** A header name: the "token" characters of RFC 9110. */
const HEADER_TOKEN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

/** A header value that fetch accepts: Latin-1, with no control characters but tab. */
const LATIN1 = /^[\t\x20-\x7e\x80-\xff]*$/;

/** The longest `X-Metadata` value, in characters. */
export const METADATA_HEADER_LIMIT = 8192;

/**
 * This function reads the `X-Metadata` header: the custom metadata as an object, or undefined
 * when the value is not URI-encoded JSON of an object.
 */
export function decodeMetadataHeader(value: string | undefined | null): Record<string, unknown> | undefined {
  if (!value || value.length > METADATA_HEADER_LIMIT) return undefined;
  try {
    const decoded = JSON.parse(decodeURIComponent(value)) as unknown;
    if (decoded === null || typeof decoded !== "object" || Array.isArray(decoded)) return undefined;
    return decoded as Record<string, unknown>;
  } catch {
    return undefined;
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
