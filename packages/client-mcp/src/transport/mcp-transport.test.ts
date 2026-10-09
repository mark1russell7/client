/**
 * The MCP transport over the SDK's in-memory transport: a 3-segment tool answers (deep dive
 * architecture review 3.3), and a change of the registry sends notifications/tools/list_changed
 * (deep dive roadmap 0.4).
 */

import { describe, it, expect, afterEach } from "vitest";
import { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ToolListChangedNotificationSchema } from "@modelcontextprotocol/sdk/types.js";
import { ProcedureRegistry, ProcedureServer, defineProcedure, outputSchema } from "@mark1russell7/client";
import { McpServerTransport } from "./mcp-transport.js";

function echo(path: string[], tag: string) {
  return defineProcedure({
    path,
    input: outputSchema<Record<string, unknown>>(),
    output: outputSchema<unknown>(),
    metadata: { description: `echo ${tag}` },
    handler: (input: unknown) => ({ tag, input }),
  });
}

let cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup().catch(() => {});
  cleanups = [];
});

async function start(registry: ProcedureRegistry): Promise<{ client: McpClient; changes: () => number }> {
  const server = new ProcedureServer({ registry, autoRegister: true });
  const [serverSide, clientSide] = InMemoryTransport.createLinkedPair();
  const transport = new McpServerTransport(server, { registry, sdkTransport: serverSide });
  server.addTransport(transport);
  await server.start();
  const client = new McpClient({ name: "test", version: "0" });
  let changes = 0;
  client.setNotificationHandler(ToolListChangedNotificationSchema, async () => {
    changes++;
  });
  await client.connect(clientSide);
  cleanups.push(async () => {
    await client.close();
    await server.stop();
  });
  return { client, changes: () => changes };
}

async function waitFor(check: () => boolean, ms = 2000): Promise<void> {
  const until = Date.now() + ms;
  while (!check()) {
    if (Date.now() > until) throw new Error("timed out");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe("McpServerTransport", () => {
  it("calls a tool of a 3-segment procedure", async () => {
    const registry = new ProcedureRegistry();
    registry.register(echo(["conf", "nested", "echo"], "v1"));
    const { client } = await start(registry);
    const { tools } = await client.listTools();
    const name = tools.find((tool) => tool.description === "echo v1")?.name;
    expect(name).toBeDefined();
    const result = (await client.callTool({ name: name!, arguments: { n: 1 } })) as { content: Array<{ text: string }>; isError?: boolean };
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content[0]!.text)).toEqual({ tag: "v1", input: { n: 1 } });
  });

  it("sends list_changed once for a burst of registrations, and lists the new tools", async () => {
    const registry = new ProcedureRegistry();
    registry.register(echo(["conf", "first"], "first"));
    const { client, changes } = await start(registry);
    expect((await client.listTools()).tools).toHaveLength(1);

    registry.register(echo(["conf", "second"], "second"));
    registry.register(echo(["conf", "third"], "third"));
    await waitFor(() => changes() === 1);
    expect((await client.listTools()).tools).toHaveLength(3);

    registry.unregister(["conf", "second"]);
    await waitFor(() => changes() === 2);
    expect((await client.listTools()).tools).toHaveLength(2);
  });

  it("serves a tool that was registered after the start", async () => {
    const registry = new ProcedureRegistry();
    const { client, changes } = await start(registry);
    registry.register(echo(["conf", "late"], "late"));
    await waitFor(() => changes() === 1);
    const name = (await client.listTools()).tools[0]!.name;
    const result = (await client.callTool({ name, arguments: {} })) as { content: Array<{ text: string }>; isError?: boolean };
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content[0]!.text)).toEqual({ tag: "late", input: {} });
  });
});
