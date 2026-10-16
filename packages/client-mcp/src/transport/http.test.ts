/**
 * The MCP transport over Streamable HTTP (roadmap R26), with the client of the MCP SDK: the tool
 * list, a tool call, the token, and the refusal of a web page of another origin.
 */

import { describe, it, expect, afterEach } from "vitest";
import { createServer } from "node:net";
import { z } from "zod";
import { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ProcedureServer, createProcedure, createRegistry } from "@procedures/client";
import { McpServerTransport } from "./mcp-transport.js";

async function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(typeof address === "object" && address ? address.port : 0));
    });
  });
}

let cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup().catch(() => {});
  cleanups = [];
});

async function start(token?: string): Promise<string> {
  const registry = createRegistry({
    name: "http",
    procedures: [
      createProcedure()
        .path(["demo", "echo"])
        .input(z.object({ text: z.string() }))
        .output(z.object({ text: z.string() }))
        .meta({ description: "echo", effects: { reads: [], writes: [] } })
        .handler(async (input) => ({ text: input.text }))
        .build(),
    ],
  });
  const server = new ProcedureServer({ registry, autoRegister: true });
  const port = await freePort();
  const mcp = new McpServerTransport(server, { registry, transport: "http", httpOptions: { port, ...(token ? { token } : {}) } });
  server.addTransport(mcp);
  await server.start();
  cleanups.push(() => server.stop());
  expect(mcp.getState()).toMatchObject({ transport: "http", url: `http://127.0.0.1:${port}/mcp` });
  return `http://127.0.0.1:${port}/mcp`;
}

async function connect(url: string, headers: Record<string, string> = {}): Promise<McpClient> {
  const client = new McpClient({ name: "test", version: "0" });
  // The SDK types do not agree with exactOptionalPropertyTypes
  await client.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers } }) as never);
  cleanups.push(() => client.close());
  return client;
}

describe("MCP over Streamable HTTP (R26)", () => {
  it("lists the tools and calls one", async () => {
    const client = await connect(await start());
    const { tools } = await client.listTools();
    const echo = tools.find((tool) => tool.description === "echo");
    expect(echo).toBeDefined();
    const result = (await client.callTool({ name: echo!.name, arguments: { text: "hi" } })) as { content: Array<{ text: string }> };
    expect(JSON.parse(result.content[0]!.text)).toEqual({ text: "hi" });
  });

  it("refuses a request without the token, and serves one with it", async () => {
    const url = await start("secret-token-0123");
    await expect(connect(url)).rejects.toThrow();
    const client = await connect(url, { Authorization: "Bearer secret-token-0123" });
    expect((await client.listTools()).tools.some((tool) => tool.description === "echo")).toBe(true);
  });

  it("refuses a web page of another origin", async () => {
    const url = await start();
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", origin: "https://evil.example" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    expect(response.status).toBe(403);
  });
});
