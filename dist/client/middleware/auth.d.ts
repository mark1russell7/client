/**
 * Authentication Middleware
 *
 * Adds authentication metadata to requests.
 * Works with ALL transports (HTTP, WebSocket, Local, Mock).
 *
 * Each transport converts metadata.auth to its protocol format:
 * - HTTP: Authorization header, X-API-Key header
 * - WebSocket: Frame metadata
 * - Local: Passed directly to handler
 */
import type { TypedClientMiddleware } from "../types";
import type { AuthContext } from "./contexts";
/**
 * Authentication Options
 */
export interface AuthOptions {
    /** Bearer token for Authorization header */
    token?: string;
    /** API key for X-API-Key header */
    apiKey?: string;
    /** User ID for context */
    userId?: string;
    /** Additional custom auth fields */
    [key: string]: unknown;
}
/**
 * Create authentication middleware
 *
 * Adds auth metadata to all requests. The transport layer
 * converts this to protocol-specific format.
 *
 * **Context Override**: User-provided context (via withContext or per-call)
 * takes precedence. Middleware options serve as defaults.
 *
 * @example
 * ```typescript
 * // Create middleware with default auth
 * client.use(createAuthMiddleware({ token: "default-token" }));
 *
 * // Override per-call via context
 * await client.call(method, payload, {
 *   context: { auth: { token: "override-token" } }
 * });
 * ```
 *
 * @example Bearer Token
 * ```typescript
 * createAuthMiddleware({ token: process.env.API_TOKEN })
 * // HTTP: Authorization: Bearer abc123
 * // WebSocket: frame.metadata.auth.token
 * ```
 *
 * @example API Key
 * ```typescript
 * createAuthMiddleware({ apiKey: process.env.API_KEY })
 * // HTTP: X-API-Key: xyz789
 * // WebSocket: frame.metadata.auth.apiKey
 * ```
 *
 * @example Dynamic Auth (from function)
 * ```typescript
 * createAuthMiddleware(() => ({
 *   token: getTokenFromStore(),
 *   userId: getCurrentUserId(),
 * }))
 * ```
 */
export declare function createAuthMiddleware(authOptionsOrFn: AuthOptions | (() => AuthOptions)): TypedClientMiddleware<AuthContext, {}>;
/**
 * Create Bearer token auth middleware (convenience)
 *
 * @example
 * ```typescript
 * createBearerAuthMiddleware("abc123")
 * // Equivalent to: createAuthMiddleware({ token: "abc123" })
 * ```
 */
export declare function createBearerAuthMiddleware(tokenOrFn: string | (() => string)): TypedClientMiddleware<AuthContext, {}>;
/**
 * Create API key auth middleware (convenience)
 *
 * @example
 * ```typescript
 * createApiKeyAuthMiddleware("xyz789")
 * // Equivalent to: createAuthMiddleware({ apiKey: "xyz789" })
 * ```
 */
export declare function createApiKeyAuthMiddleware(apiKeyOrFn: string | (() => string)): TypedClientMiddleware<AuthContext, {}>;
//# sourceMappingURL=auth.d.ts.map