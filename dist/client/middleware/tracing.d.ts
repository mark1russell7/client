/**
 * Tracing Middleware
 *
 * Adds distributed tracing metadata to requests.
 * Works with ALL transports (HTTP, WebSocket, Local, Mock).
 *
 * Each transport converts metadata.tracing to its protocol format:
 * - HTTP: X-Trace-Id, X-Span-Id, X-Parent-Span-Id headers
 * - WebSocket: Frame metadata
 * - Local: Passed directly to handler
 *
 * Compatible with OpenTelemetry, Jaeger, and custom tracing systems.
 */
import type { ClientMiddleware } from "../types";
/**
 * Tracing Configuration
 */
export interface TracingOptions {
    /** Generate trace ID (default: auto-generate UUID) */
    generateTraceId?: () => string;
    /** Generate span ID (default: auto-generate UUID) */
    generateSpanId?: () => string;
    /** Get current trace context (for continuing existing traces) */
    getCurrentTrace?: () => {
        traceId: string;
        spanId: string;
    } | null;
    /** Service name for tracing */
    serviceName?: string;
}
/**
 * Create tracing middleware
 *
 * Automatically adds tracing metadata to all requests.
 * Supports both new traces and continuing existing traces.
 *
 * @example Basic Usage
 * ```typescript
 * const client = new Client({
 *   transport: new HttpTransport({ baseUrl: "https://api.example.com" }),
 *   middleware: [
 *     createTracingMiddleware(),  // Auto-generates trace/span IDs
 *     createRetryMiddleware({ maxAttempts: 3 }),
 *   ]
 * });
 * ```
 *
 * @example Custom ID Generation
 * ```typescript
 * createTracingMiddleware({
 *   generateTraceId: () => uuid.v4(),
 *   generateSpanId: () => uuid.v4(),
 * })
 * ```
 *
 * @example Continuing Existing Trace
 * ```typescript
 * createTracingMiddleware({
 *   getCurrentTrace: () => {
 *     const trace = getActiveTrace();  // From your tracing library
 *     return trace ? {
 *       traceId: trace.traceId,
 *       spanId: trace.spanId,
 *     } : null;
 *   }
 * })
 * ```
 *
 * @example OpenTelemetry Integration
 * ```typescript
 * import { trace } from "@opentelemetry/api";
 *
 * createTracingMiddleware({
 *   getCurrentTrace: () => {
 *     const span = trace.getActiveSpan();
 *     if (!span) return null;
 *
 *     const spanContext = span.spanContext();
 *     return {
 *       traceId: spanContext.traceId,
 *       spanId: spanContext.spanId,
 *     };
 *   }
 * })
 * ```
 */
export declare function createTracingMiddleware(options?: TracingOptions): ClientMiddleware;
/**
 * Create simple tracing middleware with UUID generation
 *
 * Convenience wrapper that uses crypto.randomUUID() if available.
 *
 * @example
 * ```typescript
 * createSimpleTracingMiddleware()
 * // Generates: traceId and spanId using crypto.randomUUID() or fallback
 * ```
 */
export declare function createSimpleTracingMiddleware(): ClientMiddleware;
/**
 * Extract tracing info from response metadata
 *
 * Useful for logging or passing to other systems.
 *
 * @example
 * ```typescript
 * const response = await client.call(...);
 * const tracing = extractTracingInfo(response.metadata);
 * console.log(`Request completed: ${tracing.traceId}`);
 * ```
 */
export declare function extractTracingInfo(metadata: Record<string, unknown>): {
    traceId?: string;
    spanId?: string;
    parentSpanId?: string;
} | null;
//# sourceMappingURL=tracing.d.ts.map