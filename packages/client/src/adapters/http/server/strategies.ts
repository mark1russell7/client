/**
 * HTTP Server URL Strategies
 *
 * Functions for mapping HTTP requests to RPC methods.
 */

import type { Method } from "../../../client/types.js";
import { defaultUrlPattern } from "../shared/strategies.js";

/**
 * The parts of a request that the URL strategies read: the HTTP method and the path. A `Request`
 * of Express has them, and so does the `UrlRequest` of `procedureHandler`.
 */
export interface RoutedRequest {
  /** The HTTP method. */
  readonly method: string;
  /** The path of the URL, without the query. */
  readonly path: string;
}

/**
 * The request that a URL strategy of `HttpServerTransport` gets (CLI-61). The type is structural:
 * a `Request` of Express agrees with it, and so does the `UrlRequest` of `procedureHandler`. Thus
 * the type names no `express` and no Node module.
 */
export interface UrlStrategyRequest extends RoutedRequest {
  /** The URL of the request line: the path and the query. */
  readonly url: string;
  /** The headers of the request, by lower-case name. */
  readonly headers: { readonly [name: string]: string | string[] | undefined };
  /** The query parameters. Express gives its parsed query. */
  readonly query?: unknown;
  /** The body that a body parser of the app gives. Without a body parser, the body is absent. */
  readonly body?: unknown;
}

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
export function defaultServerUrlStrategy(req: RoutedRequest): Method | null {
  const path = req.path;
  const method = req.method.toUpperCase();

  // Match pattern: /api/:service/:id?
  const match = path.match(/^\/api\/([^/]+)(?:\/([^/]+))?/);
  if (!match) {
    return null;
  }

  const service = match[1];
  const id = match[2];

  if (!service) {
    return null;
  }

  // Map HTTP method + path to RPC operation
  if (method === "GET" && !id) {
    return { service, operation: "list" };
  }
  if (method === "GET" && id) {
    return { service, operation: "get" };
  }
  if (method === "POST") {
    return { service, operation: "create" };
  }
  if (method === "PUT" || method === "PATCH") {
    return { service, operation: "update" };
  }
  if (method === "DELETE") {
    return { service, operation: "delete" };
  }

  return null;
}

/**
 * Alternative strategy: RPC-style routes.
 *
 * Maps:
 * - POST /rpc/users/get → { service: "users", operation: "get" }
 * - POST /rpc/users/list → { service: "users", operation: "list" }
 * - POST /rpc/morning → { service: "", operation: "morning" } (a path of one segment, CLI-28)
 */
export function rpcServerUrlStrategy(req: RoutedRequest): Method | null {
  const path = req.path;

  // A path of one segment: /rpc/:operation, with the empty service (CLI-28)
  const single = path.match(/^\/rpc\/([^/]+)\/?$/);
  if (single?.[1]) {
    return { service: "", operation: single[1] };
  }

  // Match pattern: /rpc/:service/:operation
  const match = path.match(/^\/rpc\/([^/]+)\/([^/]+)/);
  if (!match) {
    return null;
  }

  const service = match[1];
  const operation = match[2];

  if (!service || !operation) {
    return null;
  }

  return { service, operation };
}

/**
 * Pattern URL strategy: parses the HTTP client's default URL format,
 * `{basePath}/{version?}/{service}/{operation}`, using defaultUrlPattern.parse — the exact inverse
 * of the client's defaultUrlPattern.format. This makes the raw client and server defaults round-trip
 * (they were previously mutually incompatible: the client emitted /svc/op while the server parsed
 * /api/:service/:id? and inferred the operation from the HTTP verb). See BUGS-2026-07.md (C3, bug 16).
 *
 * @param basePath - Base path prefix to strip before parsing (default "/api").
 */
export function createPatternServerUrlStrategy(basePath = "/api"): (req: RoutedRequest) => Method | null {
  return (req: RoutedRequest): Method | null => {
    let path = req.path;
    if (basePath && path.startsWith(basePath)) {
      path = path.slice(basePath.length);
    }
    // defaultUrlPattern.parse ignores the HTTP method for this URL pattern.
    return defaultUrlPattern.parse(path, req.method.toUpperCase() as never);
  };
}

/** Pattern strategy with the standard "/api" base path (the server transport default). */
export const patternServerUrlStrategy: (req: RoutedRequest) => Method | null = createPatternServerUrlStrategy();
