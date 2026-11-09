/**
 * The propagation gate of rigor-testkit on the two entries of `mark` (roadmap C19 of otel-ts): the
 * MCP face (`mark mcp`) and the CLI call to the CLI server. One context id goes from the caller to
 * a handler, and from there to the spans, the log records and the metrics. The SDK is the one of
 * otel-ts, as in a service.
 *
 * Each call runs in the root context. Thus only the carrier of the entry takes the context: the
 * `_meta` of the tool call, or the variables `TRACEPARENT`, `TRACESTATE` and `BAGGAGE` of the CLI.
 * Without this, the async context of the test process can take the id to the handler. Then the
 * gate can pass with a broken carrier. The gate also sends a call on a broken copy of each entry,
 * and that call must fail.
 *
 * In CI, the report goes to the summary of the job.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import { appendFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import * as z from "zod";
import { context, propagation, ROOT_CONTEXT } from "@opentelemetry/api";
import { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { contextValue, defineContextKeys, withContext, withInternalCall } from "@mark1russell7/otel-ts/context";
import { startNodeTelemetry } from "@mark1russell7/otel-ts/node";
import { captureTelemetry } from "@mark1russell7/rigor-testkit/otel";
import { formatPropagationReport, propagationGate, type PropagationTransport } from "@mark1russell7/rigor-testkit/propagation";
import { ProcedureServer, createProcedure, createRegistry, defineModule, tracingInterceptor } from "@procedures/client";
import { HttpServerTransport } from "@procedures/client/node";
import { createMcpHost, type McpHost } from "@procedures/mcp-server";
import { cliServerConnection } from "./client-mode.js";

const KEY = "request.id";
const TOKEN = "gate-token";

/** The capture of rigor-testkit. The SDK of otel-ts exports to it, as in a service. */
const capture = captureTelemetry({ sdk: "external" });

/** The handler of the gate for the call in progress. The procedure `gate.run` starts it. */
let handler: (() => Promise<void>) | undefined;

const gateModule = defineModule("gate", [
  createProcedure()
    .path(["gate", "run"])
    .input(z.object({}))
    .output(z.number())
    .meta({ description: "One call of the propagation gate", effects: { reads: [], writes: [] } })
    .handler(async () => {
      if (handler === undefined) throw new Error("no call of the gate is in progress");
      await handler();
      return 1;
    })
    .build(),
]);

/** This function gives the trace context of the active context as a carrier, with the internal mark: then the baggage goes too. */
const activeCarrier = (): Record<string, string> => {
  const carrier: Record<string, string> = {};
  withInternalCall(() => propagation.inject(context.active(), carrier));
  return carrier;
};

/** This function runs `handler` for the time of `call`. */
const withHandler = async (run: () => Promise<void>, call: () => Promise<void>): Promise<void> => {
  handler = run;
  try {
    await call();
  } finally {
    handler = undefined;
  }
};

let telemetry: ReturnType<typeof startNodeTelemetry> | undefined;
const cleanups: Array<() => Promise<void> | void> = [];
let mcp: McpClient;
let endpoint: string;

beforeAll(async () => {
  defineContextKeys({ [KEY]: { cardinality: "high", propagate: "internal" } });
  telemetry = startNodeTelemetry({ enabled: true, stopOnSignals: false, env: {}, traceExporter: capture.spanExporter, logExporter: capture.logExporter, metricReaders: [capture.metricReader] });
  const interceptors = [tracingInterceptor({ onSpan: () => {} })];

  // The MCP face: an SDK face in this process is local, so its baggage comes in (C10)
  const [serverSide, clientSide] = InMemoryTransport.createLinkedPair();
  const host: McpHost = createMcpHost({ modules: [gateModule], faces: { sdk: serverSide }, interceptors });
  await host.start();
  mcp = new McpClient({ name: "propagation-gate", version: "0" });
  await mcp.connect(clientSide);
  cleanups.push(async () => {
    await mcp.close();
    await host.stop();
  });

  // The CLI server: a caller with its token is trusted, so its baggage comes in (C10)
  const app = express();
  const http = createServer(app);
  const server = new ProcedureServer({ registry: createRegistry(gateModule), token: TOKEN, interceptors });
  server.registerFromRegistry();
  server.addTransport(new HttpServerTransport(server, { app, httpServer: http }));
  await server.start();
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", () => resolve()));
  endpoint = `http://127.0.0.1:${(http.address() as AddressInfo).port}/api`;
  cleanups.push(async () => {
    await server.stop();
    http.closeAllConnections();
    await new Promise<void>((resolve) => http.close(() => resolve()));
  });
});

afterAll(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup();
  await telemetry?.shutdown();
});

/** The entry `mcp`: a tool call of an MCP client, with the trace context in its `_meta` */
const viaMcp: PropagationTransport = {
  name: "mcp",
  call: (run) =>
    withHandler(run, async () => {
      const _meta = activeCarrier();
      const result = await context.with(ROOT_CONTEXT, () => mcp.callTool({ name: "gate.run", arguments: {}, _meta }));
      if (result.isError === true) throw new Error(`the tool call of the gate failed: ${JSON.stringify(result.content)}`);
    }),
};

/** The variables of the environment carrier and their keys in the carrier of the propagator */
const ENV_KEYS = [
  ["TRACEPARENT", "traceparent"],
  ["TRACESTATE", "tracestate"],
  ["BAGGAGE", "baggage"],
] as const;

/** The entry `cli`: the call of `mark` to the CLI server, with the trace context in the environment */
const viaCli: PropagationTransport = {
  name: "cli",
  call: (run) =>
    withHandler(run, async () => {
      const carrier = activeCarrier();
      const saved = ENV_KEYS.map(([variable]) => [variable, process.env[variable]] as const);
      try {
        // A program that starts `mark` gives it the context in these variables
        for (const [variable, key] of ENV_KEYS) {
          if (carrier[key] === undefined) delete process.env[variable];
          else process.env[variable] = carrier[key];
        }
        const connection = await cliServerConnection({ endpoint, token: TOKEN }, ["gate", "run"]);
        if (connection === null) throw new Error("the CLI could not load its client");
        const result = await context.with(ROOT_CONTEXT, () => connection.call({}));
        if (!result.success) throw new Error(`the CLI call of the gate failed: ${result.error}`);
      } finally {
        for (const [variable, value] of saved) {
          if (value === undefined) delete process.env[variable];
          else process.env[variable] = value;
        }
      }
    }),
};

describe("the propagation gate on the entries of mark (C19)", () => {
  it("takes the context id from the MCP call and from the CLI call to the handler, and into each span, log record and metric", async () => {
    const report = await propagationGate({
      key: KEY,
      transports: [viaMcp, viaCli],
      capture,
      withValue: (key, value, fn) => withContext({ [key]: value }, fn),
      readValue: (key) => contextValue(key),
    });
    const text = formatPropagationReport(report);
    if (process.env["GITHUB_STEP_SUMMARY"]) appendFileSync(process.env["GITHUB_STEP_SUMMARY"], `${text}\n\n`);
    expect(text).not.toMatch(/\| fail \|/);
    expect(report.lines.map((line) => [line.transport, line.verdict, line.faults])).toEqual([
      ["mcp", "pass", []],
      ["cli", "pass", []],
    ]);
    expect(report.ok).toBe(true);
  });
});
