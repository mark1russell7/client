/**
 * Local Transport Types
 *
 * Type definitions and utilities for Local adapter.
 */
import type { Message, Method } from "../../../client/types.js";
/**
 * Handler function for a method.
 */
export type Handler<TReq = unknown, TRes = unknown> = (payload: TReq, message: Message<TReq>) => TRes | Promise<TRes>;
/**
 * Method key for handler registry.
 */
export declare function methodKey(method: Method): string;
/**
 * Local Transport configuration.
 */
export interface LocalTransportOptions {
    /**
     * Pre-registered handlers.
     * Keys can be either:
     * - "{service}.{operation}" (e.g., "users.get")
     * - "{version}:{service}.{operation}" (e.g., "v2:users.get")
     */
    handlers?: Record<string, Handler>;
    /**
     * Whether to throw on missing handlers (default: true).
     */
    throwOnMissing?: boolean;
}
//# sourceMappingURL=types.d.ts.map