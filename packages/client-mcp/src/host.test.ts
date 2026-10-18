/**
 * The host factory (CLI-10): one `createMcpHost()` call builds what the dev-tools server, the
 * Graph host and `mcp.serve` built by hand. The tests use the in-memory transport of the SDK, and
 * the stdio face on streams of the test.
 */

import { describe, it, expect, afterEach } from "vitest";
import { PassThrough } from "node:stream";
import { z } from "zod";
import { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createProcedure, createRegistry, defineModule, type AnyProcedure, type Interceptor, type ProcedurePath } from "@procedures/client";
import { createMcpHost, type McpHost } from "./host.js";

const read = (path: string[], text: string): AnyProcedure =>
  createProcedure()
    .path(path)
    .input(z.object({}).passthrough())
    .output(z.object({ text: z.string() }))
    .meta({ description: `read ${text}`, effects: { reads: ["store"], writes: [] } })
    .handler(async () => ({ text }))
    .build() as AnyProcedure;

const write = (path: string[]): AnyProcedure =>
  createProcedure()
    .path(path)
    .input(z.object({}).passthrough())
    .output(z.object({ ok: z.boolean() }))
    .meta({ description: "write", effects: { reads: [], writes: ["store"] } })
    .handler(async () => ({ ok: true }))
    .build() as AnyProcedure;

/** A module like the one of Graph: graph.* procedures, and one procedure of another namespace. */
const graphModule = defineModule("graph-test", [
  read(["graph", "get"], "doc"),
  write(["graph", "set"]),
  read(["admin", "dump"], "secret"),
]);

let cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup().catch(() => {});
  cleanups = [];
});

async function connect(host: McpHost, clientSide: InMemoryTransport): Promise<McpClient> {
  await host.start();
  const client = new McpClient({ name: "test", version: "0" });
  await client.connect(clientSide);
  cleanups.push(async () => {
    await client.close();
    await host.stop();
  });
  return client;
}

describe("createMcpHost", () => {
  it("builds the Graph host in one call: a surface, read only, and the policy", async () => {
    const [serverSide, clientSide] = InMemoryTransport.createLinkedPair();
    // The whole Graph host (packages/mcp/src/host.ts of Graph) after CLI-10:
    const host = createMcpHost({
      registry: createRegistry(graphModule),
      surface: { namespaces: ["graph"] },
      readOnly: true,
      name: "graph",
      version: "0.1.0",
      faces: { sdk: serverSide },
    });
    const client = await connect(host, clientSide);

    expect(client.getServerVersion()).toMatchObject({ name: "graph", version: "0.1.0" });
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name)).toEqual(["graph.get"]);
    expect(host.tools().map((tool) => tool.name)).toEqual(["graph.get"]);
    expect(host.policy.strictCalls).toBe(true);
    const result = (await client.callTool({ name: "graph.get", arguments: {} })) as { content: Array<{ text: string }>; structuredContent?: unknown };
    expect(result.structuredContent).toEqual({ text: "doc" });
    // A tool outside the list does not answer, and the server refuses a write in read-only mode
    const refused = (await client.callTool({ name: "graph.set", arguments: {} })) as { isError?: boolean };
    expect(refused.isError).toBe(true);
    const direct = await host.server.handle({ id: "w", method: { service: "graph", operation: "set" }, payload: {}, metadata: {} });
    expect(direct.status.type).toBe("error");
  });

  it("serves a subset of tools by key, and the instructions of the server", async () => {
    const [serverSide, clientSide] = InMemoryTransport.createLinkedPair();
    const host = createMcpHost({
      modules: [graphModule],
      surface: ["graph.set", "admin.*"],
      exclude: ["admin.dump"],
      instructions: "Use graph.set to change a document.",
      faces: { sdk: serverSide },
    });
    const client = await connect(host, clientSide);
    expect((await client.listTools()).tools.map((tool) => tool.name)).toEqual(["graph.set"]);
    expect(client.getInstructions()).toBe("Use graph.set to change a document.");
  });

  it("gives the interceptors the registry and the expose rule of the host", async () => {
    let seen: { expose?: ((path: ProcedurePath) => boolean) | undefined; calls: number } = { calls: 0 };
    const counter: Interceptor = (_invocation, next) => {
      seen.calls++;
      return next();
    };
    const [serverSide, clientSide] = InMemoryTransport.createLinkedPair();
    const host = createMcpHost({
      modules: [graphModule],
      surface: { namespaces: ["graph"] },
      interceptors: ({ expose }) => {
        seen = { expose, calls: 0 };
        return [counter];
      },
      faces: { sdk: serverSide },
    });
    const client = await connect(host, clientSide);
    expect(seen.expose?.(["graph", "get"])).toBe(true);
    expect(seen.expose?.(["admin", "dump"])).toBe(false);
    await client.callTool({ name: "graph.get", arguments: {} });
    expect(seen.calls).toBe(1);
  });

  it("stops when the input of stdio ends", async () => {
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const lines: string[] = [];
    stdout.on("data", (chunk: Buffer) => lines.push(...chunk.toString("utf8").split("\n").filter(Boolean)));
    const host = createMcpHost({
      modules: [graphModule],
      surface: { namespaces: ["graph"] },
      faces: { stdio: { stdin, stdout, redirectConsole: false } },
    });
    await host.start();
    expect(host.state()).toMatchObject({ running: true, faces: [{ transport: "stdio", running: true }] });
    stdin.write(
      JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "0" } } }) + "\n",
    );
    await new Promise<void>((resolve) => {
      const wait = (): void => (lines.length > 0 ? resolve() : void setTimeout(wait, 5));
      wait();
    });
    expect(JSON.parse(lines[0]!)).toMatchObject({ id: 1, result: { serverInfo: { name: "procedure-server" } } });
    stdin.end();
    await host.closed;
    expect(host.state()).toMatchObject({ running: false, faces: [{ running: false }] });
    await expect(host.start()).rejects.toThrow("stops one time");
  });

  it("keeps running at the end of stdio without stopOnEnd", async () => {
    const stdin = new PassThrough();
    const host = createMcpHost({ modules: [graphModule], faces: { stdio: { stdin, stdout: new PassThrough(), stopOnEnd: false, redirectConsole: false } } });
    cleanups.push(() => host.stop());
    await host.start();
    stdin.end();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(host.state().running).toBe(true);
  });
});
