/**
 * HTTP Server Transport Types
 *
 * Type definitions for HTTP server adapter.
 */

import type { Request, Express } from "express";
import type { Server as HttpServer } from "http";
import type { Method } from "../../../client/types.js";
import type { BrowserGuardOptions } from "../../../server/browser-guard.js";
import type { Clock } from "../../../clock.js";
import type { Duration } from "../../../duration.js";

/**
 * URL strategy for converting HTTP requests to RPC methods.
 */
export type HttpUrlStrategy = (req: Request) => Method | null;

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
   * Custom CORS options. `origin` is "*", one origin or a list: the response names the
   * request's origin when it is in the list.
   */
  corsOptions?: {
    origin?: string | string[];
    methods?: string[];
    allowedHeaders?: string[];
    credentials?: boolean;
  };
}
