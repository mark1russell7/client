/**
 * Mock Transport Implementation
 *
 * In-memory transport that simulates network behavior for testing.
 */
import type { Transport, Message, ResponseItem } from "../../../client/types.js";
import type { MockResponse, ResponseMatcher, MockTransportOptions, CallHistoryEntry } from "./types.js";
/**
 * Mock transport implementation for testing.
 *
 * Features:
 * - Pre-configure responses for specific methods
 * - Simulate network latency with random delays
 * - Inject failures (random or specific)
 * - Track call history for test assertions
 * - Support both single and streaming responses
 *
 * @example
 * ```typescript
 * // Create mock transport with latency
 * const mock = new MockTransport({
 *   minLatency: 10,
 *   maxLatency: 50,
 * });
 *
 * // Mock a specific response
 * mock.mockResponse(
 *   (method) => method.service === "users" && method.operation === "get",
 *   {
 *     item: {
 *       status: { type: "success", code: 200, message: "OK", retryable: false },
 *       payload: { id: "123", name: "John" },
 *       metadata: {},
 *     },
 *   }
 * );
 *
 * // Use with client
 * const client = new Client({ transport: mock });
 * const response = await client.call(
 *   { service: "users", operation: "get" },
 *   { id: "123" }
 * );
 *
 * // Assert call was made
 * expect(mock.getCalls()).toHaveLength(1);
 * expect(mock.getCalls()[0].message.method.service).toBe("users");
 * ```
 */
export declare class MockTransport implements Transport {
    readonly name = "mock";
    private options;
    private responses;
    private history;
    constructor(options?: MockTransportOptions);
    /**
     * Mock a response for requests matching the predicate.
     *
     * @param matcher - Function to match requests
     * @param response - Response to return
     *
     * @example
     * ```typescript
     * mock.mockResponse(
     *   (method, payload) => method.service === "users" && payload.id === "123",
     *   { item: { status: { type: "success" }, payload: { name: "John" } } }
     * );
     * ```
     */
    mockResponse<TRes = unknown>(matcher: ResponseMatcher, response: MockResponse<TRes>): void;
    /**
     * Mock a simple success response.
     *
     * @param matcher - Function to match requests
     * @param payload - Response payload
     * @param metadata - Optional response metadata
     */
    mockSuccess<TRes = unknown>(matcher: ResponseMatcher, payload: TRes, metadata?: Record<string, unknown>): void;
    /**
     * Mock an error response.
     *
     * @param matcher - Function to match requests
     * @param message - Error message
     */
    mockError(matcher: ResponseMatcher, message: string): void;
    /**
     * Mock a streaming response with multiple items.
     *
     * @param matcher - Function to match requests
     * @param items - Array of response items to stream
     */
    mockStream<TRes = unknown>(matcher: ResponseMatcher, items: ResponseItem<TRes>[]): void;
    /**
     * Clear all mocked responses.
     */
    clearMocks(): void;
    /**
     * Get call history for assertions.
     *
     * @returns Array of call history entries
     */
    getCalls(): CallHistoryEntry[];
    /**
     * Get calls matching a predicate.
     *
     * @param predicate - Function to filter calls
     * @returns Filtered call history
     */
    getCallsMatching(predicate: (entry: CallHistoryEntry) => boolean): CallHistoryEntry[];
    /**
     * Get the last call made.
     *
     * @returns Last call history entry or undefined
     */
    getLastCall(): CallHistoryEntry | undefined;
    /**
     * Clear call history.
     */
    clearHistory(): void;
    /**
     * Reset mock transport (clear mocks and history).
     */
    reset(): void;
    /**
     * Send message and receive streaming responses.
     */
    send<TReq, TRes>(message: Message<TReq>): AsyncIterable<ResponseItem<TRes>>;
    /**
     * Close transport (no-op for mock).
     */
    close(): Promise<void>;
    /**
     * Simulate network latency with random delay.
     */
    private simulateLatency;
    /**
     * Check if this request should randomly fail.
     */
    private shouldFail;
    /**
     * Find mocked response matching the message.
     */
    private findResponse;
    /**
     * Record call in history if tracking is enabled.
     */
    private recordCall;
}
//# sourceMappingURL=transport.d.ts.map