/**
 * HTTP Server Transport Implementation
 *
 * Adapts Express HTTP server to unified RPC format.
 * Converts HTTP requests to ServerRequest and ServerResponse back to HTTP.
 */
import type { ServerTransport } from "../../../server/types.js";
import type { Server } from "../../../server/index.js";
import type { HttpServerTransportOptions } from "./types.js";
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
export declare class HttpServerTransport implements ServerTransport {
    readonly name = "http";
    private app;
    private httpServer;
    private options;
    private server;
    constructor(server: Server, options?: HttpServerTransportOptions);
    /**
     * Setup Express routes.
     */
    private setupRoutes;
    /**
     * Handle HTTP request.
     * Converts to unified RPC format, processes, and sends response.
     */
    private handleHttpRequest;
    /**
     * Convert HTTP request to ServerRequest.
     */
    private httpToServerRequest;
    /**
     * Convert ServerResponse to HTTP response.
     */
    private serverResponseToHttp;
    start(): Promise<void>;
    stop(): Promise<void>;
    isRunning(): boolean;
}
//# sourceMappingURL=transport.d.ts.map