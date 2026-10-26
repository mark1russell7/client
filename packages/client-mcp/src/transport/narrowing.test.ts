/**
 * The narrowing key on the MCP face (CLI-30): the key `procedure-narrowing` of the `_meta` of a
 * tool call asks for a narrower capability, and so does the header of a call over Streamable HTTP.
 * The two sources combine: neither one replaces the other. A narrowed call cannot reach a tool
 * above the narrowing, and a source that asks for more has no effect.
 */

import { describe, it, expect, afterEach } from "vitest";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { z } from "zod";
import { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createProcedure, defineModule, ladder, NARROWING_HEADER, NARROWING_METADATA_KEY, type AnyProcedure } from "@procedures/client";
import { createMcpHost, type McpHost, type McpHostOptions } from "../host.js";

const AUDIENCES = ["public", "guest", "intimate"];

function testModule() {
  return defineModule("narrowing-test", [
    createProcedure()
      .path(["notes", "read"])
      .input(z.object({}).passthrough())
      .output(z.object({ clearance: z.unknown(), writes: z.unknown() }))
      .meta({ description: "notes read", effects: { reads: ["notes"], writes: [] } })
      .handler(async (_input, ctx) => ({ clearance: ctx.capability.clearance ?? null, writes: ctx.capability.effects?.writes ?? null }))
      .build(),
    createProcedure()
      .path(["notes", "write"])
      .input(z.object({}).passthrough())
      .output(z.object({ written: z.boolean() }))
      .meta({ description: "notes write", effects: { reads: [], writes: ["notes"] } })
      .handler(async () => ({ written: true }))
      .build(),
  ]);
}

let cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup().catch(() => {});
  cleanups = [];
});

/**
 * This function mounts the Streamable HTTP face of a host on a listener of the test, on a free port
 * of loopback, and gives the URL of the endpoint. The face has no listener of its own (CLI-11).
 */
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

async function start(policy: McpHostOptions["policy"] = {}): Promise<McpClient> {
  const [serverSide, clientSide] = InMemoryTransport.createLinkedPair();
  const host = createMcpHost({ modules: [testModule()], faces: { sdk: serverSide }, policy });
  await host.start();
  const client = new McpClient({ name: "test", version: "0" });
  await client.connect(clientSide);
  cleanups.push(async () => {
    await client.close();
    await host.stop();
  });
  return client;
}

type ToolResult = { structuredContent?: Record<string, unknown>; isError?: boolean; _meta?: { code?: unknown; reason?: unknown } };

async function call(client: McpClient, name: string, narrowing?: unknown): Promise<ToolResult> {
  const params = narrowing === undefined ? { name, arguments: {} } : { name, arguments: {}, _meta: { [NARROWING_METADATA_KEY]: narrowing } };
  return (await client.callTool(params)) as ToolResult;
}

describe("the narrowing key on the MCP face (CLI-30)", () => {
  it("a narrowed call cannot reach a tool above the narrowing", async () => {
    const client = await start();
    expect((await call(client, "notes.write")).structuredContent).toEqual({ written: true });
    const refused = await call(client, "notes.write", { effects: { writes: [] } });
    expect(refused.isError).toBe(true);
    expect(refused._meta).toMatchObject({ code: "FORBIDDEN", reason: "effects-exceeded" });
    expect((await call(client, "notes.read", { effects: { writes: [] } })).structuredContent).toEqual({ clearance: null, writes: [] });
  });

  it("combines the header of Streamable HTTP and the _meta key in each sequence, and refuses a header that is not valid", async () => {
    const host = createMcpHost({
      modules: [testModule()],
      faces: { http: {} },
      policy: { capability: { clearance: "intimate" }, clearanceOrder: ladder(AUDIENCES) },
    });
    await host.start();
    cleanups.push(() => host.stop());
    const url = await listenFor(host);
    const connect = async (header: unknown): Promise<McpClient> => {
      const client = new McpClient({ name: "test", version: "0" });
      // The SDK types do not agree with exactOptionalPropertyTypes
      await client.connect(new StreamableHTTPClientTransport(url, { requestInit: { headers: { [NARROWING_HEADER]: JSON.stringify(header) } } }) as never);
      cleanups.push(() => client.close());
      return client;
    };
    // A gateway narrows with the header, and the client asks for more in _meta
    const gateway = await connect({ clearance: "public" });
    expect((await call(gateway, "notes.read", { clearance: "intimate" })).structuredContent).toMatchObject({ clearance: "public" });
    // The reverse: the header asks for more, and the _meta key narrows
    const wide = await connect({ clearance: "intimate" });
    expect((await call(wide, "notes.read", { clearance: "public" })).structuredContent).toMatchObject({ clearance: "public" });
    // The effects of the header apply with the clearance of _meta
    const readOnly = await connect({ effects: { writes: [] } });
    expect((await call(readOnly, "notes.write", { clearance: "intimate", effects: { writes: "any" } }))._meta).toMatchObject({ code: "FORBIDDEN" });
    // A gateway header that is not valid refuses the call, also next to a valid _meta key
    const typo = await connect({ clearance: "pubic" });
    expect((await call(typo, "notes.read", { clearance: "public" }))._meta).toMatchObject({ code: "FORBIDDEN", reason: "clearance" });
    const time = await connect({ timeoutMs: "soon" });
    expect((await call(time, "notes.read"))._meta).toMatchObject({ code: "INVALID_REQUEST" });
    const field = await connect({ efects: { writes: [] } });
    expect((await call(field, "notes.write"))._meta).toMatchObject({ code: "INVALID_REQUEST" });
  });

  it("a key that tries to widen has no effect", async () => {
    const client = await start({ capability: { clearance: "guest", effects: { writes: [] } }, clearanceOrder: ladder(AUDIENCES) });
    const wider = { clearance: "intimate", effects: { writes: "any" } };
    expect((await call(client, "notes.read", wider)).structuredContent).toEqual({ clearance: "guest", writes: [] });
    expect((await call(client, "notes.write", wider))._meta).toMatchObject({ code: "FORBIDDEN" });
    expect((await call(client, "notes.read", { clearance: "public" })).structuredContent).toEqual({ clearance: "public", writes: [] });
  });
});
