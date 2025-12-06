/**
 * HTTP Server Transport Implementation
 *
 * Adapts Express HTTP server to unified RPC format.
 * Converts HTTP requests to ServerRequest and ServerResponse back to HTTP.
 */

import type { Request, Response, Express } from "express";
import { createServer } from "http";
import type { Server as HttpServer } from "http";
import type { ServerTransport, ServerRequest, ServerResponse } from "../../../server/types";
import type { Metadata } from "../../../client/types";
import type { Server } from "../../../server";
import { HTTPMethod } from "../shared";
import type { HttpServerTransportOptions } from "./types";
import { defaultServerUrlStrategy } from "./strategies";

/**
 * HTTP server transport adapter for Express.
 *
 * Converts HTTP requests to unified RPC format and responses back to HTTP.
 *
 * @example
 * ```typescript
 * const server = new Server();
 * const httpTransport = new HttpServerTransport(server, {
 *   app,
 *   port: 3000,
 *   urlStrategy: defaultServerUrlStrategy
 * });
 *
 * await httpTransport.start();
 * ```
 */
export class HttpServerTransport implements ServerTransport {
  readonly name = "http";

  private app: Express;
  private httpServer: HttpServer | null = null;
  private options: Required<
    Omit<HttpServerTransportOptions, "app" | "corsOptions" | "httpServer">
  > & {
    corsOptions: HttpServerTransportOptions["corsOptions"] | undefined;
    httpServer: HttpServer | undefined;
  };
  private server: Server;

