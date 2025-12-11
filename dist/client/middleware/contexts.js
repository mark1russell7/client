/**
 * Middleware Context Types
 *
 * Each middleware declares what context it provides and requires through
 * these type definitions. This enables compile-time validation of middleware
 * chains and type-safe context accumulation.
 *
 * @example
 * ```typescript
 * // Middleware composition with type accumulation
 * const client = new Client(transport)
 *   .use(createRetryMiddleware())     // Client<BaseContext & RetryContext>
 *   .use(createCacheMiddleware())     // Client<... & CacheContext>
 *   .use(createAuthMiddleware(...))   // Client<... & AuthContext>
 * ```
 */
// =============================================================================
// Context Type Guards
// =============================================================================
/**
 * Check if context has retry information.
 */
export function hasRetryContext(ctx) {
    return (typeof ctx === "object" &&
        ctx !== null &&
        "retry" in ctx &&
        typeof ctx.retry === "object");
}
/**
 * Check if context has cache information.
 */
export function hasCacheContext(ctx) {
    return (typeof ctx === "object" &&
        ctx !== null &&
        "cache" in ctx &&
        typeof ctx.cache === "object");
}
/**
 * Check if context has auth information.
 */
export function hasAuthContext(ctx) {
    return (typeof ctx === "object" &&
        ctx !== null &&
        "auth" in ctx &&
        typeof ctx.auth === "object");
}
/**
 * Check if context has tracing information.
 */
export function hasTracingContext(ctx) {
    return (typeof ctx === "object" &&
        ctx !== null &&
        "tracing" in ctx &&
        typeof ctx.tracing === "object");
}
/**
 * Check if context has circuit breaker information.
 */
export function hasCircuitBreakerContext(ctx) {
    return (typeof ctx === "object" &&
        ctx !== null &&
        "circuitBreaker" in ctx &&
        typeof ctx.circuitBreaker === "object");
}
/**
 * Check if context has rate limit information.
 */
export function hasRateLimitContext(ctx) {
    return (typeof ctx === "object" &&
        ctx !== null &&
        "rateLimit" in ctx &&
        typeof ctx.rateLimit === "object");
}
//# sourceMappingURL=contexts.js.map