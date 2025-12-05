/**
 * Universal Pagination Middleware
 *
 * Protocol-agnostic pagination handling.
 * Works with any transport!
 */
import type { ClientMiddleware } from "../types";
/**
 * Pagination middleware options.
 */
export interface PaginationOptions {
    /**
     * Default page size
     * @default 50
     */
    defaultLimit?: number;
    /**
     * Maximum page size (prevents abuse)
     * @default 1000
     */
    maxLimit?: number;
    /**
     * Page parameter name in metadata
     * @default "page"
     */
    pageKey?: string;
    /**
     * Limit parameter name in metadata
     * @default "limit"
     */
    limitKey?: string;
    /**
     * Offset parameter name in metadata (alternative to page)
     * @default "offset"
     */
    offsetKey?: string;
    /**
     * Whether to use offset-based pagination instead of page-based
     * @default false
     */
    useOffset?: boolean;
}
/**
 * Create pagination middleware.
 *
 * Automatically handles pagination parameters in request metadata:
 * - Applies default limit if not specified
 * - Enforces maximum limit to prevent abuse
 * - Supports both page-based and offset-based pagination
 *
 * @param options - Pagination configuration
 * @returns Middleware function
 *
 * @example
 * ```typescript
 * // Page-based pagination
 * client.use(createPaginationMiddleware({
 *   defaultLimit: 50,
 *   maxLimit: 1000
 * }));
 *
 * await client.call(
 *   { service: "users", operation: "list" },
 *   {},
 *   { page: 2, limit: 100 } // Metadata
 * );
 *
 * // Offset-based pagination
 * client.use(createPaginationMiddleware({
 *   useOffset: true,
 *   defaultLimit: 50
 * }));
 *
 * await client.call(
 *   { service: "users", operation: "list" },
 *   {},
 *   { offset: 100, limit: 50 } // Metadata
 * );
 * ```
 */
export declare function createPaginationMiddleware(options?: PaginationOptions): ClientMiddleware;
/**
 * Helper to create an async iterator for paginated results.
 *
 * Automatically fetches all pages and yields items as they arrive.
 *
 * @param client - The client instance
 * @param method - Method to call
 * @param payload - Request payload
 * @param options - Pagination options
 * @returns Async iterable of all items across all pages
 *
 * @example
 * ```typescript
 * // Fetch all users across all pages
 * for await (const user of paginateAll(client, { service: "users", operation: "list" }, {})) {
 *   console.log(user);
 * }
 * ```
 */
export declare function paginateAll<TReq, TRes extends {
    items: any[];
    hasMore?: boolean;
    total?: number;
}>(client: {
    call: (method: any, payload: TReq, metadata?: any) => Promise<TRes>;
}, method: any, payload: TReq, options?: {
    limit?: number;
    maxPages?: number;
}): AsyncIterable<TRes extends {
    items: (infer U)[];
} ? U : never>;
//# sourceMappingURL=pagination.d.ts.map