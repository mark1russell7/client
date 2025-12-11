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
 * @example
 * ```typescript
 * const client = new Client({
 *   transport: new HttpTransport({ baseUrl: "https://api.example.com" }),
 *   middleware: [
 *     createAuthMiddleware({ token: "abc123" }),
 *     createRetryMiddleware({ maxAttempts: 3 }),
 *   ]
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
export function createAuthMiddleware(
  authOptionsOrFn: AuthOptions | (() => AuthOptions)
): TypedClientMiddleware<AuthContext, {}> {
  return (next) => async function* (context) {
    // Get auth options (static or dynamic)
    const authOptions = typeof authOptionsOrFn === "function"
      ? authOptionsOrFn()
      : authOptionsOrFn;

    // Add auth metadata to message
    context.message.metadata.auth = {
      ...context.message.metadata.auth,
      ...authOptions,
    };

    // Continue middleware chain
    yield* next(context);
  };
}

/**
 * Create Bearer token auth middleware (convenience)
 *
 * @example
 * ```typescript
 * createBearerAuthMiddleware("abc123")
 * // Equivalent to: createAuthMiddleware({ token: "abc123" })
 * ```
 */
export function createBearerAuthMiddleware(
  tokenOrFn: string | (() => string)
): TypedClientMiddleware<AuthContext, {}> {
  return createAuthMiddleware(
    typeof tokenOrFn === "function"
      ? () => ({ token: tokenOrFn() })
      : { token: tokenOrFn }
  );
}

/**
 * Create API key auth middleware (convenience)
 *
 * @example
 * ```typescript
 * createApiKeyAuthMiddleware("xyz789")
 * // Equivalent to: createAuthMiddleware({ apiKey: "xyz789" })
 * ```
 */
export function createApiKeyAuthMiddleware(
  apiKeyOrFn: string | (() => string)
): TypedClientMiddleware<AuthContext, {}> {
  return createAuthMiddleware(
    typeof apiKeyOrFn === "function"
      ? () => ({ apiKey: apiKeyOrFn() })
      : { apiKey: apiKeyOrFn }
  );
}
