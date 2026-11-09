/**
 * The propagation gate of rigor-testkit on each transport of the client (roadmap C12 of otel-ts).
 * One context id goes from a `Client` to a handler of a `ProcedureServer`, and from there to the
 * spans, the log records and the metrics. The SDK is the one of otel-ts, as in a service. The gate
 * also sends a call on a broken copy of each transport, and that call must fail.
 *
 * In CI, the report goes to the summary of the job.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import { appendFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { MessageChannel } from "node:worker_threads";
import * as z from "zod";
import { trace, type ProxyTracerProvider } from "@opentelemetry/api";
import { logs } from "@opentelemetry/api-logs";
import { InMemoryLogRecordExporter } from "@opentelemetry/sdk-logs";
import { MetricReader } from "@opentelemetry/sdk-metrics";
import { InMemorySpanExporter } from "@opentelemetry/sdk-trace-base";
import { contextValue, defineContextKeys, withContext, withInternalCall } from "@mark1russell7/otel-ts/context";
import { startNodeTelemetry } from "@mark1russell7/otel-ts/node";
import { formatPropagationReport, localTransport, propagationGate, type PropagationTransport } from "@mark1russell7/rigor-testkit/propagation";
import { Client } from "../client/client.js";
import type { Transport } from "../client/types.js";
import { createProcedure } from "../procedures/define.js";
import { createRegistry } from "../procedures/module.js";
import { tracingInterceptor } from "../procedures/interceptors.js";
import { ProcedureServer } from "../server/procedure-server.js";
import { LOCAL_CREDENTIALS } from "../server/request-auth.js";
import { pathToMethod } from "../server/method.js";
import { HttpTransport } from "../adapters/http/client/transport.js";
import { HttpServerTransport } from "../adapters/http/server/transport.js";
import { WebSocketTransport } from "../adapters/websocket/client/node.js";
import { WebSocketServerTransport } from "../adapters/websocket/server/transport.js";
import { PortTransport } from "../adapters/port/transport.js";

const KEY = "request.id";
const TOKEN = "gate-token";

/** A metric reader that collects only when the test asks */
class PullReader extends MetricReader {
  protected override async onForceFlush(): Promise<void> {}
  protected override async onShutdown(): Promise<void> {}
}

const spans = new InMemorySpanExporter();
const logRecords = new InMemoryLogRecordExporter();
const reader = new PullReader();

/** This function flushes a provider of the global API. A proxy gives its delegate. */
const flush = async (provider: object): Promise<void> => {
  const real = "getDelegate" in provider ? (provider as ProxyTracerProvider).getDelegate() : provider;
  await (real as { forceFlush?: () => Promise<void> }).forceFlush?.();
};

const capture = {
  spans: async () => {
    await flush(trace.getTracerProvider());
    return spans.getFinishedSpans();
  },
  logRecords: async () => {
    await flush(logs.getLoggerProvider());
    return logRecords.getFinishedLogRecords();
  },
  metricPoints: async () => {
    const { resourceMetrics } = await reader.collect();
    return resourceMetrics.scopeMetrics.flatMap((scope) =>
      scope.metrics.flatMap((metric) => metric.dataPoints.map((point) => ({ name: metric.descriptor.name, attributes: point.attributes }))),
    );
  },
  reset: async () => {
    await flush(trace.getTracerProvider());
    await flush(logs.getLoggerProvider());
    spans.reset();
    logRecords.reset();
  },
};

/** The handler of the gate for the call in progress. The procedure `gate.run` starts it. */
let handler: (() => Promise<void>) | undefined;

const registry = createRegistry({
  name: "gate",
  procedures: [
    createProcedure()
      .path(["gate", "run"])
      .input(z.object({}))
      .output(z.number())
      .meta({ effects: { reads: [], writes: [] } })
      .handler(async () => {
        if (handler === undefined) throw new Error("no call of the gate is in progress");
        await handler();
        return 1;
      })
      .build(),
    createProcedure()
      .path(["gate", "nested"])
      .input(z.object({}))
      .output(z.number())
      .meta({ effects: { reads: [], writes: [] }, calls: ["gate.run"] })
      .handler(async (_input, ctx) => ctx.client.call(["gate", "run"], {}) as Promise<number>)
      .build(),
  ],
});

