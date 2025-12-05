/**
 * Unified Middleware System
 *
 * Provides type-safe middleware composition for both sync and async operations.
 * Used by both API middleware (async) and Collections middleware (sync).
 *
 * Uses recursive type inference (`MiddlewaresContext`) to validate middleware
 * compatibility at compile time - no manual overloads needed!
 */
export type { MiddlewareRunner, Middleware, AsyncMiddleware, SyncMiddleware, MiddlewaresContext, MiddlewareReturn, MiddlewareContextIn, MiddlewareContextOut, IsAsyncMiddleware, } from "./types";
export { compose, bundle, wrapWithAsyncMiddlewares, wrapWithSyncMiddlewares, } from "./compose";
//# sourceMappingURL=index.d.ts.map