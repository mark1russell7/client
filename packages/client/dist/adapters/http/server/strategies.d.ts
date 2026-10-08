/**
 * HTTP Server URL Strategies
 *
 * Functions for mapping HTTP requests to RPC methods.
 */
import type { Request } from "express";
import type { Method } from "../../../client/types.js";
/**
 * Default URL strategy: RESTful routes.
 *
 * Maps:
 * - GET /api/users → { service: "users", operation: "list" }
 * - GET /api/users/:id → { service: "users", operation: "get" }
 * - POST /api/users → { service: "users", operation: "create" }
 * - PUT /api/users/:id → { service: "users", operation: "update" }
 * - DELETE /api/users/:id → { service: "users", operation: "delete" }
 */
export declare function defaultServerUrlStrategy(req: Request): Method | null;
/**
 * Alternative strategy: RPC-style routes.
 *
 * Maps:
 * - POST /rpc/users/get → { service: "users", operation: "get" }
 * - POST /rpc/users/list → { service: "users", operation: "list" }
 */
export declare function rpcServerUrlStrategy(req: Request): Method | null;
/**
 * Pattern URL strategy: parses the HTTP client's default URL format,
 * `{basePath}/{version?}/{service}/{operation}`, using defaultUrlPattern.parse — the exact inverse
 * of the client's defaultUrlPattern.format. This makes the raw client and server defaults round-trip
 * (they were previously mutually incompatible: the client emitted /svc/op while the server parsed
 * /api/:service/:id? and inferred the operation from the HTTP verb). See BUGS-2026-07.md (C3, bug 16).
 *
 * @param basePath - Base path prefix to strip before parsing (default "/api").
 */
export declare function createPatternServerUrlStrategy(basePath?: string): (req: Request) => Method | null;
/** Pattern strategy with the standard "/api" base path (the server transport default). */
export declare const patternServerUrlStrategy: (req: Request) => Method | null;
//# sourceMappingURL=strategies.d.ts.map