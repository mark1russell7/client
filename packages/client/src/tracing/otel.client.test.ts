/**
 * The context of OpenTelemetry on the calls of a client and the invocations of a host (roadmap C8
 * of otel-ts, decisions D5 and D6). With an SDK, the spans of the API give the ids, and the
 * registered propagator writes the context into the metadata of each call, with the mark of an
 * internal call. The tests of R16 (`trace.client.test.ts`) hold the behavior with no SDK.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import express from "express";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import * as z from "zod";
import { context, propagation, ROOT_CONTEXT, SpanKind, trace, type Context, type TextMapPropagator, type TextMapSetter } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { CompositePropagator, W3CBaggagePropagator, W3CTraceContextPropagator } from "@opentelemetry/core";
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { isInternalCall, withInternalCall } from "@mark1russell7/otel-ts/context";
import { Client } from "../client/client.js";
import { createProcedure } from "../procedures/define.js";
import { createRegistry } from "../procedures/module.js";
import { metricsInterceptor, tracingInterceptor, type InvocationSpan } from "../procedures/interceptors.js";
import { ProcedureServer, type ProcedureServerOptions } from "../server/procedure-server.js";
import { LOCAL_CREDENTIALS } from "../server/request-auth.js";
import { pathToMethod } from "../server/method.js";
import { HttpTransport } from "../adapters/http/client/transport.js";
import { HttpServerTransport } from "../adapters/http/server/transport.js";
import { INTERNAL_CALL_KEY, asInternalCall, callerContext, startApiSpan } from "./otel.js";

const exporter = new InMemorySpanExporter();
/** Each carrier that the propagator wrote, with the mark of an internal call of its context */
const injected: Array<{ internal: boolean; carrier: Record<string, unknown> }> = [];

/** The W3C propagators, with a record of each inject */
const recording = (): TextMapPropagator => {
  const w3c = new CompositePropagator({ propagators: [new W3CTraceContextPropagator(), new W3CBaggagePropagator()] });
  return {
    inject(from: Context, carrier: unknown, setter: TextMapSetter) {
      w3c.inject(from, carrier, setter);
      injected.push({ internal: isInternalCall(from), carrier: { ...(carrier as Record<string, unknown>) } });
    },
    extract: (from, carrier, getter) => w3c.extract(from, carrier, getter),
    fields: () => w3c.fields(),
  };
};

beforeEach(() => {
  context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
  trace.setGlobalTracerProvider(new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] }));
  propagation.setGlobalPropagator(recording());
});

afterEach(() => {
  trace.disable();
  propagation.disable();
  context.disable();
  exporter.reset();
  injected.length = 0;
});

/** A server on the loopback with `outer`, which calls `inner`, and the spans of its interceptor */
const started = async (interceptors: "tracing" | "metrics" = "tracing", options: ProcedureServerOptions & { bearer?: string } = {}) => {
  const spans: InvocationSpan[] = [];
  const seen: Array<{ traceId: string | undefined; tenant: string | undefined }> = [];
  const registry = createRegistry({
    name: "otel",
    procedures: [
      createProcedure()
        .path(["test", "outer"])
        .input(z.object({}))
        .output(z.number())
        .meta({ effects: { reads: [], writes: [] }, calls: ["test.inner"] })
        .handler(async (_input, ctx) => {
          seen.push({
            traceId: trace.getActiveSpan()?.spanContext().traceId,
            tenant: propagation.getActiveBaggage()?.getEntry("tenant")?.value,
          });
          return ctx.client.call(["test", "inner"], {}) as Promise<number>;
        })
        .build(),
      createProcedure()
        .path(["test", "inner"])
        .input(z.object({}))
        .output(z.number())
        .meta({ effects: { reads: [], writes: [] } })
        .handler(async () => 7)
        .build(),
    ],
  });
  const interceptor = interceptors === "tracing" ? tracingInterceptor({ onSpan: (span) => spans.push(span) }) : metricsInterceptor().interceptor;
  const { bearer, ...serverOptions } = options;
  const server = new ProcedureServer({ ...serverOptions, registry, interceptors: [interceptor] });
  server.registerFromRegistry();
  const app = express();
  const http = createServer(app);
  server.addTransport(new HttpServerTransport(server, { app, httpServer: http }));
  await server.start();
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", () => resolve()));
  const client = new Client(
    new HttpTransport({
      baseUrl: `http://127.0.0.1:${(http.address() as AddressInfo).port}/api`,
      defaultHeaders: bearer === undefined ? {} : { Authorization: `Bearer ${bearer}` },
    }),
  );
  const stop = async (): Promise<void> => {
    await server.stop();
    http.closeAllConnections();
    await new Promise<void>((resolve) => http.close(() => resolve()));
  };
  return { client, server, spans, seen, stop };
};

