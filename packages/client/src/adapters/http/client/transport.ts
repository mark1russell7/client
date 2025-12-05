/**
 * HTTP Client Transport Implementation
 *
 * Converts universal client protocol to HTTP requests using
 * shared utilities and injectable strategies.
 */

import type {
  Transport,
  Message,
  ResponseItem,
} from "../../../client/types";

import type { HttpTransportOptions } from "./types";

import {
  HTTP,
  HTTPMethod,
  HTTPStatus,
  HTTPHeaders,
  type UrlStrategy,
  type HttpMethodStrategy,
  type HeaderConverter,
  defaultUrlPattern,
  restfulHttpMethodStrategy,
  createDefaultHeaderConverter,
  isSuccessStatus,
  createHTTPStatusError,
  createAbortError,
  createErrorFromException,
  isValidJSONPayload,
} from "../shared";

/**
 * HTTP Client Transport
 *
 * Simplified, protocol-focused transport that uses:
 * - Shared status code utilities
 * - Injectable header converter
 * - Injectable URL/method strategies
 * - Type-safe error handling
 *
 * Cross-cutting concerns (auth, tracing, timeout) are handled by middleware.
 *
 * @example
 * ```typescript
 * const transport = new HttpTransport({
 *   baseUrl: "https://api.example.com",
 *   urlStrategy: defaultUrlPattern.format,
 *   httpMethodStrategy: restfulHttpMethodStrategy,
 *   headerConverter: createDefaultHeaderConverter(),
 * });
 *
 * const client = new Client({ transport });
 * ```
 */
export class HttpTransport implements Transport {
  readonly name = HTTP;

  private readonly baseUrl: string;
  private readonly urlStrategy: UrlStrategy;
  private readonly httpMethodStrategy: HttpMethodStrategy;
  private readonly headerConverter: HeaderConverter;
  private readonly defaultHeaders: Record<string, string>;
  private readonly timeout: number | undefined;

  constructor(options: HttpTransportOptions) {
    this.baseUrl = options.baseUrl;
    this.urlStrategy = options.urlStrategy || defaultUrlPattern.format;
    this.httpMethodStrategy =
      options.httpMethodStrategy || restfulHttpMethodStrategy;
    this.headerConverter =
      options.headerConverter || createDefaultHeaderConverter();
    this.defaultHeaders = options.defaultHeaders || {};
    this.timeout = options.timeout;
  }

  /**
   * Send HTTP request and yield single response.
   *
   * HTTP is request/response, so this yields exactly one item.
   */
  async *send<TReq, TRes>(
    message: Message<TReq>
  ): AsyncIterable<ResponseItem<TRes>> {
    // Convert Method → URL
    const url = this.urlStrategy(message.method, this.baseUrl);

    // Convert Method → HTTP method
    const httpMethod = this.httpMethodStrategy(message.method);

    // Convert Metadata → Headers (using injected converter)
    const metadataHeaders = this.headerConverter.metadataToHeaders(message.metadata);

    // Handle timeout via AbortSignal
    let signal = message.signal;
    let timeoutId: NodeJS.Timeout | undefined;

    if (this.timeout && !signal) {
      const controller = new AbortController();
      signal = controller.signal;
      timeoutId = setTimeout(() => controller.abort(), this.timeout);
    }

    try {
      // Build fetch options
      const fetchOptions: RequestInit = {
        method: httpMethod,
        headers: {
          [HTTPHeaders.CONTENT_TYPE]: "application/json",
          ...this.defaultHeaders,
          ...metadataHeaders,
        },
      };

      // Only add body for non-GET requests
      if (httpMethod !== HTTPMethod.GET && isValidJSONPayload(message.payload)) {
        fetchOptions.body = JSON.stringify(message.payload);
      }

      // Only add signal if present
      if (signal) {
        fetchOptions.signal = signal;
      }

      // Execute HTTP request
      const response = await fetch(url, fetchOptions);

      // Parse response body
      const responseBody = await this.parseResponseBody(response);

      // Convert HTTP status → Universal Status (using shared utilities)
      const status = this.httpStatusToUniversal(response.status as HTTPStatus);

      // Yield single response item
      yield {
        id: message.id,
        status,
        payload: responseBody as TRes,
        metadata: this.headerConverter.headersToMetadata(response.headers),
      };
    } catch (error) {
      // Handle fetch errors using shared error utilities
      const errorDetails = error instanceof Error
        ? this.categorizeError(error)
        : createErrorFromException(new Error("Unknown error"));

      yield {
        id: message.id,
        status: {
          type: "error",
          code: errorDetails.code,
          message: errorDetails.message,
          retryable: errorDetails.retryable,
        },
        payload: null as TRes,
        metadata: {},
      };
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  /**
   * Convert HTTP status code → Universal Status (using shared utilities)
   */
  private httpStatusToUniversal(
    httpStatus: HTTPStatus
  ): ResponseItem<unknown>["status"] {
    // Success (2xx)
    if (isSuccessStatus(httpStatus)) {
      return {
        type: "success",
        code: httpStatus,
      };
    }

    // Error (4xx, 5xx) - use shared error creation
    const errorDetails = createHTTPStatusError(httpStatus);

    return {
      type: "error",
      code: errorDetails.code,
      message: errorDetails.message,
      retryable: errorDetails.retryable,
    };
  }

  /**
   * Categorize error from exception (using shared utilities)
   */
  private categorizeError(error: Error) {
    // Check for abort
    if (error.name === "AbortError") {
      return createAbortError();
    }

    // Use shared error categorization
    return createErrorFromException(error);
  }

  /**
   * Parse response body (handles JSON and text)
   */
  private async parseResponseBody(response: Response): Promise<unknown> {
    const contentType = response.headers.get(HTTPHeaders.CONTENT_TYPE);

    if (contentType?.includes("application/json")) {
      try {
        return await response.json();
      } catch {
        // Fallback to text if JSON parsing fails
        return await response.text();
      }
    }

    return await response.text();
  }

  /**
   * Close transport (no-op for HTTP)
   */
  async close(): Promise<void> {
    // HTTP connections are managed by fetch, nothing to close
  }
}
