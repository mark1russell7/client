/**
 * The MCP part of the conformance suite of the server faces (roadmap R18; the other faces are in
 * `client/src/server/conformance.test.ts`): a value, a stream, a validation error, the deadline,
 * and the cancel of a tool call.
 */

import { describe, it, expect, afterEach } from "vitest";
import { z } from "zod";
import { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ProcedureServer, createProcedure, createRegistry, hostPolicy, procedureServerOptions, seconds } from "@procedures/client";
import { McpServerTransport } from "./mcp-transport.js";

interface Seen {
  deadlineLeft: number[];
  aborted: number;
}

function registryOf(seen: Seen) {
  const read = { reads: [], writes: [] };
  return createRegistry({
    name: "conformance",
    procedures: [
      createProcedure()
        .path(["conf", "echo"])
        .input(z.object({ text: z.string() }))
        .output(z.object({ text: z.string() }))
        .meta({ effects: read, description: "echo" })
        .handler(async (input, ctx) => {
          const deadline = ctx.capability?.deadline;
          if (deadline !== undefined) seen.deadlineLeft.push(deadline - Date.now());
          return { text: input.text };
        })
        .build(),
      createProcedure()
        .path(["conf", "count"])
        .input(z.object({ to: z.number() }))
        .output(z.number())
        .meta({ effects: read, description: "count" })
        .handler(async function* (input: { to: number }) {
          for (let n = 1; n <= input.to; n++) yield n;
        } as never)
        .build(),
      createProcedure()
        .path(["conf", "wait"])
        .input(z.object({}))
        .output(z.string())
        .meta({ effects: read, description: "wait" })
        .handler(async (_input, ctx) => {
          await new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, 5000);
            ctx.signal?.addEventListener("abort", () => {
              clearTimeout(timer);
              seen.aborted++;
              resolve();
            }, { once: true });
          });
          return "ended";
        })
        .build(),
    ],
  });
}

let cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup().catch(() => {});
  cleanups = [];
});

async function start(seen: Seen) {
  const registry = registryOf(seen);
  // The time limit of a tool call, as the dev-tools host sets it
  const server = new ProcedureServer(procedureServerOptions(hostPolicy({ timeout: seconds(3) }), registry));
  const [serverSide, clientSide] = InMemoryTransport.createLinkedPair();
  server.addTransport(new McpServerTransport(server, { registry, sdkTransport: serverSide }));
  await server.start();
  const client = new McpClient({ name: "test", version: "0" });
  await client.connect(clientSide);
  cleanups.push(async () => {
    await client.close();
    await server.stop();
  });
  const { tools } = await client.listTools();
  const name = (description: string): string => tools.find((tool) => tool.description === description)!.name;
  return { client, name };
}

type ToolResult = { content: Array<{ text: string }>; isError?: boolean };

describe("the conformance of MCP (R18)", () => {
  it("gives a value", async () => {
    const { client, name } = await start({ deadlineLeft: [], aborted: 0 });
    const result = (await client.callTool({ name: name("echo"), arguments: { text: "hi" } })) as ToolResult;
    expect(JSON.parse(result.content[0]!.text)).toEqual({ text: "hi" });
  });

  it("gives the items of a stream in order", async () => {
    const { client, name } = await start({ deadlineLeft: [], aborted: 0 });
    const result = (await client.callTool({ name: name("count"), arguments: { to: 3 } })) as ToolResult;
    expect(result.content.map((block) => block.text)).toEqual(["1", "2", "3"]);
  });

  it("gives an error for an input that is not valid", async () => {
    const { client, name } = await start({ deadlineLeft: [], aborted: 0 });
    const result = (await client.callTool({ name: name("echo"), arguments: { text: 5 } })) as ToolResult;
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toMatch(/validation|Invalid/i);
  });

  it("gives the time limit of the host to the handler as its deadline", async () => {
    const seen: Seen = { deadlineLeft: [], aborted: 0 };
    const { client, name } = await start(seen);
    await client.callTool({ name: name("echo"), arguments: { text: "x" } });
    expect(seen.deadlineLeft[0]).toBeGreaterThan(2000);
    expect(seen.deadlineLeft[0]).toBeLessThanOrEqual(3000);
  });

  it("aborts the handler when the caller cancels the tool call", async () => {
    const seen: Seen = { deadlineLeft: [], aborted: 0 };
    const { client, name } = await start(seen);
    const controller = new AbortController();
    const call = client.callTool({ name: name("wait"), arguments: {} }, undefined, { signal: controller.signal });
    setTimeout(() => controller.abort(), 50);
    await expect(call).rejects.toBeDefined();
    const until = Date.now() + 2000;
    while (seen.aborted === 0 && Date.now() < until) await new Promise((resolve) => setTimeout(resolve, 10));
    expect(seen.aborted).toBe(1);
  });
});