let telemetry: ReturnType<typeof startNodeTelemetry> | undefined;
let server: ProcedureServer;
const app = express();
const http = createServer(app);
const channel = new MessageChannel();
const cleanups: Array<() => Promise<void> | void> = [];

beforeAll(async () => {
  defineContextKeys({ [KEY]: { cardinality: "high", propagate: "internal" } });
  telemetry = startNodeTelemetry({ enabled: true, stopOnSignals: false, env: {}, traceExporter: spans, logExporter: logRecords, metricReaders: [reader] });
  // A caller with the token of the server is trusted, so its baggage comes in (C10)
  server = new ProcedureServer({ registry, token: TOKEN, interceptors: [tracingInterceptor({ onSpan: () => {} })] });
  server.registerFromRegistry();
  server.addTransport(new HttpServerTransport(server, { app, httpServer: http }));
  const ws = new WebSocketServerTransport(server, { server: http, path: "/ws" });
  server.addTransport(ws);
  await server.start();
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", () => resolve()));
  // The worker side of the port serves the procedures, with the local credentials of a port
  const worker = new PortTransport(channel.port1, { serve: server });
  cleanups.push(() => worker.close());
  cleanups.push(async () => {
    await ws.stop();
    await server.stop();
    http.closeAllConnections();
    await new Promise<void>((resolve) => http.close(() => resolve()));
  });
});

afterAll(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup();
  channel.port1.close();
  channel.port2.close();
  await telemetry?.shutdown();
});

/** This function makes a transport of the gate: one call of `operation` with a `Client` on `transport`. */
const viaClient = (name: string, transport: Transport, operation = "run"): PropagationTransport => {
  const client = new Client(transport);
  cleanups.push(() => (transport as { close?: () => unknown }).close?.() as Promise<void> | void);
  return {
    name,
    call: async (run) => {
      handler = run;
      try {
        expect(await client.call({ service: "gate", operation }, {})).toBe(1);
      } finally {
        handler = undefined;
      }
    },
  };
};

/** The transport `engine`: a local request to the engine of the server, and a nested call of its handler */
const engine: PropagationTransport = {
  name: "engine and nested call",
  call: async (run) => {
    handler = run;
    try {
      const response = await server.handle({ id: "gate", method: pathToMethod(["gate", "nested"]), payload: {}, metadata: {}, credentials: LOCAL_CREDENTIALS });
      if (response.status.type !== "success") throw new Error(`the call of the gate failed: ${JSON.stringify(response.status)}`);
    } finally {
      handler = undefined;
    }
  },
};

describe("the propagation gate on each transport of the client (C12)", () => {
  it("takes the context id from the client to the handler, and into each span, log record and metric", async () => {
    const { port } = http.address() as AddressInfo;
    const report = await propagationGate({
      key: KEY,
      transports: [
        localTransport(withInternalCall),
        viaClient("http", new HttpTransport({ baseUrl: `http://127.0.0.1:${port}/api`, defaultHeaders: { Authorization: `Bearer ${TOKEN}` } })),
        viaClient("websocket", new WebSocketTransport({ url: `ws://127.0.0.1:${port}/ws?token=${TOKEN}`, heartbeat: { enabled: false } })),
        viaClient("port", new PortTransport(channel.port2)),
        engine,
      ],
      capture,
      withValue: (key, value, fn) => withContext({ [key]: value }, fn),
      readValue: (key) => contextValue(key),
    });
    const text = formatPropagationReport(report);
    if (process.env["GITHUB_STEP_SUMMARY"]) appendFileSync(process.env["GITHUB_STEP_SUMMARY"], `${text}\n\n`);
    expect(text).not.toMatch(/\| fail \|/);
    expect(report.lines.map((line) => [line.transport, line.verdict, line.faults])).toEqual([
      ["local", "pass", []],
      ["http", "pass", []],
      ["websocket", "pass", []],
      ["port", "pass", []],
      ["engine and nested call", "pass", []],
    ]);
    expect(report.ok).toBe(true);
  });
});