describe("the mark of an internal call (C8)", () => {
  it("is the same key as the mark of otel-ts", () => {
    expect(withInternalCall(() => context.active().getValue(INTERNAL_CALL_KEY))).toBe(true);
    expect(isInternalCall(asInternalCall(ROOT_CONTEXT))).toBe(true);
    expect(isInternalCall(ROOT_CONTEXT)).toBe(false);
  });
});

describe("one trace of the API from the client to the handler, with an SDK (C8)", () => {
  it("makes a client span, a host span and a span of the nested call, in the trace of the caller", async () => {
    const { client, spans, seen, stop } = await started();
    try {
      const app = trace.getTracer("test").startSpan("app");
      const caller = propagation.setBaggage(trace.setSpan(ROOT_CONTEXT, app), propagation.createBaggage({ tenant: { value: "acme" } }));
      expect(await context.with(caller, () => client.call({ service: "test", operation: "outer" }, {}))).toBe(7);
      app.end();

      const traceId = app.spanContext().traceId;
      const byName = (name: string, kind: SpanKind) => exporter.getFinishedSpans().find((span) => span.name === name && span.kind === kind)!;
      const call = byName("test.outer", SpanKind.CLIENT);
      const host = byName("test.outer", SpanKind.SERVER);
      const nested = byName("test.inner", SpanKind.INTERNAL);
      expect([call, host, nested].map((span) => span.spanContext().traceId)).toEqual([traceId, traceId, traceId]);
      expect(call.parentSpanContext?.spanId).toBe(app.spanContext().spanId);
      expect(host.parentSpanContext?.spanId).toBe(call.spanContext().spanId);
      expect(nested.parentSpanContext?.spanId).toBe(host.spanContext().spanId);

      // The records of the interceptor have the ids of the spans of the API
      const outer = spans.find((span) => span.key === "test.outer")!;
      const inner = spans.find((span) => span.key === "test.inner")!;
      expect(outer).toMatchObject({ id: host.spanContext().spanId, parentId: call.spanContext().spanId, remoteParent: true, traceId });
      expect(inner).toMatchObject({ id: nested.spanContext().spanId, parentId: host.spanContext().spanId, traceId });

      // The call sent the context with the mark of an internal call, so the propagator of otel-ts sends the baggage
      expect(injected).toHaveLength(1);
      expect(injected[0]!.internal).toBe(true);
      expect(injected[0]!.carrier).toMatchObject({
        traceparent: `00-${traceId}-${call.spanContext().spanId}-01`,
        baggage: "tenant=acme",
        tracing: { traceId, spanId: call.spanContext().spanId, parentSpanId: app.spanContext().spanId },
      });
      // The handler runs in its span. The caller has no token, so the host does not use its baggage (C10)
      expect(seen).toEqual([{ traceId, tenant: undefined }]);
    } finally {
      await stop();
    }
  });

  it("starts a trace of its own for a call with no active span", async () => {
    const { client, stop } = await started();
    try {
      await client.call({ service: "test", operation: "outer" }, {});
      const call = exporter.getFinishedSpans().find((span) => span.kind === SpanKind.CLIENT)!;
      expect(call.parentSpanContext).toBeUndefined();
      expect(exporter.getFinishedSpans().every((span) => span.spanContext().traceId === call.spanContext().traceId)).toBe(true);
    } finally {
      await stop();
    }
  });

  it("makes no span of the API for the metrics interceptor", async () => {
    const { client, stop } = await started("metrics");
    try {
      await client.call({ service: "test", operation: "outer" }, {});
      expect(exporter.getFinishedSpans().map((span) => span.kind)).toEqual([SpanKind.CLIENT]);
    } finally {
      await stop();
    }
  });
});

