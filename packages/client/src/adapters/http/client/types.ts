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
}
