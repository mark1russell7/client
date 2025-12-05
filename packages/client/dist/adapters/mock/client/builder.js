/**
 * Mock Builder
 *
 * Fluent API for configuring mock responses.
 */
/**
 * Create a mock response builder for fluent API.
 *
 * @example
 * ```typescript
 * const mock = new MockTransport();
 *
 * mockBuilder(mock)
 *   .when((method) => method.service === "users")
 *   .thenReturn({ id: "123", name: "John" });
 *
 * mockBuilder(mock)
 *   .when((method) => method.service === "orders")
 *   .thenError("Order service unavailable");
 * ```
 */
export function mockBuilder(transport) {
    let currentMatcher = null;
    return {
        when(matcher) {
            currentMatcher = matcher;
            return this;
        },
        thenReturn(payload, metadata = {}) {
            if (!currentMatcher) {
                throw new Error("Must call when() before thenReturn()");
            }
            transport.mockSuccess(currentMatcher, payload, metadata);
            return this;
        },
        thenError(message) {
            if (!currentMatcher) {
                throw new Error("Must call when() before thenError()");
            }
            transport.mockError(currentMatcher, message);
            return this;
        },
        thenStream(items) {
            if (!currentMatcher) {
                throw new Error("Must call when() before thenStream()");
            }
            transport.mockStream(currentMatcher, items);
            return this;
        },
    };
}
//# sourceMappingURL=builder.js.map