/**
 * Middleware Composition Utilities
 *
 * Provides type-safe composition of middleware chains with proper context tracking.
 * Uses recursive type inference (`MiddlewaresContext`) to validate middleware compatibility
 * for any chain length - no manual overloads needed!
 */
import type { Middleware, MiddlewareRunner, MiddlewaresContext, AsyncMiddleware, SyncMiddleware } from "./types";
/**
 * Wraps an async function with a series of middlewares and returns a new async function
 * representing their combined execution.
 *
 * The middlewares list is ordered from outer to inner, such that when the combined async function
 * is executed, the first middleware in the list is run first and then executes the "next" function
 * which represents the inner function wrapped by subsequent middlewares.
 *
 * Type safety: The `MiddlewaresContext` recursive type validates that each middleware's
 * requirements are satisfied by the accumulated context from previous middleware.
 * If incompatible, the return type becomes `never` (compile error).
 *
 * @example
 * ```typescript
 * const runner = wrapWithAsyncMiddlewares(
 *   [timeoutMiddleware, retryMiddleware, cacheMiddleware],
 *   async (ctx: BaseContext) => fetchData(ctx)
 * );
 * await runner({ request: req }); // Type-safe!
 * ```
 */
export declare function wrapWithAsyncMiddlewares<TMiddlewares extends readonly AsyncMiddleware<any, any, any>[], TBaseContext, TReturn>(middlewares: TMiddlewares, fn: MiddlewareRunner<MiddlewaresContext<TMiddlewares, TBaseContext>, TReturn, true>): MiddlewareRunner<TBaseContext, TReturn, true>;
/**
 * Wraps a synchronous function with a series of middlewares.
 * Same as async version but for synchronous execution.
 *
 * @example
 * ```typescript
 * const runner = wrapWithSyncMiddlewares(
 *   [boundedMiddleware, eventedMiddleware],
 *   (collection: Collection) => collection.size
 * );
 * const size = runner(baseCollection);
 * ```
 */
export declare function wrapWithSyncMiddlewares<TMiddlewares extends readonly SyncMiddleware<any, any, any>[], TBaseContext, TReturn>(middlewares: TMiddlewares, fn: MiddlewareRunner<MiddlewaresContext<TMiddlewares, TBaseContext>, TReturn, false>): MiddlewareRunner<TBaseContext, TReturn, false>;
/**
 * Composes multiple middleware with an initial runner.
 * Automatically detects sync vs async based on middleware type.
 *
 * This is a convenience wrapper around `wrapWithAsyncMiddlewares`/`wrapWithSyncMiddlewares`
 * that accepts middleware as individual arguments instead of an array.
 *
 * @example
 * ```typescript
 * // Async composition
 * const runner = compose(m1, m2, m3, async (ctx) => fetch(ctx.url));
 * await runner({ url: "..." });
 *
 * // Sync composition
 * const runner = compose(m1, m2, (ctx) => ctx.value * 2);
 * const result = runner({ value: 21 });
 * ```
 */
export declare function compose<TAsync extends boolean = false>(...args: [...Middleware<any, any, any, TAsync>[], any]): MiddlewareRunner<any, any, TAsync>;
/**
 * Bundles multiple middleware into a single composed middleware.
 * This is useful for creating reusable middleware stacks.
 *
 * Unlike `compose`, `bundle` returns a middleware (not a runner), so it can be
 * composed further or used with `.use()` on clients.
 *
 * @example
 * ```typescript
 * // Create a standard middleware bundle
 * const standardStack = bundle(
 *   timeoutMiddleware,
 *   retryMiddleware,
 *   cacheMiddleware
 * );
 *
 * // Use it like any other middleware
 * client.use(standardStack);
 *
 * // Or compose it further
 * const enhanced = bundle(loggingMiddleware, standardStack);
 * ```
 */
export declare function bundle<TAsync extends boolean = false>(...middleware: Middleware<any, any, any, TAsync>[]): Middleware<any, any, any, TAsync>;
//# sourceMappingURL=compose.d.ts.map