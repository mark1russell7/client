/**
 * HTTP Server Transport Implementation
 *
 * Adapts Express HTTP server to unified RPC format.
 * Converts HTTP requests to ServerRequest and ServerResponse back to HTTP.
 */

import type { Request, Response, Express } from "express";
import { createServer } from "http";
import type { Server as HttpServer } from "http";
import type { ServerTransport, ServerRequest, ServerResponse } from "../../../server/types.js";
import type { Metadata } from "../../../client/types.js";
import type { Server } from "../../../server/index.js";
import { HTTPMethod, HTTPHeaders, decodeMetadataHeader, METADATA_HEADER_LIMIT } from "../shared/index.js";
import { ERROR_REGISTRY } from "../../../client/errors/index.js";
import type { HttpServerTransportOptions } from "./types.js";
import { createPatternServerUrlStrategy } from "./strategies.js";
import { checkBrowserRequest, type BrowserGuardOptions } from "../../../server/browser-guard.js";

/** The media type of a stream response: one JSON value on each line. */
const NDJSON = "application/x-ndjson";

/** The metadata keys that the transport sets: a query parameter or a header cannot replace them. */
const RESERVED_METADATA = new Set(["headers", "query", "params"]);

/** The error of a request body that the transport cannot read. */
class BodyError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number
  ) {
    super(message);
  }
}

/** The code and message of a thrown error, with its retryable flag (deep dive TRN-7). */
function errorOf(error: unknown): { code: string; message: string; retryable: boolean } {
  const code = (error as { code?: unknown } | undefined)?.code;
  const retryable = (error as { retryable?: unknown } | undefined)?.retryable;
  return {
    code: typeof code === "string" ? code : "HANDLER_ERROR",
    message: error instanceof Error ? error.message : String(error),
    retryable: typeof retryable === "boolean" ? retryable : false,
  };
}

/**
 * Write one chunk. When the response's buffer is full, wait for "drain", or for the end of the
 * request (deep dive TRN-3: before, the server ignored the result of write() and ran a stream
 * to its end whatever the reader did).
 */
function write(res: Response, chunk: string, signal: AbortSignal): Promise<void> {
  if (res.write(chunk) || signal.aborted) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const done = (): void => {
      res.off("drain", done);
      res.off("close", done);
      signal.removeEventListener("abort", done);
      resolve();
    };
    res.on("drain", done);
    res.on("close", done);
    signal.addEventListener("abort", done, { once: true });
  });
}

/**
 * The HTTP status of the error codes of a procedure invocation (they are not in the error
 * registry, so before, a validation error was a 500).
 */
const INVOCATION_HTTP_STATUS: Record<string, number> = {
  VALIDATION_ERROR: 400,
  NOT_EXPOSED: 403,
  NOT_FOUND: 404,
  NO_HANDLER: 404,
  ABORTED: 499,
  OUTPUT_VALIDATION_ERROR: 500,
  NO_OUTPUT: 500,
  HANDLER_ERROR: 500,
};

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
/**
 * The origins that the CORS options allow: a page that CORS lets read the response can also
 * call. With CORS off, no other origin can call.
 */
function corsOrigins(options: HttpServerTransportOptions): BrowserGuardOptions["allowedOrigins"] {
  if (!options.cors) return [];
  const origin = options.corsOptions?.origin ?? "*";
  if (origin === "*") return "*";
  return Array.isArray(origin) ? origin : [origin];
}

export class HttpServerTransport implements ServerTransport {
  readonly name = "http";

  private app: Express;
  private httpServer: HttpServer | null = null;
  private options: Required<
    Omit<
      HttpServerTransportOptions,
      "app" | "corsOptions" | "httpServer" | "bodyLimit" | "allowedOrigins" | "allowedHosts" | "allowGet"
    >
  > & {
    corsOptions: HttpServerTransportOptions["corsOptions"] | undefined;
    httpServer: HttpServer | undefined;
  };
  private server: Server;
  /** The controllers of the requests in progress: stop() aborts them (deep dive TRN-15) */
  private openRequests = new Set<AbortController>();
  private stopped = false;
  private readonly bodyLimit: number;
  /** The browser checks of each procedure call (see `server/browser-guard.ts`) */
  private readonly guard: BrowserGuardOptions;

