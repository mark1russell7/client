/**
 * HTTP Strategy Interfaces
 *
 * Defines extensible, bidirectional strategies for URL mapping
 * and HTTP method selection. These strategies ensure client
 * and server use consistent, inverse operations.
 */
import type { Method } from "../../../client/types.js";
import { HTTPMethod } from "./constants.js";
/**
 * URL Strategy (Client-side)
 *
 * Converts Method → URL
 */
export type UrlStrategy = (method: Method, baseUrl: string) => string;
/**
 * URL Parser Strategy (Server-side)
 *
 * Converts URL → Method (inverse of UrlStrategy)
 */
export type UrlParserStrategy = (url: string, httpMethod: HTTPMethod) => Method | null;
/**
 * HTTP Method Strategy (Client-side)
 *
 * Converts Method → HTTP method verb
 */
export type HttpMethodStrategy = (method: Method) => HTTPMethod;
/**
 * HTTP Method Parser Strategy (Server-side)
 *
 * Converts HTTP method verb → operation hints (inverse of HttpMethodStrategy)
 */
export type HttpMethodParserStrategy = (httpMethod: HTTPMethod) => Partial<Method>;
/**
 * Bidirectional URL Pattern
 *
 * Encapsulates both URL generation (client) and parsing (server)
 * to ensure they remain algorithmic inverses.
 */
export interface UrlPattern {
    /** Template pattern (e.g., "/{version?}/{service}/{operation}") */
    readonly template: string;
    /** Generate URL from Method (client-side) */
    format(method: Method, baseUrl: string): string;
    /** Parse URL back to Method (server-side) */
    parse(url: string, httpMethod: HTTPMethod): Method | null;
}
/**
 * Default URL Pattern: /{version?}/{service}/{operation}
 *
 * Examples:
 * - { service: "users", operation: "get" } → "/users/get"
 * - { service: "users", operation: "get", version: "v2" } → "/v2/users/get"
 */
export declare const defaultUrlPattern: UrlPattern;
/**
 * RESTful URL Pattern: /{version?}/{service}/{id?}
 *
 * Infers operation from HTTP method and presence of ID:
 * - GET /users → list
 * - GET /users/123 → get
 * - POST /users → create
 * - PUT /users/123 → update
 * - PATCH /users/123 → patch
 * - DELETE /users/123 → delete
 */
export declare const restfulUrlPattern: UrlPattern;
/**
 * RESTful HTTP Method Strategy
 *
 * Maps operation names to HTTP methods:
 * - get/list/find/watch → GET
 * - create → POST
 * - update → PUT
 * - patch → PATCH
 * - delete/remove → DELETE
 * - default → POST
 */
export declare const restfulHttpMethodStrategy: HttpMethodStrategy;
/**
 * POST-only HTTP Method Strategy
 *
 * All operations use POST (simple RPC style).
 */
export declare const postOnlyStrategy: HttpMethodStrategy;
/**
 * Validate payload can be JSON stringified
 */
export declare function isValidJSONPayload(payload: unknown): boolean;
//# sourceMappingURL=strategies.d.ts.map