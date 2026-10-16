/**
 * One trace from the client to the handler (roadmap R16). The tracing middleware sends a W3C
 * `traceparent`, the tracing interceptor of the server continues that trace, and the nested
 * calls of a handler carry the span of that handler.
 */

import { describe, it, expect } from "vitest";
import express from "express";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { z } from "zod";
import { Client } from "../client/client.js";
import { createTracingMiddleware } from "../client/middleware/tracing.js";
import { createProcedure } from "../procedures/define.js";
import { createRegistry } from "../procedures/module.js";
import { tracingInterceptor, type InvocationSpan } from "../procedures/interceptors.js";
import { ProcedureServer } from "../server/procedure-server.js";
import { HttpTransport } from "../adapters/http/client/transport.js";
import { HttpServerTransport } from "../adapters/http/server/transport.js";
import { formatTraceparent, isW3cIds, parseTraceparent } from "./traceparent.js";

describe("traceparent", () => {
  it("formats and parses the W3C form, and refuses the zero ids", () => {
    const value = formatTraceparent("0af7651916cd43dd8448eb211c80319c", "b7ad6b7169203331");
    expect(value).toBe("00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01");
    expect(parseTraceparent(value)).toEqual({ traceId: "0af7651916cd43dd8448eb211c80319c", spanId: "b7ad6b7169203331", sampled: true });
    expect(parseTraceparent(`00-${"0".repeat(32)}-b7ad6b7169203331-01`)).toBeUndefined();
    expect(parseTraceparent("garbage")).toBeUndefined();
  });
});

describe("one trace from the client to the handler (R16)", () => {
  it("the server continues the trace of the client, and a nested call continues the trace of its handler", async () => {
    const spans: InvocationSpan[] = [];
    const seenTraceparent: string[] = [];
    const registry = createRegistry({
      name: "trace",
      procedures: [
        createProcedure()
          .path(["test", "outer"])
          .input(z.object({}))
          .output(z.number())
          .meta({ effects: { reads: [], writes: [] }, calls: ["test.inner"] })
          .handler(async (_input, ctx) => {
            seenTraceparent.push(String(ctx.metadata?.["traceparent"]));
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
    const server = new ProcedureServer({ registry, interceptors: [tracingInterceptor({ onSpan: (span) => spans.push(span) })] });
    server.registerFromRegistry();
    const app = express();
    const http = createServer(app);
    server.addTransport(new HttpServerTransport(server, { app, httpServer: http }));
    await server.start();
    await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", () => resolve()));
    try {
      const sent: Array<Record<string, unknown>> = [];
      const transport = new HttpTransport({ baseUrl: `http://127.0.0.1:${(http.address() as AddressInfo).port}/api` });
      const client = new Client(transport).use(createTracingMiddleware()).use(((next: (context: { message: { metadata: Record<string, unknown> } }) => unknown) => (context: { message: { metadata: Record<string, unknown> } }) => {
        sent.push({ ...context.message.metadata });
        return next(context);
      }) as never);
      expect(await client.call({ service: "test", operation: "outer" }, {})).toBe(7);

      const tracing = sent[0]!["tracing"] as { traceId: string; spanId: string };
      expect(isW3cIds(tracing.traceId, tracing.spanId)).toBe(true);
      const outer = spans.find((span) => span.key === "test.outer")!;
      const inner = spans.find((span) => span.key === "test.inner")!;
      // The span of the server continues the trace of the client
      expect(outer.traceId).toBe(tracing.traceId);
      expect(outer.parentId).toBe(tracing.spanId);
      expect(outer.remoteParent).toBe(true);
      // The nested call is a child of the handler that made it
      expect(inner.traceId).toBe(tracing.traceId);
      expect(inner.parentId).toBe(outer.id);
      // The handler sees its own span as the trace context of its calls
      expect(seenTraceparent[0]).toBe(formatTraceparent(tracing.traceId, outer.id));
    } finally {
      await server.stop();
      http.closeAllConnections();
      await new Promise<void>((resolve) => http.close(() => resolve()));
    }
  });
});
