/**
 * A stream that can run without an end on MCP (roadmap R15): the tool stops it at the stream
 * limits and gives the items that it has. Before, the call ended only at the time limit of the
 * tool call (10 minutes).
 */

import { describe, it, expect, afterEach } from "vitest";
import { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ProcedureRegistry, ProcedureServer, defineProcedure, outputSchema, ms } from "@procedures/client";
import { McpServerTransport } from "./mcp-transport.js";

let cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup().catch(() => {});
  cleanups = [];
});

/** A stream without an end: one tick each 5 ms. `stopped` is true when its reader stopped it. */
function ticker(unbounded: boolean, state: { stopped: boolean }) {
  return defineProcedure({
    path: ["test", unbounded ? "ticks" : "finite"],
    input: outputSchema<Record<string, unknown>>(),
    output: outputSchema<number>(),
    metadata: { description: unbounded ? "ticks" : "finite", stream: { unbounded } },
    handler: async function* () {
      try {
        for (let tick = 1; unbounded || tick <= 3; tick++) {
          await new Promise((resolve) => setTimeout(resolve, 5));
          yield tick;
        }
      } finally {
        state.stopped = true;
      }
    },
  });
}

async function start(registry: ProcedureRegistry, streamLimits: { items?: number; time?: ReturnType<typeof ms> }) {
  const server = new ProcedureServer({ registry, autoRegister: true });
  const [serverSide, clientSide] = InMemoryTransport.createLinkedPair();
  server.addTransport(new McpServerTransport(server, { registry, sdkTransport: serverSide, streamLimits }));
  await server.start();
  const client = new McpClient({ name: "test", version: "0" });
  await client.connect(clientSide);
  cleanups.push(async () => {
    await client.close();
    await server.stop();
  });
  return client;
}

type ToolResult = { content: Array<{ text: string }>; isError?: boolean };

describe("an unbounded stream on MCP (R15)", () => {
  it("stops at the item limit and says why", async () => {
    const state = { stopped: false };
    const registry = new ProcedureRegistry();
    registry.register(ticker(true, state));
    const client = await start(registry, { items: 3 });
    const { tools } = await client.listTools();
    const result = (await client.callTool({ name: tools[0]!.name, arguments: {} })) as ToolResult;
    expect(result.content.slice(0, 3).map((block) => block.text)).toEqual(["1", "2", "3"]);
    expect(result.content[3]!.text).toContain("stopped it after 3 items");
    expect(state.stopped).toBe(true);
  });

  it("stops at the time limit", async () => {
    const registry = new ProcedureRegistry();
    registry.register(ticker(true, { stopped: false }));
    const client = await start(registry, { items: 10_000, time: ms(60) });
    const { tools } = await client.listTools();
    const result = (await client.callTool({ name: tools[0]!.name, arguments: {} })) as ToolResult;
    expect(result.content[result.content.length - 1]!.text).toContain("stopped it after");
  });

  it("reads a finite stream to its end", async () => {
    const registry = new ProcedureRegistry();
    registry.register(ticker(false, { stopped: false }));
    const client = await start(registry, { items: 2 });
    const { tools } = await client.listTools();
    const result = (await client.callTool({ name: tools[0]!.name, arguments: {} })) as ToolResult;
    expect(result.content.map((block) => block.text)).toEqual(["1", "2", "3"]);
  });
});