  constructor(server: Server, options: HttpServerTransportOptions = {}) {
    this.server = server;
    const basePath = options.basePath ?? "/api";
    this.options = {
      port: options.port ?? 3000,
      // Loopback by default (see BUGS-2026-07 H19), and route by URL path so the raw server matches
      // the HTTP client's default URL format instead of inferring the operation from the verb
      // (which lost the payload for get/list/find/watch). See BUGS-2026-07 (C3, bug 16).
      host: options.host ?? "127.0.0.1",
      urlStrategy: options.urlStrategy ?? createPatternServerUrlStrategy(basePath),
      basePath,
      cors: options.cors ?? false,
      corsOptions: options.corsOptions,
      httpServer: options.httpServer,
    };
    this.bodyLimit = options.bodyLimit ?? 1024 * 1024;
    this.guard = {
      allowedOrigins: options.allowedOrigins ?? corsOrigins(options),
      allowedHosts: options.allowedHosts,
      allowGet: options.allowGet,
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
      // The given options go over the defaults. Before, options with only `origin` replaced
      // them all, and the server sent "Access-Control-Allow-Headers: undefined".
      const corsOptions = {
        origin: "*" as string | string[],
        methods: [
          HTTPMethod.GET,
          HTTPMethod.POST,
          HTTPMethod.PUT,
          HTTPMethod.DELETE,
          HTTPMethod.PATCH,
          HTTPMethod.OPTIONS,
        ],
        // The headers that HttpTransport sends from the metadata. Without X-Metadata, a page of
        // another origin failed its preflight for every call with custom metadata (pagination).
        allowedHeaders: [
          "Content-Type",
          "Accept",
          HTTPHeaders.AUTHORIZATION,
          HTTPHeaders.API_KEY,
          HTTPHeaders.REQUEST_ID,
          HTTPHeaders.TRACE_ID,
          HTTPHeaders.SPAN_ID,
          HTTPHeaders.PARENT_SPAN_ID,
          HTTPHeaders.TIMEOUT,
          HTTPHeaders.METADATA,
          "collection",
          "collectionName",
          "database",
        ],
        credentials: true,
        ...this.options.corsOptions,
      };

      // One allowed origin goes back: the request's origin when it is in the list (a header
      // with several origins is invalid), with Vary: Origin so that caches keep them apart
      const origins = corsOptions.origin ?? "*";
      const allowOrigin = (requestOrigin: string | undefined): string | undefined => {
        if (origins === "*") return "*";
        const list = Array.isArray(origins) ? origins : [origins];
        return requestOrigin !== undefined && list.includes(requestOrigin) ? requestOrigin : undefined;
      };

      this.app.use((req, res, next) => {
        const allowed = allowOrigin(req.headers.origin);
        if (origins !== "*") res.vary("Origin");
        if (allowed !== undefined) res.header("Access-Control-Allow-Origin", allowed);
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
    if (this.stopped) {
      res.status(503).json({ error: "Server stopped", code: "SERVER_STOPPED", retryable: true });
      return;
    }
    // A web page must not reach the procedures: host, origin, method and body type
    const guard = checkBrowserRequest(req, this.guard, true);
    if (!guard.ok) {
      res.status(guard.status).json({ error: guard.message, code: guard.code, retryable: false });
      return;
    }
    // A closed connection or stop() aborts the request: a stream stops, and its handler gets return()
    const controller = new AbortController();
    this.openRequests.add(controller);
    res.on("close", () => {
      this.openRequests.delete(controller);
      if (!res.writableFinished) controller.abort();
    });
    try {
      // Convert HTTP request to ServerRequest
      let serverRequest: ServerRequest | null;
      try {
        serverRequest = this.httpToServerRequest(req, await this.readBody(req));
      } catch (error) {
        const status = error instanceof BodyError ? error.httpStatus : 400;
        res.status(status).json({ error: (error as Error).message, code: "INVALID_REQUEST", retryable: false });
        return;
      }

      if (!serverRequest) {
        res.status(400).json({
          error: "Invalid request: could not parse RPC method from URL",
        });
        return;
      }

      serverRequest.signal = controller.signal;

      // Process request through universal server
      const serverResponse = await this.server.handle(serverRequest);

      if (serverResponse.stream) {
        await this.streamToHttp(serverResponse, serverResponse.stream, req, res, controller.signal);
        return;
      }

      // Convert ServerResponse to HTTP response
      this.serverResponseToHttp(serverResponse, res);
    } catch (error) {
      if (!res.headersSent) {
        res.status(500).json({
          error: (error as Error).message || "Internal server error",
        });
      }
    } finally {
      this.openRequests.delete(controller);
    }
  }

  /**
   * The request body. A body parser of the app (`express.json({ strict: false })`) gives
   * `req.body`. Without one, the transport reads the JSON body itself: before, every payload
   * was {} when the app had no parser, and a parser with `strict: true` rejected a number or
   * a string (deep dive TRN-10).
   */
  private async readBody(req: Request): Promise<unknown> {
    if (req.body !== undefined) return req.body;
    if (req.method === "GET" || req.method === "HEAD" || req.readableEnded) return undefined;
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req as AsyncIterable<Buffer | string>) {
      const buffer = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
      size += buffer.length;
      if (size > this.bodyLimit) throw new BodyError(`The request body is larger than ${this.bodyLimit} bytes`, 413);
      chunks.push(buffer);
    }
    const text = Buffer.concat(chunks).toString("utf8");
    if (text.trim() === "") return undefined;
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new BodyError("The request body is not valid JSON", 400);
    }
  }

  /**
   * Convert HTTP request to ServerRequest.
   */
  /**
   * Send a stream response.
   *
   * A client that accepts `application/x-ndjson` gets one JSON line for each item
   * (`{"type":"item","payload":...}`), then `{"type":"done"}`, or `{"type":"error","error":...}`.
   * Another client (curl, a browser fetch without the header) gets the last item as plain JSON,
   * the "sponge" mode, so a streaming procedure does not change its response format.
   */
  private async streamToHttp(
    response: ServerResponse,
    stream: AsyncIterable<unknown>,
    req: Request,
    res: Response,
    signal: AbortSignal
  ): Promise<void> {
    const ndjson = String(req.headers.accept ?? "").includes(NDJSON);

    if (!ndjson) {
      let last: { value: unknown } | undefined;
      try {
        for await (const item of stream) last = { value: item };
      } catch (error) {
        this.serverResponseToHttp({ id: response.id, status: { type: "error", ...errorOf(error) }, metadata: {} }, res);
        return;
      }
      if (!last) {
        this.serverResponseToHttp(
          {
            id: response.id,
            status: { type: "error", code: "NO_OUTPUT", message: "The procedure gave no output", retryable: false },
            metadata: {},
          },
          res
        );
        return;
      }
      this.serverResponseToHttp({ id: response.id, status: response.status, metadata: response.metadata, payload: last.value }, res);
      return;
    }

    res.status(200);
    res.setHeader("Content-Type", NDJSON);
    res.setHeader("Cache-Control", "no-cache");
    res.flushHeaders();
    // stop() aborted the request while the reader still listens: end the stream with an error
    const endAborted = (): void => {
      if (!res.writableEnded && !res.destroyed) {
        res.end(JSON.stringify({ type: "error", error: { code: "ABORTED", message: "The server stopped the request", retryable: true } }) + "\n");
      }
    };
    try {
      for await (const item of stream) {
        if (signal.aborted) break;
        await write(res, JSON.stringify({ type: "item", payload: item }) + "\n", signal);
        if (signal.aborted) break;
      }
      if (signal.aborted) {
        endAborted();
        return;
      }
      res.end(JSON.stringify({ type: "done" }) + "\n");
    } catch (error) {
      if (signal.aborted) {
        endAborted();
        return;
      }
      res.end(JSON.stringify({ type: "error", error: errorOf(error) }) + "\n");
    }
  }

  private httpToServerRequest(req: Request, body: unknown): ServerRequest | null {
    // Parse method from URL using strategy
    const method = this.options.urlStrategy(req);
    if (!method) {
      return null;
    }

    // Generate request ID
    const id =
      (req.headers["x-request-id"] as string) ??
      `req-${Date.now()}-${Math.random()}`;

    // Build metadata from headers and query params. The flattened query parameters cannot
    // replace headers, query or params (before, "?headers=x" replaced metadata.headers).
    const metadata: Metadata = {
      headers: req.headers as Record<string, string>,
      query: req.query,
      params: req.params,
    };
    for (const [key, value] of Object.entries(req.query)) {
      if (!RESERVED_METADATA.has(key) && !key.startsWith("__")) metadata[key] = value;
    }

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
      "x-metadata",
    ]);

