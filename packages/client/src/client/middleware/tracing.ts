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

import type { TypedClientMiddleware } from "../types";
import type { TracingContext } from "./contexts";

/**
 * Tracing Configuration
 */
export interface TracingOptions {
  /** Generate trace ID (default: auto-generate UUID) */
  generateTraceId?: () => string;

  /** Generate span ID (default: auto-generate UUID) */
  generateSpanId?: () => string;

  /** Get current trace context (for continuing existing traces) */
  getCurrentTrace?: () => { traceId: string; spanId: string } | null;

  /** Service name for tracing */
  serviceName?: string;
}

/**
 * Generate a simple unique ID (UUID v4 subset)
 */
function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
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
export function createTracingMiddleware(
  options: TracingOptions = {}
): TypedClientMiddleware<TracingContext, {}> {
  const {
    generateTraceId = generateId,
    generateSpanId = generateId,
    getCurrentTrace,
    serviceName,
  } = options;

  return (next) => async function* (context) {
    // Check if there's already tracing metadata
    if (!context.message.metadata.tracing) {
      // Try to get current trace context
      const currentTrace = getCurrentTrace?.();

      if (currentTrace) {
        // Continue existing trace (create child span)
        context.message.metadata.tracing = {
          traceId: currentTrace.traceId,
          spanId: generateSpanId(),
          parentSpanId: currentTrace.spanId,
        };
      } else {
        // Start new trace
        context.message.metadata.tracing = {
          traceId: generateTraceId(),
          spanId: generateSpanId(),
        };
      }

      // Add service name if provided
      if (serviceName) {
        context.message.metadata.serviceName = serviceName;
      }
    }

    // Continue middleware chain
    yield* next(context);
  };
}

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
export function createSimpleTracingMiddleware(): TypedClientMiddleware<TracingContext, {}> {
  const hasRandomUUID = typeof crypto !== "undefined" && "randomUUID" in crypto;

  return createTracingMiddleware({
    generateTraceId: hasRandomUUID
      ? () => crypto.randomUUID()
      : generateId,
    generateSpanId: hasRandomUUID
      ? () => crypto.randomUUID()
      : generateId,
  });
}

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
export function extractTracingInfo(metadata: Record<string, unknown>): {
  traceId?: string;
  spanId?: string;
  parentSpanId?: string;
} | null {
  if (!metadata.tracing || typeof metadata.tracing !== "object") {
    return null;
  }

  const tracing = metadata.tracing as Record<string, unknown>;

  return {
    ...(typeof tracing.traceId === "string" && { traceId: tracing.traceId }),
    ...(typeof tracing.spanId === "string" && { spanId: tracing.spanId }),
    ...(typeof tracing.parentSpanId === "string" && { parentSpanId: tracing.parentSpanId }),
  };
}
