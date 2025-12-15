/**
 * Mock Builder
 *
 * Fluent API for configuring mock responses.
 */
import type { ResponseItem } from "../../../client/types.js";
import type { ResponseMatcher } from "./types.js";
import type { MockTransport } from "./transport.js";
export declare class MockResponseBuilder {
    private transport;
    private matcher;
    constructor(transport: MockTransport, matcher: ResponseMatcher);
    thenReturn<TRes>(payload: TRes, metadata?: Record<string, unknown>): this;
    thenError(message: string): this;
    thenStream<TRes>(items: ResponseItem<TRes>[]): this;
    when(matcher: ResponseMatcher): this;
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
export declare function mockBuilder(transport: MockTransport): MockResponseBuilder;
//# sourceMappingURL=builder.d.ts.map