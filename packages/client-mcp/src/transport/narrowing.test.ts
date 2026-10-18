/**
 * The narrowing key on the MCP face (CLI-30): the key `procedure-narrowing` of the `_meta` of a
 * tool call asks for a narrower capability. The server applies it, so a narrowed call cannot
 * reach a tool above the narrowing, and a key that asks for more has no effect.
 */

import { describe, it, expect, afterEach } from "vitest";
import { z } from "zod";
import { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createProcedure, defineModule, ladder, NARROWING_METADATA_KEY, type AnyProcedure } from "@procedures/client";
import { createMcpHost, type McpHostOptions } from "../host.js";

const AUDIENCES = ["public", "guest", "intimate"];

function testModule() {
  return defineModule("narrowing-test", [
    createProcedure()
      .path(["notes", "read"])
      .input(z.object({}).passthrough())
      .output(z.object({ clearance: z.unknown(), writes: z.unknown() }))
      .meta({ description: "notes read", effects: { reads: ["notes"], writes: [] } })
      .handler(async (_input, ctx) => ({ clearance: ctx.capability.clearance ?? null, writes: ctx.capability.effects?.writes ?? null }))
      .build() as AnyProcedure,
    createProcedure()
      .path(["notes", "write"])
      .input(z.object({}).passthrough())
      .output(z.object({ written: z.boolean() }))
      .meta({ description: "notes write", effects: { reads: [], writes: ["notes"] } })
      .handler(async () => ({ written: true }))
      .build() as AnyProcedure,
  ]);
}

let cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup().catch(() => {});
  cleanups = [];
});

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

  it("a key that tries to widen has no effect", async () => {
    const client = await start({ capability: { clearance: "guest", effects: { writes: [] } }, clearanceOrder: ladder(AUDIENCES) });
    const wider = { clearance: "intimate", effects: { writes: "any" } };
    expect((await call(client, "notes.read", wider)).structuredContent).toEqual({ clearance: "guest", writes: [] });
    expect((await call(client, "notes.write", wider))._meta).toMatchObject({ code: "FORBIDDEN" });
    expect((await call(client, "notes.read", { clearance: "public" })).structuredContent).toEqual({ clearance: "public", writes: [] });
  });
});
