/**
 * HTTP Server URL Strategies
 *
 * Functions for mapping HTTP requests to RPC methods.
 */
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
//# sourceMappingURL=strategies.js.map