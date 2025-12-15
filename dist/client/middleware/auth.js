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
export function createAuthMiddleware(authOptionsOrFn) {
    return (next) => async function* (context) {
        // Get auth options (static or dynamic)
        const authOptions = typeof authOptionsOrFn === "function"
            ? authOptionsOrFn()
            : authOptionsOrFn;
        // Merge: middleware defaults first, then user-provided context takes precedence
        // User context is already in metadata.auth from Client.stream()
        context.message.metadata.auth = {
            ...authOptions, // Middleware defaults
            ...context.message.metadata.auth, // User context overrides
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
export function createBearerAuthMiddleware(tokenOrFn) {
    return createAuthMiddleware(typeof tokenOrFn === "function"
        ? () => ({ token: tokenOrFn() })
        : { token: tokenOrFn });
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
export function createApiKeyAuthMiddleware(apiKeyOrFn) {
    return createAuthMiddleware(typeof apiKeyOrFn === "function"
        ? () => ({ apiKey: apiKeyOrFn() })
        : { apiKey: apiKeyOrFn });
}
//# sourceMappingURL=auth.js.map