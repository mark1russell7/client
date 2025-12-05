/**
 * Mock Builder
 *
 * Fluent API for configuring mock responses.
 */
import type { ResponseItem } from "../../../client/types";
import type { ResponseMatcher } from "./types";
import type { MockTransport } from "./transport";
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
export declare function mockBuilder(transport: MockTransport): {
    when(matcher: ResponseMatcher): /*elided*/ any;
    thenReturn<TRes>(payload: TRes, metadata?: Record<string, unknown>): /*elided*/ any;
    thenError(message: string): /*elided*/ any;
    thenStream<TRes>(items: ResponseItem<TRes>[]): /*elided*/ any;
};
//# sourceMappingURL=builder.d.ts.map