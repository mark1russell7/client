/**
 * The trace context on the MCP face (roadmap item C10 of otel-ts): the keys `traceparent`,
 * `tracestate` and `baggage` of the `_meta` of a tool call go into the metadata of the call, and so
 * do the same headers of a call over Streamable HTTP. The engine makes the remote span the parent
 * of the call, and it uses the baggage only from a trusted caller (the tests of the engine are in
 * `@procedures/client`, `tracing/otel.client.test.ts`).
 */

import { describe, it, expect, afterEach } from "vitest";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import * as z from "zod";
import { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createProcedure, defineModule } from "@procedures/client";
import { createMcpHost, type McpHost } from "../host.js";

const TRACEPARENT = "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01";

/** A tool that gives the trace keys of the metadata of its call */
function testModule() {
  return defineModule("trace-test", [
    createProcedure()
      .path(["trace", "seen"])
      .input(z.object({}).passthrough())
      .output(z.object({ traceparent: z.unknown(), tracestate: z.unknown(), baggage: z.unknown() }))
      .meta({ description: "trace seen", effects: { reads: [], writes: [] } })
      .handler(async (_input, ctx) => ({
        traceparent: ctx.metadata["traceparent"] ?? null,
        tracestate: ctx.metadata["tracestate"] ?? null,
        baggage: ctx.metadata["baggage"] ?? null,
      }))
      .build(),
  ]);
}

let cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup().catch(() => {});
  cleanups = [];
});

async function listenFor(host: McpHost): Promise<URL> {
  const listener = createServer((req, res) => {
    if (host.handleHttp(req, res)) return;
    res.statusCode = 404;
    res.end();
  });
  await new Promise<void>((resolve) => listener.listen(0, "127.0.0.1", resolve));
  cleanups.push(
    () =>
      new Promise<void>((resolve) => {
        listener.close(() => resolve());
        listener.closeAllConnections();
      }),
  );
  return new URL(`http://127.0.0.1:${(listener.address() as AddressInfo).port}/mcp`);
}

type ToolResult = { structuredContent?: Record<string, unknown> };

describe("the trace context on the MCP face (C10)", () => {
  it("puts the trace keys of _meta into the metadata of the call", async () => {
    const [serverSide, clientSide] = InMemoryTransport.createLinkedPair();
    const host = createMcpHost({ modules: [testModule()], faces: { sdk: serverSide } });
    await host.start();
    const client = new McpClient({ name: "test", version: "0" });
    await client.connect(clientSide);
    cleanups.push(async () => {
      await client.close();
      await host.stop();
    });
    const meta = { traceparent: TRACEPARENT, tracestate: "vendor=1", baggage: "tenant=acme", other: "x" };
    const result = (await client.callTool({ name: "trace.seen", arguments: {}, _meta: meta })) as ToolResult;
    expect(result.structuredContent).toEqual({ traceparent: TRACEPARENT, tracestate: "vendor=1", baggage: "tenant=acme" });
    // A key that is not a string is not used
    const wrong = (await client.callTool({ name: "trace.seen", arguments: {}, _meta: { traceparent: 7 } })) as ToolResult;
    expect(wrong.structuredContent).toEqual({ traceparent: null, tracestate: null, baggage: null });
  });

  it("reads the headers of a call over Streamable HTTP, and _meta comes first", async () => {
    const host = createMcpHost({ modules: [testModule()], faces: { http: {} } });
    await host.start();
    cleanups.push(() => host.stop());
    const url = await listenFor(host);
    const client = new McpClient({ name: "test", version: "0" });
    const headers = { traceparent: TRACEPARENT, baggage: "tenant=header" };
    // The SDK types do not agree with exactOptionalPropertyTypes
    await client.connect(new StreamableHTTPClientTransport(url, { requestInit: { headers } }) as never);
    cleanups.push(() => client.close());
    const fromHeaders = (await client.callTool({ name: "trace.seen", arguments: {} })) as ToolResult;
    expect(fromHeaders.structuredContent).toEqual({ traceparent: TRACEPARENT, tracestate: null, baggage: "tenant=header" });
    const fromMeta = (await client.callTool({ name: "trace.seen", arguments: {}, _meta: { baggage: "tenant=meta" } })) as ToolResult;
    expect(fromMeta.structuredContent).toMatchObject({ baggage: "tenant=meta" });
  });
});
