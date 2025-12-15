/**
 * Mock Client Transport Adapter
 *
 * Public API for Mock client adapter.
 */

// Types
export type {
  MockTransportOptions,
  MockResponse,
  ResponseMatcher,
  CallHistoryEntry,
} from "./types.js";

// Transport
export { MockTransport } from "./transport.js";

// Builder
export { mockBuilder } from "./builder.js";
