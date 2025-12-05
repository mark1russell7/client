/**
 * Mock Transport Types
 *
 * Type definitions for Mock adapter testing utilities.
 */
import type { Message, ResponseItem } from "../../../client/types";
/**
 * Mock response configuration.
 */
export interface MockResponse<TRes = unknown> {
    /**
     * Response items to return (for streaming)
     */
    items?: ResponseItem<TRes>[];
    /**
     * Single response item (convenience for non-streaming)
     */
    item?: ResponseItem<TRes>;
    /**
     * Error to throw
     */
    error?: Error;
    /**
     * Delay in milliseconds before responding
     * @default Uses transport's latency config
     */
    delay?: number;
    /**
     * Number of times this response can be used
     * @default Infinity (reusable)
     */
    count?: number;
}
/**
 * Response matcher function.
 */
export type ResponseMatcher = (method: any, payload: unknown) => boolean;
/**
 * Mock transport configuration options.
 */
export interface MockTransportOptions {
    /**
     * Minimum latency in milliseconds
     * @default 0
     */
    minLatency?: number;
    /**
     * Maximum latency in milliseconds
     * @default 0
     */
    maxLatency?: number;
    /**
     * Random failure rate (0-1)
     * @default 0
     */
    failureRate?: number;
    /**
     * Default error message for random failures
     * @default "Mock transport error"
     */
    defaultErrorMessage?: string;
    /**
     * Enable call history tracking
     * @default true
     */
    trackHistory?: boolean;
    /**
     * Maximum history size (prevents memory leaks)
     * @default 1000
     */
    maxHistorySize?: number;
}
/**
 * Call history entry for assertions.
 */
export interface CallHistoryEntry<TReq = unknown> {
    /** Message that was sent */
    message: Message<TReq>;
    /** Timestamp when call was made */
    timestamp: number;
    /** Whether the call completed successfully */
    success: boolean;
    /** Error if call failed (only present when success is false) */
    error: Error | undefined;
}
//# sourceMappingURL=types.d.ts.map