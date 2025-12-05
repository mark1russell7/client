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
export function mockBuilder(transport: MockTransport) {
  let currentMatcher: ResponseMatcher | null = null;

  return {
    when(matcher: ResponseMatcher) {
      currentMatcher = matcher;
      return this;
    },

    thenReturn<TRes>(payload: TRes, metadata: Record<string, unknown> = {}) {
      if (!currentMatcher) {
        throw new Error("Must call when() before thenReturn()");
      }
      transport.mockSuccess(currentMatcher, payload, metadata);
      return this;
    },

    thenError(message: string) {
      if (!currentMatcher) {
        throw new Error("Must call when() before thenError()");
      }
      transport.mockError(currentMatcher, message);
      return this;
    },

    thenStream<TRes>(items: ResponseItem<TRes>[]) {
      if (!currentMatcher) {
        throw new Error("Must call when() before thenStream()");
      }
      transport.mockStream(currentMatcher, items);
      return this;
    },
  };
}
