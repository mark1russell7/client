/**
 * HTTP Server Transport Types
 *
 * Type definitions for HTTP server adapter.
 */

import type { Express } from "express";
import type { Server as HttpServer } from "http";
import type { Method } from "../../../client/types.js";
import type { BrowserGuardOptions } from "../../../server/browser-guard.js";
import type { Clock } from "../../../clock.js";
import type { Duration } from "../../../duration.js";
import type { Logger } from "../../../logger.js";
import type { Addressing } from "./addressing.js";
import type { HandlerBatchOptions } from "./batch.js";
import type { UrlStrategyRequest } from "./strategies.js";

/**
 * The URL strategy of `HttpServerTransport`: it gives the method of a request, or null when the URL
 * names no method. The transport gives it the `Request` of Express. The parameter type is
 * structural (CLI-61), so a strategy also serves the `UrlRequest` of `procedureHandler`.
 */
export type HttpUrlStrategy = (req: UrlStrategyRequest) => Method | null;

/**
 * HTTP server transport options.
 */
export interface HttpServerTransportOptions extends BrowserGuardOptions {
  /**
   * Express app instance.
   * If not provided, a new app will be created.
   */
  app?: Express;

  /**
   * Existing HTTP server to use (optional).
   * If provided, the transport will not create a new server or call listen().
   * Useful for sharing the same HTTP server with WebSocket.
   */
  httpServer?: HttpServer;

  /**
   * Port to listen on.
   * @default 3000
   */
  port?: number;

  /**
   * Host to bind to.
   * @default "127.0.0.1"
   */
  host?: string;

  /**
   * URL strategy for converting HTTP requests to RPC methods.
   * @default createPatternServerUrlStrategy(basePath): the format of the HTTP client
   */
  urlStrategy?: HttpUrlStrategy;

  /**
   * The addressing of a request (CLI-31): a hook of the request and its body that gives the
   * method and the payload of the call. It replaces `urlStrategy`. With `bodyPathAddressing()`,
   * the route takes the base path itself too.
   */
  addressing?: Addressing;

  /**
   * The batches of calls (CLI-32): `POST {base}` with the header `Procedures-Batch: 1` runs many
   * calls and answers with one NDJSON stream. `false` turns batches off.
   * @default true: `{ maxCalls: 64, concurrency: 8 }`
   */
  batch?: boolean | HandlerBatchOptions;

  /**
   * Base path for RPC endpoints.
   * @default "/api"
   */
  basePath?: string;

  /**
   * Enable CORS.
   * @default false
   */
  cors?: boolean;

  /**
   * The largest request body, in bytes, when the transport reads the body itself (the app has
   * no body parser).
   * @default 1 MiB
   */
  bodyLimit?: number;

  /**
   * The quiet time of an NDJSON stream. After it, the server writes a keep-alive line: a blank
   * line. Each line of the stream starts the time again. Thus a proxy or a client with an idle
   * timeout does not close a quiet stream. `false`, or a duration of zero or less, sends no
   * keep-alive line.
   * @default seconds(15) (`TIMER_DEFAULTS.httpServer.keepAliveMs`)
   */
  keepAlive?: Duration | false;

  /**
   * The clock of the keep-alive timers (roadmap R35). The default is the clock of the platform. A
   * test gives a fake clock.
   */
  clock?: Clock;

  /**
   * More headers that carry a secret, for example the token header of an application. They go
   * into the credentials of the request, not into its metadata. `Authorization`,
   * `Proxy-Authorization`, `Cookie` and `X-Api-Key` are always secret.
   */
  secretHeaders?: readonly string[];

  /**
   * The query parameters that carry a secret. They go into the credentials of the request, not
   * into its metadata. The default keeps each query parameter in the metadata, as before.
   * `procedureHandler` has the default `["token"]`.
   * @default []
   */
  secretQuery?: readonly string[];

  /**
   * Custom CORS options. `origin` is "*", one origin or a list: the response names the
   * request's origin when it is in the list. A response for another origin, or for a request
   * without an origin, gets no `Access-Control-*` header (CLI-59). Each response gets
   * `Vary: Origin` when `origin` is not "*".
   */
  corsOptions?: {
    origin?: string | string[];
    methods?: string[];
    allowedHeaders?: string[];
    credentials?: boolean;
  };

  /**
   * The logger of the transport (CLI-87): the lines of its start and its stop go to it. The default
   * is the logger of the server. Without both, each line goes to `console.log` as before.
   */
  logger?: Logger | undefined;
}