    // Known custom header mappings (lowercase → camelCase)
    const headerMappings: Record<string, string> = {
      'collectionname': 'collectionName',
    };

    for (const [key, value] of Object.entries(req.headers)) {
      if (!standardHeaders.has(key.toLowerCase()) && typeof value === "string") {
        // Use mapped name if available, otherwise use original key
        const normalizedKey = headerMappings[key.toLowerCase()] || key;
        if (!RESERVED_METADATA.has(normalizedKey) && !normalizedKey.startsWith("__")) {
          metadata[normalizedKey] = value;
        }
      }
    }

    // The custom metadata of the HTTP client: any JSON value, any key (deep dive TRN-11)
    const encoded = req.headers["x-metadata"];
    if (typeof encoded === "string") {
      if (encoded.length > METADATA_HEADER_LIMIT) {
        throw new BodyError(`The X-Metadata header is longer than ${METADATA_HEADER_LIMIT} characters`, 431);
      }
      const custom = decodeMetadataHeader(encoded);
      if (!custom) throw new BodyError("The X-Metadata header is not URI-encoded JSON of an object", 400);
      for (const [key, value] of Object.entries(custom)) {
        if (!RESERVED_METADATA.has(key) && key !== "auth" && !key.startsWith("__")) metadata[key] = value;
      }
    }

