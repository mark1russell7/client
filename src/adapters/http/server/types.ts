/**
 * HTTP Server Transport Types
 *
 * Type definitions for HTTP server adapter.
 */

import type { Request, Express } from "express";
import type { Server as HttpServer } from "http";
import type { Method } from "../../../client/types.js";

/**
 * URL strategy for converting HTTP requests to RPC methods.
 */
export type HttpUrlStrategy = (req: Request) => Method | null;

/**
 * HTTP server transport options.
 */
export interface HttpServerTransportOptions {
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
   * @default "0.0.0.0"
   */
  host?: string;

  /**
   * URL strategy for converting HTTP requests to RPC methods.
   * @default defaultServerUrlStrategy
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
   * Custom CORS options.
   */
  corsOptions?: {
    origin?: string | string[];
    methods?: string[];
    allowedHeaders?: string[];
    credentials?: boolean;
  };
}
