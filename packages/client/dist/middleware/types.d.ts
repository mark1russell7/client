/**
 * Unified Middleware Type System
 *
 * This module provides a sophisticated type-safe middleware system that supports
 * both synchronous and asynchronous middleware with full context tracking.
 *
 * Key features:
 * - Type-level context tracking through middleware chains
 * - Compile-time validation of middleware compatibility
 * - Support for both sync and async execution
 * - Recursive type inference for composed middleware
 */
/**
 * MiddlewareRunner is a function that can be wrapped in middleware.
 * It takes a context object and returns either a value or a promise.
 *
 * @template TContext - The context object type
 * @template TReturn - The return value type
 * @template TAsync - Whether the runner is async (true) or sync (false)
 */
export type MiddlewareRunner<TContext, TReturn, TAsync extends boolean = false> = TAsync extends true ? (context: TContext) => Promise<TReturn> : (context: TContext) => TReturn;
/**
 * Middleware represents a function that wraps another function, such that the inner
 * function can be instrumented or provided with additional context.
 *
 * The middleware can:
 * - Add new properties to the context (TContextOut)
 * - Require existing properties from the context (TContextIn)
 * - Transform the execution flow
 * - Be composed with other middleware
 *
 * Type parameters express middleware capabilities and requirements:
 * - TContextOut: What context fields this middleware provides/adds
 * - TContextIn: What context fields this middleware requires
 * - TReturn: The return type
 * - TAsync: Whether execution is async (true) or sync (false)
 *
 * Example:
 * ```typescript
 * // Async middleware that adds retryCount to context
 * type RetryMiddleware = Middleware<
 *   { retryCount: number },  // Provides
 *   {},                       // Requires nothing
 *   Response,                 // Returns Response
 *   true                      // Async
 * >;
 *
 * // Middleware that requires retryCount
 * type LogMiddleware = Middleware<
 *   {},                       // Provides nothing
 *   { retryCount: number },   // Requires retryCount
 *   Response,                 // Returns Response
 *   true                      // Async
 * >;
 * ```
 */
export interface Middleware<TContextOut, TContextIn, TReturn, TAsync extends boolean = false> {
    (next: MiddlewareRunner<TContextIn & TContextOut, TReturn, TAsync>): MiddlewareRunner<TContextIn, TReturn, TAsync>;
}
/**
 * AsyncMiddleware is a specialized version for async execution.
 * This is the most common form for API/network operations.
 */
export type AsyncMiddleware<TContextOut, TContextIn, TReturn> = Middleware<TContextOut, TContextIn, TReturn, true>;
/**
 * SyncMiddleware is a specialized version for synchronous execution.
 * This is common for in-memory data structure operations.
 */
export type SyncMiddleware<TContextOut, TContextIn, TReturn> = Middleware<TContextOut, TContextIn, TReturn, false>;
/**
 * Extracts the combined context after applying a series of middlewares.
 *
 * This recursive type validates that each middleware's requirements are satisfied
 * by the accumulated context. If any middleware expects a context field that is
 * not provided by previous middleware or the initial context, the result is `never`.
 *
 * Example:
 * ```typescript
 * type Mw1 = Middleware<{ a: number }, {}, Response, true>;
 * type Mw2 = Middleware<{ b: string }, { a: number }, Response, true>;
 * type Mw3 = Middleware<{}, { a: number; b: string }, Response, true>;
 *
 * // Valid: each middleware gets what it needs
 * type Ctx = MiddlewaresContext<[Mw1, Mw2, Mw3], {}>;
 * // Result: { a: number; b: string }
 *
 * // Invalid: Mw2 requires { a: number } but Mw1 is missing
 * type BadCtx = MiddlewaresContext<[Mw2], {}>;
 * // Result: never (compile error)
 * ```
 */
export type MiddlewaresContext<TMiddlewares extends readonly Middleware<any, any, any, any>[], TContextIn = {}> = TMiddlewares extends readonly [
    Middleware<infer TNextContextOut, infer TNextContextIn, any, any>,
    ...infer TRest
] ? TContextIn extends TNextContextIn ? TRest extends readonly Middleware<any, any, any, any>[] ? MiddlewaresContext<TRest, TContextIn & TNextContextOut> : never : never : TMiddlewares extends readonly [] ? TContextIn : never;
/**
 * Helper type to extract the return type from a middleware
 */
export type MiddlewareReturn<T> = T extends Middleware<any, any, infer R, any> ? R : never;
/**
 * Helper type to extract the context input from a middleware
 */
export type MiddlewareContextIn<T> = T extends Middleware<any, infer Ctx, any, any> ? Ctx : never;
/**
 * Helper type to extract the context output from a middleware
 */
export type MiddlewareContextOut<T> = T extends Middleware<infer Ctx, any, any, any> ? Ctx : never;
/**
 * Helper type to check if a middleware is async
 */
export type IsAsyncMiddleware<T> = T extends Middleware<any, any, any, infer A> ? A : never;
//# sourceMappingURL=types.d.ts.map