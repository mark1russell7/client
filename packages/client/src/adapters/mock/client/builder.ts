/**
 * Mock Builder
 *
 * Fluent API for configuring mock responses.
 */

import type { ResponseItem } from "../../../client/types.js";
import type { ResponseMatcher } from "./types.js";
import type { MockTransport } from "./transport.js";


export class MockResponseBuilder {
  private transport: MockTransport;
  private matcher: ResponseMatcher;
  constructor(transport: MockTransport, matcher: ResponseMatcher) {
    this.transport = transport;
    this.matcher = matcher;
  }
  thenReturn<TRes>(payload: TRes, metadata: Record<string, unknown> = {}) : this {
      if (!this.matcher) {
        throw new Error("Must call when() before thenReturn()");
      }
      this.transport.mockSuccess(this.matcher, payload, metadata);
      return this;
    }
  thenError(message: string) : this {
      if (!this.matcher) {
        throw new Error("Must call when() before thenError()");
      }
      this.transport.mockError(this.matcher, message);
      return this;
    }
  thenStream<TRes>(items: ResponseItem<TRes>[]) : this {
      if (!this.matcher) {
        throw new Error("Must call when() before thenStream()");
      }
      this.transport.mockStream(this.matcher, items);
      return this;
    }
  when(matcher: ResponseMatcher) : this {
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
export function mockBuilder(transport: MockTransport) : MockResponseBuilder {
  return new MockResponseBuilder(transport, null as any);
}
