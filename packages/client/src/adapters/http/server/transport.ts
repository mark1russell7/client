/**
 * The HTTP server transport of Express: a shim over `procedureHandler` (CLI-3).
 *
 * The transport mounts the procedure handler of `handler.ts` on an Express app, with the CORS of
 * the app, and it owns its own `node:http` server unless the caller gives one. The handler does
 * the work: the request, the body, the metadata, the credentials, the response and the NDJSON
 * streams. The error codes are the codes of wire v1, as for `procedureHandler` (CLI-4). A stopped
 * transport answers `UNAVAILABLE`, and a refused browser request gets `FORBIDDEN` with a reason.
 */

import type { Request, Response, Express } from "express";
import { createServer } from "http";
import type { Server as HttpServer } from "http";
import type { ServerTransport } from "../../../server/types.js";
import type { RequestHandler } from "../../../server/types.js";
import type { HttpServerTransportOptions } from "./types.js";
import { createPatternServerUrlStrategy } from "./strategies.js";
import { applyCors, corsOrigins, corsPolicy, type CorsPolicy } from "./cors.js";
import { createProcedureHandler, type NodeProcedureHandler } from "./handler.js";

/**
 * HTTP server transport adapter for Express.
 *
 * Converts HTTP requests to unified RPC format and responses back to HTTP.
 *
 * @example
 * ```typescript
 * const server = new Server();
 * const app = express();
 * app.use(express.json({ strict: false })); // optional: the transport can read the body itself
 * const httpTransport = new HttpServerTransport(server, {
 *   app,
 *   port: 3000,
 *   // The default URL strategy parses the HTTP client's format: /api/{service}/{operation}
 * });
 *
 * await httpTransport.start();
 * ```
 */
export class HttpServerTransport implements ServerTransport {
  readonly name = "http";

  private app: Express;
  private httpServer: HttpServer | null = null;
  private options: { port: number; host: string; basePath: string; cors: boolean; httpServer: HttpServer | undefined; takesBasePath: boolean };
  /** The procedure handler that does the work of each request (CLI-3) */
  private readonly handler: NodeProcedureHandler;
  /** The CORS of the app, or undefined when it is off */
  private readonly cors: CorsPolicy | undefined;
  private stopped = false;

  constructor(server: RequestHandler, options: HttpServerTransportOptions = {}) {
    const basePath = options.basePath ?? "/api";
    this.options = {
      port: options.port ?? 3000,
      // Loopback by default (see BUGS-2026-07 H19)
      host: options.host ?? "127.0.0.1",
      basePath,
      cors: options.cors ?? false,
      httpServer: options.httpServer,
      // A single endpoint with the path in the body is the base path itself (CLI-31)
      takesBasePath: options.addressing?.takesBasePath === true,
    };
    // Route by URL path so the raw server matches the HTTP client's default URL format instead of
    // inferring the operation from the verb (BUGS-2026-07 C3, bug 16)
    const urlStrategy = options.urlStrategy ?? createPatternServerUrlStrategy(basePath);
    const corsOptions = this.options.cors ? (options.corsOptions ?? {}) : undefined;
    // The given options go over the defaults, and the transport sends the credentials by default.
    // An origin that is not permitted gets no CORS header, as with procedureHandler (CLI-59)
    this.cors = corsOptions ? { ...corsPolicy(corsOptions, true), permittedOnly: true } : undefined;
    this.handler = createProcedureHandler(
      server,
      {
        basePath,
        bodyLimit: options.bodyLimit,
        keepAlive: options.keepAlive,
        clock: options.clock,
        allowedOrigins: options.allowedOrigins ?? corsOrigins(corsOptions),
        allowedHosts: options.allowedHosts,
        allowGet: options.allowGet,
        secretHeaders: options.secretHeaders,
        secretQuery: options.secretQuery,
        addressing: options.addressing,
      },
      {
        legacy: true,
        matchAll: true,
        face: { name: "HttpServerTransport", originOption: "corsOptions.origin" },
        corsOutside: true,
        methodOf: (req) => urlStrategy(req as Request),
        sendJson: (res, status, body) => {
          (res as Response).status(status).json(body);
        },
      }
    );

    // Use provided app or create new one
    if (options.app) {
      this.app = options.app;
    } else {
      throw new Error(
        "Express app is required. Please provide an app instance via options.app"
      );
    }

    // Setup routes
    this.setupRoutes();
  }

  /**
   * Setup Express routes: the CORS of the app, then the procedure handler under the base path.
   */
  private setupRoutes(): void {
    const cors = this.cors;
    if (cors) {
      // One allowed origin goes back: the request's origin when it is in the list, with
      // Vary: Origin so that caches keep them apart. A preflight ends here with 204.
      this.app.use((req, res, next) => {
        if (!applyCors(req, res, cors)) next();
      });
    }

    // Catch-all route for RPC - use regex to match any path under basePath, and the base path
    // itself for an addressing that takes it
    const base = this.options.basePath.replace(/\//g, "\\/");
    this.app.all(
      new RegExp(this.options.takesBasePath ? `^${base.replace(/\\\/$/, "")}(?:\\/.*)?$` : `^${base}\\/.*`),
      async (req, res) => {
        await this.handler.handle(req, res);
      }
    );
  }

  async start(): Promise<void> {
    this.stopped = false;
    this.handler.start();
    // If an HTTP server was provided, use it (don't create or listen)
    if (this.options.httpServer) {
      this.httpServer = this.options.httpServer;
      console.log(`[${this.name}] Using existing HTTP server`);
      return Promise.resolve();
    }

    // Otherwise, create and listen on a new HTTP server
    return new Promise((resolve, reject) => {
      try {
        const server = createServer(this.app);
        this.httpServer = server;

        server.listen(this.options.port, this.options.host, () => {
          console.log(
            `[${this.name}] Server listening on http://${this.options.host}:${this.port() ?? this.options.port}`
          );
          resolve();
        });

        server.on("error", reject);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Stop the transport. The requests in progress are aborted: an open stream ends, and its
   * handler gets return(). A server that the caller gave in `httpServer` stays open: the
   * caller owns it. Before, stop() waited for open streams forever and closed the caller's
   * server (deep dive TRN-15).
   */
  async stop(): Promise<void> {
    this.stopped = true;
    this.handler.stopIntake();
    this.handler.close();

    if (this.options.httpServer || !this.httpServer) {
      return;
    }
    const server = this.httpServer;
    await new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) {
          reject(err);
        } else {
          console.log(`[${this.name}] Server stopped`);
          resolve();
        }
      });
      // Idle keep-alive connections and finished streams do not keep close() waiting
      server.closeAllConnections();
    });
  }

  isRunning(): boolean {
    return !this.stopped && this.httpServer !== null && this.httpServer.listening;
  }

  /**
   * The port that the server of the transport listens on. With the option `port` 0, the system
   * gives a free port, and this function returns that port. Before `start()` and after `stop()`,
   * the function returns undefined.
   */
  port(): number | undefined {
    const address = this.httpServer?.listening ? this.httpServer.address() : null;
    return typeof address === "object" && address !== null ? address.port : undefined;
  }
}
