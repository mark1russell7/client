/**
 * Mock Transport Implementation
 *
 * In-memory transport that simulates network behavior for testing.
 */
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
export class MockTransport {
    name = "mock";
    options;
    responses = new Map();
    history = [];
    constructor(options = {}) {
        this.options = {
            minLatency: options.minLatency ?? 0,
            maxLatency: options.maxLatency ?? 0,
            failureRate: options.failureRate ?? 0,
            defaultErrorMessage: options.defaultErrorMessage ?? "Mock transport error",
            trackHistory: options.trackHistory ?? true,
            maxHistorySize: options.maxHistorySize ?? 1000,
        };
    }
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
    mockResponse(matcher, response) {
        this.responses.set(matcher, response);
    }
    /**
     * Mock a simple success response.
     *
     * @param matcher - Function to match requests
     * @param payload - Response payload
     * @param metadata - Optional response metadata
     */
    mockSuccess(matcher, payload, metadata = {}) {
        this.mockResponse(matcher, {
            item: {
                id: "mock",
                status: {
                    type: "success",
                    code: 200,
                },
                payload,
                metadata,
            },
        });
    }
    /**
     * Mock an error response.
     *
     * @param matcher - Function to match requests
     * @param message - Error message
     */
    mockError(matcher, message) {
        this.mockResponse(matcher, {
            error: new Error(message),
        });
    }
    /**
     * Mock a streaming response with multiple items.
     *
     * @param matcher - Function to match requests
     * @param items - Array of response items to stream
     */
    mockStream(matcher, items) {
        this.mockResponse(matcher, { items });
    }
    /**
     * Clear all mocked responses.
     */
    clearMocks() {
        this.responses.clear();
    }
    /**
     * Get call history for assertions.
     *
     * @returns Array of call history entries
     */
    getCalls() {
        return [...this.history];
    }
    /**
     * Get calls matching a predicate.
     *
     * @param predicate - Function to filter calls
     * @returns Filtered call history
     */
    getCallsMatching(predicate) {
        return this.history.filter(predicate);
    }
    /**
     * Get the last call made.
     *
     * @returns Last call history entry or undefined
     */
    getLastCall() {
        return this.history[this.history.length - 1];
    }
    /**
     * Clear call history.
     */
    clearHistory() {
        this.history = [];
    }
    /**
     * Reset mock transport (clear mocks and history).
     */
    reset() {
        this.clearMocks();
        this.clearHistory();
    }
    /**
     * Send message and receive streaming responses.
     */
    async *send(message) {
        // Simulate latency
        await this.simulateLatency();
        // Check for random failure
        if (this.shouldFail()) {
            const error = new Error(this.options.defaultErrorMessage);
            this.recordCall(message, false, error);
            throw error;
        }
        // Find matching response
        const mockResponse = this.findResponse(message);
        if (!mockResponse) {
            // No mock configured - return default success
            const defaultResponse = {
                id: message.id,
                status: {
                    type: "success",
                    code: 200,
                },
                payload: {},
                metadata: {},
            };
            this.recordCall(message, true);
            yield defaultResponse;
            return;
        }
        // Check if this mock has been exhausted
        if (mockResponse.count !== undefined && mockResponse.count <= 0) {
            const error = new Error("Mock response exhausted (count reached 0)");
            this.recordCall(message, false, error);
            throw error;
        }
        // Decrement count if specified
        if (mockResponse.count !== undefined) {
            mockResponse.count--;
        }
        // Apply custom delay if specified
        if (mockResponse.delay !== undefined) {
            await new Promise((resolve) => setTimeout(resolve, mockResponse.delay));
        }
        // Handle error response
        if (mockResponse.error) {
            this.recordCall(message, false, mockResponse.error);
            throw mockResponse.error;
        }
        // Handle streaming response
        if (mockResponse.items) {
            for (const item of mockResponse.items) {
                // Check if request was aborted
                if (message.signal?.aborted) {
                    const error = new Error("Request aborted");
                    this.recordCall(message, false, error);
                    throw error;
                }
                yield item;
            }
            this.recordCall(message, true);
            return;
        }
        // Handle single item response
        if (mockResponse.item) {
            this.recordCall(message, true);
            yield mockResponse.item;
            return;
        }
        // Fallback: empty success
        this.recordCall(message, true);
    }
    /**
     * Close transport (no-op for mock).
     */
    async close() {
        // No resources to cleanup
    }
    /**
     * Simulate network latency with random delay.
     */
    async simulateLatency() {
        const { minLatency, maxLatency } = this.options;
        if (minLatency === 0 && maxLatency === 0) {
            return;
        }
        const delay = minLatency + Math.random() * (maxLatency - minLatency);
        await new Promise((resolve) => setTimeout(resolve, delay));
    }
    /**
     * Check if this request should randomly fail.
     */
    shouldFail() {
        return Math.random() < this.options.failureRate;
    }
    /**
     * Find mocked response matching the message.
     */
    findResponse(message) {
        for (const [matcher, response] of this.responses) {
            if (matcher(message.method, message.payload)) {
                return response;
            }
        }
        return undefined;
    }
    /**
     * Record call in history if tracking is enabled.
     */
    recordCall(message, success, error) {
        if (!this.options.trackHistory) {
            return;
        }
        const entry = {
            message,
            timestamp: Date.now(),
            success,
            error,
        };
        this.history.push(entry);
        // Limit history size to prevent memory leaks
        if (this.history.length > this.options.maxHistorySize) {
            this.history.shift();
        }
    }
}
//# sourceMappingURL=transport.js.map