  constructor(server: Server, options: HttpServerTransportOptions = {}) {
    this.server = server;
    this.options = {
      port: options.port ?? 3000,
      host: options.host ?? "0.0.0.0",
      urlStrategy: options.urlStrategy ?? defaultServerUrlStrategy,
      basePath: options.basePath ?? "/api",
      cors: options.cors ?? false,
      corsOptions: options.corsOptions,
      httpServer: options.httpServer,
    };

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
   * Setup Express routes.
   */
  private setupRoutes(): void {
    // CORS
    if (this.options.cors) {
      const corsOptions = this.options.corsOptions ?? {
        origin: "*",
        methods: [
          HTTPMethod.GET,
          HTTPMethod.POST,
          HTTPMethod.PUT,
          HTTPMethod.DELETE,
          HTTPMethod.PATCH,
          HTTPMethod.OPTIONS,
        ],
        allowedHeaders: ["Content-Type", "Authorization"],
        credentials: true,
      };

      this.app.use((req, res, next) => {
        res.header("Access-Control-Allow-Origin", corsOptions.origin as string);
        res.header(
          "Access-Control-Allow-Methods",
          corsOptions.methods?.join(", ")
        );
        res.header(
          "Access-Control-Allow-Headers",
          corsOptions.allowedHeaders?.join(", ")
        );
        if (corsOptions.credentials) {
          res.header("Access-Control-Allow-Credentials", "true");
        }

        if (req.method === "OPTIONS") {
          res.sendStatus(204);
          return;
        }

        next();
      });
    }

    // Catch-all route for RPC - use regex to match any path under basePath
    this.app.all(
      new RegExp(`^${this.options.basePath.replace(/\//g, "\\/")}\\/.*`),
      async (req, res) => {
        await this.handleHttpRequest(req, res);
      }
    );
  }

  /**
   * Handle HTTP request.
   * Converts to unified RPC format, processes, and sends response.
   */
  private async handleHttpRequest(req: Request, res: Response): Promise<void> {
    try {
      // Convert HTTP request to ServerRequest
      const serverRequest = this.httpToServerRequest(req);

      if (!serverRequest) {
        res.status(400).json({
          error: "Invalid request: could not parse RPC method from URL",
        });
        return;
      }

      // Process request through universal server
      const serverResponse = await this.server.handle(serverRequest);

      // Convert ServerResponse to HTTP response
      this.serverResponseToHttp(serverResponse, res);
    } catch (error) {
      res.status(500).json({
        error: (error as Error).message || "Internal server error",
      });
    }
  }

  /**
   * Convert HTTP request to ServerRequest.
   */
  private httpToServerRequest(req: Request): ServerRequest | null {
    // Parse method from URL using strategy
    const method = this.options.urlStrategy(req);
    if (!method) {
      return null;
    }

    // Generate request ID
    const id =
      (req.headers["x-request-id"] as string) ??
      `req-${Date.now()}-${Math.random()}`;

    // Build metadata from headers and query params
    const metadata: Metadata = {
      headers: req.headers as Record<string, string>,
      query: req.query,
      params: req.params,
      ...req.query, // Flatten query params into metadata
    };

    // Extract custom headers to root-level metadata
    // This mirrors the client's metadataToHeaders() behavior
    const standardHeaders = new Set([
      "host",
      "connection",
      "content-length",
      "content-type",
      "user-agent",
      "accept",
      "accept-encoding",
      "accept-language",
      "cache-control",
      "origin",
      "referer",
      "x-request-id",
      "x-trace-id",
      "x-span-id",
      "x-parent-span-id",
      "x-timeout",
      "x-api-key",
      "authorization",
    ]);

    // Known custom header mappings (lowercase → camelCase)
    const headerMappings: Record<string, string> = {
      'collectionname': 'collectionName',
    };

    for (const [key, value] of Object.entries(req.headers)) {
      if (!standardHeaders.has(key.toLowerCase()) && typeof value === "string") {
        // Use mapped name if available, otherwise use original key
        const normalizedKey = headerMappings[key.toLowerCase()] || key;
        metadata[normalizedKey] = value;
      }
    }

    // Payload from body (for POST/PUT) or params (for GET)
    let payload: unknown = req.body;
    if (req.method === "GET" && req.params.id) {
      payload = { id: req.params.id };
    }

    // Default to empty object if payload is undefined (common for GET requests)
    if (payload === undefined) {
      payload = {};
    }

    return {
      id,
      method,
      payload,
      metadata,
    };
  }

  /**
   * Convert ServerResponse to HTTP response.
   */
  private serverResponseToHttp(
    serverResponse: ServerResponse,
    res: Response
  ): void {
    const { status, payload, metadata } = serverResponse;

    // Set status code (convert string to number if needed)
    let httpStatusCode: number;
    if (typeof status.code === "string") {
      httpStatusCode = parseInt(status.code, 10);
      if (isNaN(httpStatusCode)) {
        httpStatusCode = status.type === "success" ? 200 : 500;
      }
    } else if (typeof status.code === "number") {
      httpStatusCode = status.code;
    } else {
      // Default to 200 for success, 500 for error if code is null/undefined
      httpStatusCode = status.type === "success" ? 200 : 500;
    }
    res.status(httpStatusCode);

    // Set headers from metadata
    if (metadata.headers) {
      for (const [key, value] of Object.entries(metadata.headers)) {
        res.setHeader(key, value as string);
      }
    }

    // Send response
    if (status.type === "success") {
      res.json(payload);
    } else {
      res.json({
        error: status.message,
        code: status.code,
        retryable: status.retryable,
      });
    }
  }

  async start(): Promise<void> {
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
            `[${this.name}] Server listening on http://${this.options.host}:${this.options.port}`
          );
          resolve();
        });

        server.on("error", reject);
      } catch (error) {
        reject(error);
      }
    });
  }

  async stop(): Promise<void> {
    if (this.httpServer) {
      return new Promise((resolve, reject) => {
        this.httpServer!.close((err) => {
          if (err) {
            reject(err);
          } else {
            console.log(`[${this.name}] Server stopped`);
            resolve();
          }
        });
      });
    }
  }

  isRunning(): boolean {
    return this.httpServer !== null && this.httpServer.listening;
  }
}
