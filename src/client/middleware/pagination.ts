/**
 * Universal Pagination Middleware
 *
 * Protocol-agnostic pagination handling.
 * Works with any transport!
 */

import type { ClientRunner, ClientContext, TypedClientMiddleware } from "../types";
import type { PaginationContext } from "./contexts";

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
export function createPaginationMiddleware(
  options: PaginationOptions = {}
): TypedClientMiddleware<PaginationContext, {}> {
  const {
    defaultLimit = 50,
    maxLimit = 1000,
    pageKey = "page",
    limitKey = "limit",
    offsetKey = "offset",
    useOffset = false,
  } = options;

  return <TReq, TRes>(next: ClientRunner<TReq, TRes>): ClientRunner<TReq, TRes> => {
    return async function* (context: ClientContext<TReq>) {
      const { metadata } = context.message;

      // Extract pagination params
      let page = metadata[pageKey] as number | undefined;
      let limit = metadata[limitKey] as number | undefined;
      let offset = metadata[offsetKey] as number | undefined;

      // Apply defaults and limits
      if (limit === undefined) {
        limit = defaultLimit;
      } else {
        // Enforce maximum limit
        limit = Math.min(Math.max(1, limit), maxLimit);
      }

      if (useOffset) {
        // Offset-based pagination
        if (offset === undefined) {
          offset = 0;
        } else {
          offset = Math.max(0, offset);
        }

        // Update message metadata
        context.message.metadata = {
          ...metadata,
          [offsetKey]: offset,
          [limitKey]: limit,
        };
      } else {
        // Page-based pagination
        if (page === undefined) {
          page = 1;
        } else {
          page = Math.max(1, page);
        }

        // Update message metadata
        context.message.metadata = {
          ...metadata,
          [pageKey]: page,
          [limitKey]: limit,
        };

        // Optionally compute offset for backends that need it
        const computedOffset = (page - 1) * limit;
        if (metadata.includeOffset) {
          context.message.metadata[offsetKey] = computedOffset;
        }
      }

      // Execute request
      yield* next(context);
    };
  };
}

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
export async function* paginateAll<TReq, TRes extends { items: any[]; hasMore?: boolean; total?: number }>(
  client: { call: (method: any, payload: TReq, metadata?: any) => Promise<TRes> },
  method: any,
  payload: TReq,
  options: { limit?: number; maxPages?: number } = {}
): AsyncIterable<TRes extends { items: (infer U)[] } ? U : never> {
  const { limit = 50, maxPages = Infinity } = options;
  let page = 1;
  let hasMore = true;

  while (hasMore && page <= maxPages) {
    const response = await client.call(method, payload, { page, limit });

    // Yield all items from this page
    for (const item of response.items) {
      yield item;
    }

    // Check if there are more pages
    if (response.hasMore !== undefined) {
      hasMore = response.hasMore;
    } else if (response.total !== undefined) {
      hasMore = page * limit < response.total;
    } else {
      // If no pagination metadata, check if we got a full page
      hasMore = response.items.length === limit;
    }

    page++;
  }
}
