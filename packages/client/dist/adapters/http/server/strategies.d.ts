/**
 * HTTP Server URL Strategies
 *
 * Functions for mapping HTTP requests to RPC methods.
 */
import type { Request } from "express";
import type { Method } from "../../../client/types";
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
//# sourceMappingURL=strategies.d.ts.map