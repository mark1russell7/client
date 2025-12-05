/**
 * HTTP Client Transport Implementation
 *
 * Converts universal client protocol to HTTP requests using
 * shared utilities and injectable strategies.
 */
import type { Transport, Message, ResponseItem } from "../../../client/types";
import type { HttpTransportOptions } from "./types";
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
export declare class HttpTransport implements Transport {
    readonly name: "HTTP";
    private readonly baseUrl;
    private readonly urlStrategy;
    private readonly httpMethodStrategy;
    private readonly headerConverter;
    private readonly defaultHeaders;
    private readonly timeout;
    constructor(options: HttpTransportOptions);
    /**
     * Send HTTP request and yield single response.
     *
     * HTTP is request/response, so this yields exactly one item.
     */
    send<TReq, TRes>(message: Message<TReq>): AsyncIterable<ResponseItem<TRes>>;
    /**
     * Convert HTTP status code → Universal Status (using shared utilities)
     */
    private httpStatusToUniversal;
    /**
     * Categorize error from exception (using shared utilities)
     */
    private categorizeError;
    /**
     * Parse response body (handles JSON and text)
     */
    private parseResponseBody;
    /**
     * Close transport (no-op for HTTP)
     */
    close(): Promise<void>;
}
//# sourceMappingURL=transport.d.ts.map