describe("the handler runs in the context of its caller (C10)", () => {
  const TRACE_ID = "0af7651916cd43dd8448eb211c80319c";
  const metadata = { traceparent: `00-${TRACE_ID}-b7ad6b7169203331-01`, baggage: "tenant=acme" };
  /** The context that the handler of `test.outer` sees for one request to the engine */
  const handled = async (options: ProcedureServerOptions, credentials: Parameters<ProcedureServer["handle"]>[0]["credentials"]) => {
    const { server, seen, stop } = await started("metrics", options);
    try {
      const response = await server.handle({ id: "1", method: pathToMethod(["test", "outer"]), payload: {}, metadata: { ...metadata }, credentials });
      expect(response.status.type).toBe("success");
      return seen[0];
    } finally {
      await stop();
    }
  };

  it("uses the trace and the baggage of a caller with the token of the server, with the metrics interceptor only", async () => {
    const { client, seen, stop } = await started("metrics", { token: "secret", bearer: "secret" });
    try {
      const app = trace.getTracer("test").startSpan("app");
      const caller = propagation.setBaggage(trace.setSpan(ROOT_CONTEXT, app), propagation.createBaggage({ tenant: { value: "acme" } }));
      expect(await context.with(caller, () => client.call({ service: "test", operation: "outer" }, {}))).toBe(7);
      app.end();
      // Before C10, the peer host (metrics interceptor only) ran the handler outside the trace of its caller
      expect(seen).toEqual([{ traceId: app.spanContext().traceId, tenant: "acme" }]);
    } finally {
      await stop();
    }
  });

  it("uses the trace, but not the baggage, of a caller with no token", async () => {
    const { client, seen, stop } = await started("metrics");
    try {
      const app = trace.getTracer("test").startSpan("app");
      const caller = propagation.setBaggage(trace.setSpan(ROOT_CONTEXT, app), propagation.createBaggage({ tenant: { value: "acme" } }));
      await context.with(caller, () => client.call({ service: "test", operation: "outer" }, {}));
      app.end();
      expect(seen).toEqual([{ traceId: app.spanContext().traceId, tenant: undefined }]);
    } finally {
      await stop();
    }
  });

  it("trusts a local caller", async () => {
    expect(await handled({}, LOCAL_CREDENTIALS)).toEqual({ traceId: TRACE_ID, tenant: "acme" });
  });

  it("trusts a caller with the token of the server, and the calls of its admission", async () => {
    expect(await handled({ token: "secret" }, { bearer: "secret" })).toEqual({ traceId: TRACE_ID, tenant: "acme" });
    const { server, seen, stop } = await started("metrics", { token: "secret" });
    try {
      const admission = await server.admission({ bearer: "secret" });
      expect(admission.ok).toBe(true);
      if (!admission.ok) return;
      await server.handle({ id: "1", method: pathToMethod(["test", "outer"]), payload: {}, metadata: { ...metadata }, credentials: admission.credentials });
      expect(seen).toEqual([{ traceId: TRACE_ID, tenant: "acme" }]);
    } finally {
      await stop();
    }
  });

  it("does not trust a principal of the request hook alone", async () => {
    const principalOf = () => ({ principal: { id: "alice", via: "cookie" } });
    expect(await handled({ principalOf }, { bearer: "alice" })).toEqual({ traceId: TRACE_ID, tenant: undefined });
  });

  it("trusts the callers that the function trustBaggage names, and not after an error of it", async () => {
    const principalOf = () => ({ principal: { id: "billing", via: "mtls" } });
    const trustBaggage = (request: { principal?: { id: string } | undefined }) => request.principal?.id === "billing";
    expect(await handled({ principalOf, trustBaggage }, { bearer: "x" })).toEqual({ traceId: TRACE_ID, tenant: "acme" });
    const throws = () => {
      throw new Error("no");
    };
    expect(await handled({ principalOf, trustBaggage: throws }, { bearer: "x" })).toEqual({ traceId: TRACE_ID, tenant: undefined });
  });

  it("removes the baggage of the active context for a caller that is not trusted", () => {
    const active = propagation.setBaggage(ROOT_CONTEXT, propagation.createBaggage({ tenant: { value: "spoof" } }));
    expect(propagation.getBaggage(callerContext({}, false, active))).toBeUndefined();
    // A trusted caller with no baggage in the metadata keeps the baggage of the active context (a call in this process)
    expect(propagation.getBaggage(callerContext({}, true, active))?.getEntry("tenant")?.value).toBe("spoof");
    // The baggage of a trusted caller replaces it
    expect(propagation.getBaggage(callerContext({ baggage: "tenant=acme" }, true, active))?.getAllEntries()).toEqual([["tenant", { value: "acme" }]]);
  });
});

describe("with no SDK (D6)", () => {
  it("gives no span of the API, so the W3C code of R16 operates", () => {
    trace.disable();
    expect(startApiSpan("x", SpanKind.CLIENT, ROOT_CONTEXT)).toBeUndefined();
    // A noop span that takes the ids of its parent is not a span of its own
    const parent = trace.setSpanContext(ROOT_CONTEXT, { traceId: "0af7651916cd43dd8448eb211c80319c", spanId: "b7ad6b7169203331", traceFlags: 1 });
    expect(startApiSpan("x", SpanKind.CLIENT, parent)).toBeUndefined();
  });
});
