/**
 * HTTP Client Transport Types
 *
 * Client-specific configuration for HTTP adapter.
 * Uses shared HTTP utilities to avoid duplication.
 */

import type { UrlStrategy, HttpMethodStrategy, HeaderConverter } from "../shared/index.js";
import type { Duration } from "../../../duration.js";

/**
 * HTTP Client Transport Configuration
 *
 * Options for configuring the HTTP client transport.
 */
export interface HttpTransportOptions {
  /** Base URL for all requests */
  baseUrl: string;

  /** URL generation strategy (default: defaultUrlPattern) */
  urlStrategy?: UrlStrategy;

  /** HTTP method generation strategy (default: restfulHttpMethodStrategy) */
  httpMethodStrategy?: HttpMethodStrategy;

  /** Header converter for metadata <-> headers (default: DefaultHeaderConverter) */
  headerConverter?: HeaderConverter;

  /** Default headers applied to all requests */
  defaultHeaders?: Record<string, string>;

  /** The time to the first item of a response, for example `seconds(30)` */
  timeout?: Duration;

  /**
   * The credentials mode of `fetch` (CLI-18). `"include"` sends the cookies of the server to
   * another origin too. An application with a cookie session needs it for procedures on another
   * origin. The server then must permit the origin with credentials (CORS). This option goes over
   * `requestInit.credentials`.
   * @default the default of `fetch`: "same-origin"
   */
  credentials?: "include" | "same-origin" | "omit";

  /**
   * More options of each `fetch` call: `mode`, `cache`, `redirect`, `referrerPolicy`, `keepalive`,
   * `priority` and the others. The transport sets `method`, `headers`, `body` and `signal` itself.
   */
  requestInit?: Omit<RequestInit, "method" | "headers" | "body" | "signal">;

  /**
   * The `fetch` function of the transport, for example a `fetch` with a cookie jar in Node, or a
   * test double.
   * @default globalThis.fetch
   */
  fetch?: typeof fetch;
}
