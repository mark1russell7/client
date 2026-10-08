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
} from "../../../client/types.js";

import type { HttpTransportOptions } from "./types.js";

/** The media type of a stream response: one JSON value on each line. */
const NDJSON = "application/x-ndjson";

import {
  HTTP,
  HTTPMethod,
  HTTPStatus,
  HTTPHeaders,
  type UrlStrategy,
  type HttpMethodStrategy,
  type HeaderConverter,
  defaultUrlPattern,
  postOnlyStrategy,
  createDefaultHeaderConverter,
  isSuccessStatus,
  createHTTPStatusError,
  createAbortError,
  createErrorFromException,
  isValidJSONPayload,
} from "../shared/index.js";

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
  readonly name: typeof HTTP = HTTP;

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
      options.httpMethodStrategy || postOnlyStrategy;
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

    // One controller for the request: the message's signal, the timeout and an early stop of
    // the reader all abort it
    const controller = new AbortController();
    const onAbort = (): void => controller.abort();
    if (message.signal?.aborted) controller.abort();
    message.signal?.addEventListener("abort", onAbort, { once: true });
    const timeoutId = this.timeout ? setTimeout(() => controller.abort(), this.timeout) : undefined;
    let finished = false;

    try {
      // Build fetch options
      const fetchOptions: RequestInit = {
        method: httpMethod,
        headers: {
          [HTTPHeaders.CONTENT_TYPE]: "application/json",
          // A streaming procedure answers with NDJSON; other procedures with JSON
          Accept: `${NDJSON}, application/json`,
          ...this.defaultHeaders,
          ...metadataHeaders,
        },
        signal: controller.signal,
      };

      // Only add body for non-GET requests
      if (httpMethod !== HTTPMethod.GET && isValidJSONPayload(message.payload)) {
        fetchOptions.body = JSON.stringify(message.payload);
      }

      // Execute HTTP request
      const response = await fetch(url, fetchOptions);
      const metadata = this.headerConverter.headersToMetadata(response.headers);

      if (response.headers.get(HTTPHeaders.CONTENT_TYPE)?.includes(NDJSON) && response.body) {
        yield* this.readNdjson<TRes>(message.id, response.body, metadata, () => (finished = true));
        return;
      }

      // Parse response body
      const responseBody = await this.parseResponseBody(response);

      // Convert HTTP status → Universal Status (using shared utilities). An error body of the
      // server transport ({ error, code, retryable }) gives the real code and message: before,
      // the client kept only the HTTP status ("HTTP 500").
      const status = this.httpStatusToUniversal(response.status as HTTPStatus, responseBody);
      finished = true;

      // Yield single response item
      yield {
        id: message.id,
        status,
        payload: responseBody as TRes,
        metadata,
      };
    } catch (error) {
      finished = true;
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
      if (timeoutId) clearTimeout(timeoutId);
      message.signal?.removeEventListener("abort", onAbort);
      // The reader stopped before the end of a stream: the server stops it
      if (!finished) controller.abort();
    }
  }

  /**
   * The items of an NDJSON stream response: `{"type":"item"}` lines, then `{"type":"done"}`,
   * or an `{"type":"error"}` line. A stream that ends without one of the last two is an error
   * that a retry can repair (the connection broke).
   */
  private async *readNdjson<TRes>(
    id: string,
    body: ReadableStream<Uint8Array>,
    metadata: ResponseItem<TRes>["metadata"],
    onEnd: () => void
  ): AsyncGenerator<ResponseItem<TRes>, void, undefined> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let newline: number;
        while ((newline = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          if (!line) continue;
          const frame = JSON.parse(line) as {
            type: string;
            payload?: unknown;
            error?: { code?: string; message?: string; retryable?: boolean };
          };
          if (frame.type === "item") {
            yield { id, status: { type: "success", code: 200 }, payload: frame.payload as TRes, metadata };
          } else if (frame.type === "done") {
            onEnd();
            return;
          } else if (frame.type === "error") {
            onEnd();
            yield {
              id,
              status: {
                type: "error",
                code: frame.error?.code ?? "HANDLER_ERROR",
                message: frame.error?.message ?? "Unknown error",
                retryable: frame.error?.retryable ?? false,
              },
              payload: null as TRes,
              metadata,
            };
            return;
          }
        }
      }
      onEnd();
      yield {
        id,
        status: { type: "error", code: "STREAM_ENDED", message: "The stream ended without its end line", retryable: true },
        payload: null as TRes,
        metadata,
      };
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Convert HTTP status code → Universal Status (using shared utilities)
   */
  private httpStatusToUniversal(
    httpStatus: HTTPStatus,
    body?: unknown
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
    const serverError =
      body !== null && typeof body === "object" ? (body as { error?: unknown; code?: unknown; retryable?: unknown }) : undefined;

    return {
      type: "error",
      code: typeof serverError?.code === "string" ? serverError.code : errorDetails.code,
      message: typeof serverError?.error === "string" ? serverError.error : errorDetails.message,
      retryable: typeof serverError?.retryable === "boolean" ? serverError.retryable : errorDetails.retryable,
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

    // A Response body can only be consumed once. The previous code called response.json() and,
    // on failure, response.text() — which throws "Body is unusable" because json() already read
    // it, masking the real error. Read as text once, then parse. See BUGS-2026-07.md (M6).
    const text = await response.text();

    if (contentType?.includes("application/json")) {
      try {
        return JSON.parse(text);
      } catch {
        // Not valid JSON despite the content-type — fall back to the raw text.
        return text;
      }
    }

    return text;
  }

  /**
   * Close transport (no-op for HTTP)
   */
  async close(): Promise<void> {
    // HTTP connections are managed by fetch, nothing to close
  }
}
