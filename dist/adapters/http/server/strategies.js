/**
 * HTTP Server URL Strategies
 *
 * Functions for mapping HTTP requests to RPC methods.
 */
import { defaultUrlPattern } from "../shared/strategies.js";
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
export function defaultServerUrlStrategy(req) {
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
 */
export function rpcServerUrlStrategy(req) {
    const path = req.path;
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
export function createPatternServerUrlStrategy(basePath = "/api") {
    return (req) => {
        let path = req.path;
        if (basePath && path.startsWith(basePath)) {
            path = path.slice(basePath.length);
        }
        // defaultUrlPattern.parse ignores the HTTP method for this URL pattern.
        return defaultUrlPattern.parse(path, req.method.toUpperCase());
    };
}
/** Pattern strategy with the standard "/api" base path (the server transport default). */
export const patternServerUrlStrategy = createPatternServerUrlStrategy();
//# sourceMappingURL=strategies.js.map