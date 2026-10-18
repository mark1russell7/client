/**
 * The MCP face of a procedures host (CLI-7): the face mounts on a listener that another part owns,
 * next to other routes. The tools are the procedures that the policy exposes, and the face takes
 * the token of the policy.
 */

import { describe, it, expect, afterEach } from "vitest";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { z } from "zod";
import { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ProcedureServer, createProcedure, createRegistry, hostPolicy, procedureServerOptions } from "@procedures/client";
import { mcpFace } from "./face.js";

const READ = { reads: [], writes: [] };

let cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup().catch(() => {});
  cleanups = [];
});

/** A listener of the test: the face first, then a route of the app. It gives the base URL. */
async function listen(handler: (req: IncomingMessage, res: ServerResponse) => boolean): Promise<string> {
  const server: Server = createServer((req, res) => {
    if (handler(req, res)) return;
    res.statusCode = 200;
    res.end("the route of the app");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  cleanups.push(
    () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  );
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

async function connect(url: string, headers: Record<string, string> = {}): Promise<McpClient> {
  const client = new McpClient({ name: "test", version: "0" });
  // The SDK types do not agree with exactOptionalPropertyTypes
  await client.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers } }) as never);
  cleanups.push(() => client.close());
  return client;
}

describe("mcpFace (CLI-7)", () => {
  it("mounts on a listener of another part, takes the token of the policy, and serves the exposed tools", async () => {
    const registry = createRegistry({
      name: "face",
      procedures: [
        createProcedure().path(["demo", "echo"]).input(z.object({ text: z.string() })).output(z.string()).meta({ description: "echo", effects: READ }).handler(async (input) => input.text).build(),
        createProcedure().path(["demo", "hidden"]).input(z.object({})).output(z.string()).meta({ description: "hidden", effects: READ }).handler(async () => "no").build(),
      ],
    });
    const policy = hostPolicy({ token: "face-token-0123", expose: ["demo.echo"] });
    const server = new ProcedureServer(procedureServerOptions(policy, registry));
    const face = mcpFace({ serverInfo: { name: "face-test", version: "0.0.0" } })({ handler: server, registry, policy });
    expect(face.endpoint).toEqual({ type: "mcp", scheme: "http", path: "/mcp" });
    // Before its start, the face takes no request
    expect(face.handler({ url: "/mcp" } as never, {} as never)).toBe(false);
    await face.parts.start();
    cleanups.push(() => face.parts.close());
    const base = await listen(face.handler);

    // The other routes of the listener stay with the app
    expect(await (await fetch(`${base}/chat`)).text()).toBe("the route of the app");
    await expect(connect(`${base}/mcp`)).rejects.toThrow();
    const client = await connect(`${base}/mcp`, { Authorization: "Bearer face-token-0123" });
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.description)).toEqual(["echo"]);
    const result = (await client.callTool({ name: tools[0]!.name, arguments: { text: "hi" } })) as { content: Array<{ text: string }> };
    expect(JSON.parse(result.content[0]!.text)).toBe("hi");
  });
});