    // Payload from body (for POST/PUT) or params (for GET)
    let payload: unknown = body;
    if (req.method === "GET" && req.params["id"]) {
      payload = { id: req.params["id"] };
    }

    // Default to empty object only if there is no payload (common for GET requests): 0, false,
    // "" and null stay (deep dive TRN-10)
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
      // status.code is a symbolic error code (e.g. "VALIDATION_ERROR", "NOT_FOUND"). Map it to an
      // HTTP status via the error registry rather than parseInt (which yields NaN -> 500, so every
      // error became a 500). See documentation/BUGS-2026-07.md (M7).
      const mapped =
        INVOCATION_HTTP_STATUS[status.code] ??
        (ERROR_REGISTRY as Record<string, { httpStatus?: number }>)[status.code]?.httpStatus;
      httpStatusCode = mapped ?? (status.type === "success" ? 200 : 500);
    } else if (typeof status.code === "number") {
      httpStatusCode = status.code;
    } else {
      // Default to 200 for success, 500 for error if code is null/undefined
      httpStatusCode = status.type === "success" ? 200 : 500;
    }
    res.status(httpStatusCode);

    // Set headers from metadata
    if (metadata["headers"]) {
      for (const [key, value] of Object.entries(metadata["headers"])) {
        res.setHeader(key, value as string);
      }
    }

    // Send response. A procedure that gave no result answers 204 with no body: before, the
    // body was empty with a JSON content type, and the client got "" (deep dive TRN-10).
    if (status.type === "success") {
      if (payload === undefined) {
        res.status(204).end();
        return;
      }
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
    this.stopped = false;
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

  /**
   * Stop the transport. The requests in progress are aborted: an open stream ends, and its
   * handler gets return(). A server that the caller gave in `httpServer` stays open: the
   * caller owns it. Before, stop() waited for open streams forever and closed the caller's
   * server (deep dive TRN-15).
   */
  async stop(): Promise<void> {
    this.stopped = true;
    for (const controller of this.openRequests) controller.abort();
    this.openRequests.clear();

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
}
