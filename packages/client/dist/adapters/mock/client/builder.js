/**
 * Mock Builder
 *
 * Fluent API for configuring mock responses.
 */
export class MockResponseBuilder {
    transport;
    matcher;
    constructor(transport, matcher) {
        this.transport = transport;
        this.matcher = matcher;
    }
    thenReturn(payload, metadata = {}) {
        if (!this.matcher) {
            throw new Error("Must call when() before thenReturn()");
        }
        this.transport.mockSuccess(this.matcher, payload, metadata);
        return this;
    }
    thenError(message) {
        if (!this.matcher) {
            throw new Error("Must call when() before thenError()");
        }
        this.transport.mockError(this.matcher, message);
        return this;
    }
    thenStream(items) {
        if (!this.matcher) {
            throw new Error("Must call when() before thenStream()");
        }
        this.transport.mockStream(this.matcher, items);
        return this;
    }
    when(matcher) {
        this.matcher = matcher;
        return this;
    }
}
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
    return new MockResponseBuilder(transport, null);
}
//# sourceMappingURL=builder.js.map