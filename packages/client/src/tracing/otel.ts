/**
 * The context of OpenTelemetry for the calls of a client and the invocations of a host (roadmap
 * item C8 of otel-ts, decisions D5 and D6). This module uses `@opentelemetry/api` only. The API
 * does nothing until a program registers an SDK, for example with `startNodeTelemetry()` of
 * `@mark1russell7/otel-ts/node`.
 *
 * - With an SDK, each call gets a span of the API, and the registered propagator writes the
 *   context of the call into its metadata: `traceparent`, `tracestate` and `baggage`.
 * - With no SDK, `startApiSpan` gives undefined, and the W3C code of `traceparent.ts` operates as
 *   before (D6).
 */
import { context, createContextKey, isSpanContextValid, propagation, ROOT_CONTEXT, SpanStatusCode, trace } from "@opentelemetry/api";
import type { Context, Span, SpanKind, TextMapSetter } from "@opentelemetry/api";

/** The name of the tracer of the spans of this package */
export const TRACER_NAME = "@procedures/client";

/**
 * The key of the mark `internal call`. It is the same key as the key of `withInternalCall` of
 * `@mark1russell7/otel-ts/context`, because `createContextKey` gives `Symbol.for(description)`.
 * The propagator of otel-ts sends the baggage only on a call with this mark. A test pins the
 * description against otel-ts.
 */
export const INTERNAL_CALL_KEY: symbol = createContextKey("@mark1russell7/otel-ts/context internal call");

/** This function gives `from` with the mark `internal call`. */
export function asInternalCall(from: Context): Context {
  return from.setValue(INTERNAL_CALL_KEY, true);
}

/**
 * This function starts a span of the API, or gives undefined when no SDK gives the span ids of
 * its own. With no SDK, the API gives a span with no ids, or with the ids of its parent.
 */
export function startApiSpan(name: string, kind: SpanKind, parent: Context): Span | undefined {
  const parentSpan = trace.getSpanContext(parent);
  const span = trace.getTracer(TRACER_NAME).startSpan(name, { kind }, parent);
  const own = span.spanContext();
  if (isSpanContextValid(own) && own.spanId !== parentSpan?.spanId) return span;
  span.end();
  return undefined;
}

/** This function ends `span`, with the status of `error` when the call failed. */
export function endApiSpan(span: Span, error?: unknown): void {
  if (error !== undefined) {
    span.recordException(error instanceof Error ? error : String(error));
    span.setStatus({ code: SpanStatusCode.ERROR, message: error instanceof Error ? error.message : String(error) });
    const code = (error as { code?: unknown } | null)?.code;
    if (typeof code === "string") span.setAttribute("procedure.error.code", code);
  }
  span.end();
}

const metadataSetter: TextMapSetter<Record<string, unknown>> = {
  set: (carrier, key, value) => {
    carrier[key] = value;
  },
};

/** This function writes the context `from` into `metadata`, with the registered propagator. */
export function injectContext(from: Context, metadata: Record<string, unknown>): void {
  propagation.inject(from, metadata, metadataSetter);
}

/**
 * This function gives the parent context of an invocation of a host: the active context, with the
 * remote span of the `traceparent` and `tracestate` of `metadata` when they are valid. The baggage
 * of the metadata is not read: the host reads it only from a trusted caller (`@procedures/peer`).
 */
export function remoteParent(metadata: Record<string, unknown>, from: Context = context.active()): Context {
  const traceparent = metadata["traceparent"];
  if (typeof traceparent !== "string") return from;
  const carrier: Record<string, string> = { traceparent };
  if (typeof metadata["tracestate"] === "string") carrier["tracestate"] = metadata["tracestate"];
  const extracted = propagation.extract(from, carrier);
  return isSpanContextValid(trace.getSpanContext(extracted) ?? { traceId: "", spanId: "", traceFlags: 0 }) ? extracted : from;
}

/** The trace context that the caller of a call gave in its metadata: `traceparent` and `tracestate`, strings only */
export type CallerTrace = { readonly traceparent?: string; readonly tracestate?: string };

/** This function gives the `traceparent` and `tracestate` of `metadata`, before the client writes its own. */
export function callerTraceOf(metadata: Readonly<Record<string, unknown>>): CallerTrace {
  const { traceparent, tracestate } = metadata;
  return {
    ...(typeof traceparent === "string" ? { traceparent } : {}),
    ...(typeof tracestate === "string" ? { tracestate } : {}),
  };
}

/**
 * This function gives the parent context of a try of a call of a client (roadmap item C19 of
 * otel-ts): the active context when it has a valid span, else the remote span of `caller`, the
 * trace context that the caller gave in the metadata of the call. For example, `mark` gives the
 * environment variables `TRACEPARENT` and `TRACESTATE` there. Without this, the span of the call
 * started a new trace, and the propagator wrote that trace over the trace context of the caller.
 */
export function callParent(caller: CallerTrace, from: Context = context.active()): Context {
  const active = trace.getSpanContext(from);
  return active !== undefined && isSpanContextValid(active) ? from : remoteParent(caller, from);
}

/**
 * This function gives the context of the caller of an invocation of a host (roadmap item C10 of
 * otel-ts): the handler runs in it, so its logs, metrics, spans and nested calls carry the ids of
 * the caller.
 *
 * - The remote span of the `traceparent` and `tracestate` of `metadata` is always the parent.
 * - The `baggage` of `metadata` replaces the baggage of `from` only when the caller is trusted.
 * - When the caller is not trusted, the context has no baggage: an end user cannot set the
 *   baggage of the services. The baggage of `from` can come from the headers of the same request,
 *   for example from the HTTP instrumentation of an SDK, so the function removes it too.
 */
export function callerContext(metadata: Record<string, unknown>, trusted: boolean, from: Context = context.active()): Context {
  const parent = remoteParent(metadata, from);
  if (!trusted) return propagation.getBaggage(parent) === undefined ? parent : propagation.deleteBaggage(parent);
  const baggage = metadata["baggage"];
  if (typeof baggage !== "string") return parent;
  const extracted = propagation.getBaggage(propagation.extract(ROOT_CONTEXT, { baggage }));
  return extracted === undefined ? parent : propagation.setBaggage(parent, extracted);
}
