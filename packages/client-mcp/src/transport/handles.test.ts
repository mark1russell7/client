/**
 * The handle scope of each MCP session (d40-handles): a session keeps its own objects with a state,
 * and the end of the session or the stop of the transport closes them.
 */

import { describe, it, expect, afterEach } from "vitest";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import * as z from "zod";
import { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ProcedureServer, createRegistry, handleModule, handleScopeOf, type AnyProcedure, type HandleRef, type ProcedureContext } from "@procedures/client";
import { McpServerTransport } from "./mcp-transport.js";

let cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup().catch(() => {});
  cleanups = [];
});

/** An object with a state that records its close. */
interface Database {
  readonly name: string;
  closed: number;
}

function databaseProcedures(opened: Database[]): AnyProcedure[] {
  const open = {
    path: ["db", "open"],
    input: z.object({ name: z.string() }),
    output: z.object({ handle: z.string() }),
    metadata: { description: "open a database", effects: { reads: [], writes: ["handles"] } },
    handler: async (input: { name: string }, ctx: ProcedureContext) => {
      const db: Database = { name: input.name, closed: 0 };
      opened.push(db);
      return handleScopeOf(ctx).open("test.Database", db, { label: input.name, close: (value) => void (value.closed += 1) });
    },
  };
  const name = {
    path: ["db", "name"],
    input: z.object({ db: z.object({ handle: z.string() }) }),
    output: z.object({ name: z.string() }),
    metadata: { description: "the name of a database", effects: { reads: ["handles"], writes: [] } },
    handler: async (input: { db: HandleRef }, ctx: ProcedureContext) => ({ name: handleScopeOf(ctx).get<Database>(input.db, "test.Database").name }),
  };
  return [open, name] as unknown as AnyProcedure[];
}

async function start(opened: Database[], idleMs?: number): Promise<{ url: URL; mcp: McpServerTransport; server: ProcedureServer }> {
  const registry = createRegistry({ name: "db", procedures: databaseProcedures(opened), requires: [handleModule] });
  const server = new ProcedureServer({ registry, autoRegister: true });
  const mcp = new McpServerTransport(server, { registry, transport: "http", ...(idleMs !== undefined ? { handles: { idleMs } } : {}) });
  server.addTransport(mcp);
  await server.start();
  cleanups.push(() => server.stop());
  const listener = createServer((req, res) => {
    if (mcp.handleHttp(req, res)) return;
    res.statusCode = 404;
    res.end();
  });
  await new Promise<void>((resolve) => listener.listen(0, "127.0.0.1", resolve));
  cleanups.push(() => new Promise<void>((resolve) => {
    listener.close(() => resolve());
    listener.closeAllConnections();
  }));
  return { url: new URL(`http://127.0.0.1:${(listener.address() as AddressInfo).port}/mcp`), mcp, server };
}

async function connect(url: URL): Promise<{ client: McpClient; transport: StreamableHTTPClientTransport }> {
  const client = new McpClient({ name: "test", version: "0" });
  const transport = new StreamableHTTPClientTransport(url);
  await client.connect(transport as never);
  cleanups.push(() => client.close());
  return { client, transport };
}

/** This function calls a tool and gives the JSON of its first text, and its error flag. */
async function call(client: McpClient, name: string, args: Record<string, unknown>): Promise<{ isError: boolean; value: unknown }> {
  const result = (await client.callTool({ name, arguments: args })) as { isError?: boolean; content: Array<{ text: string }> };
  const text = result.content[0]?.text ?? "";
  let value: unknown = text;
  try {
    value = JSON.parse(text);
  } catch {
    // An error result has a text that is not JSON
  }
  return { isError: result.isError === true, value };
}

async function until(condition: () => boolean, timeoutMs = 5_000): Promise<void> {
  const end = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > end) throw new Error("the condition did not become true");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe("the handle scope of each MCP session (d40-handles)", () => {
  it("keeps the handles of two sessions apart", async () => {
    const opened: Database[] = [];
    const { url } = await start(opened);
    const one = await connect(url);
    const two = await connect(url);
    const tools = (await one.client.listTools()).tools.map((tool) => tool.name);
    expect(tools).toEqual(expect.arrayContaining(["db.open", "db.name", "handle.list", "handle.close"]));

    const ref = (await call(one.client, "db.open", { name: "orders" })).value as HandleRef;
    expect(ref.handle).toMatch(/^h_[0-9a-f]{32}$/);
    expect(await call(one.client, "db.name", { db: ref })).toEqual({ isError: false, value: { name: "orders" } });
    expect((await call(one.client, "handle.list", {})).value).toMatchObject({ count: 1, handles: [{ handle: ref.handle, kind: "test.Database", label: "orders" }] });

    // The other session cannot use the handle, and it sees no handle
    const refused = await call(two.client, "db.name", { db: ref });
    expect(refused.isError).toBe(true);
    expect(JSON.stringify(refused.value)).toContain("is not open for this caller");
    expect((await call(two.client, "handle.list", {})).value).toEqual({ handles: [], count: 0 });
    expect((await call(two.client, "handle.close", { handle: ref.handle })).value).toEqual({ closed: false });
    expect(opened[0]!.closed).toBe(0);

    expect((await call(one.client, "handle.close", { handle: ref.handle })).value).toEqual({ closed: true });
    expect(opened[0]!.closed).toBe(1);
  });

  it("closes the objects of a session at its end", async () => {
    const opened: Database[] = [];
    const { url } = await start(opened);
    const one = await connect(url);
    const two = await connect(url);
    await call(one.client, "db.open", { name: "a" });
    await call(one.client, "db.open", { name: "b" });
    await call(two.client, "db.open", { name: "c" });
    await one.transport.terminateSession();
    await until(() => opened[0]!.closed === 1 && opened[1]!.closed === 1);
    expect(opened[2]!.closed).toBe(0);
    expect((await call(two.client, "handle.list", {})).value).toMatchObject({ count: 1 });
  });

  it("closes the objects of each session at the stop of the transport", async () => {
    const opened: Database[] = [];
    const { url, server } = await start(opened);
    const one = await connect(url);
    const two = await connect(url);
    await call(one.client, "db.open", { name: "a" });
    await call(two.client, "db.open", { name: "b" });
    await server.stop();
    expect(opened.map((db) => db.closed)).toEqual([1, 1]);
  });

  it("applies the scope options of the transport: an idle object closes", async () => {
    const opened: Database[] = [];
    const { url } = await start(opened, 1);
    const one = await connect(url);
    await call(one.client, "db.open", { name: "a" });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect((await call(one.client, "handle.list", {})).value).toEqual({ handles: [], count: 0 });
    await until(() => opened[0]!.closed === 1);
  });
});
