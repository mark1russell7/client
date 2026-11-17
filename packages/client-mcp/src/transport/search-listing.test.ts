/**
 * The search listing of the MCP transport (direction 40, the tool surface): the list gives three
 * tools, and the model finds, reads and calls each other tool through them.
 */

import { afterEach, describe, expect, it } from "vitest";
import { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ToolListChangedNotificationSchema, type CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { ProcedureRegistry, ProcedureServer, defineProcedure, outputSchema } from "@procedures/client";
import type { McpToolFilter } from "@procedures/mcp";
import { McpServerTransport } from "./mcp-transport.js";
import { SEARCH_LISTING_NAMES, SEARCH_LISTING_TOOLS } from "./search-listing.js";

function tool(path: string[], description: string) {
  return defineProcedure({
    path,
    input: outputSchema<Record<string, unknown>>(),
    output: outputSchema<unknown>(),
    metadata: { description },
    handler: (input: unknown) => ({ called: path.join("."), input }),
  });
}

function catalog(): ProcedureRegistry {
  const registry = new ProcedureRegistry();
  registry.register(tool(["statistics", "median"], "The median of the values"));
  registry.register(tool(["statistics", "wilson"], "The Wilson interval of a proportion"));
  registry.register(tool(["git", "status"], "The status of the working tree"));
  registry.register(tool(["admin", "reset"], "Reset the state of the server"));
  return registry;
}

let cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup().catch(() => {});
  cleanups = [];
});

async function start(registry: ProcedureRegistry, toolFilter?: McpToolFilter): Promise<{ client: McpClient; changes: () => number }> {
  const server = new ProcedureServer({ registry, autoRegister: true });
  const [serverSide, clientSide] = InMemoryTransport.createLinkedPair();
  const transport = new McpServerTransport(server, { registry, sdkTransport: serverSide, listing: "search", json: "compact", ...(toolFilter ? { toolFilter } : {}) });
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

const call = async (client: McpClient, name: string, args: Record<string, unknown>): Promise<CallToolResult> =>
  (await client.callTool({ name, arguments: args })) as CallToolResult;

const hitNames = (result: CallToolResult): string[] => (result.structuredContent as { hits: { name: string }[] }).hits.map((hit) => hit.name);

describe("the search listing", () => {
  it("lists the three search tools, not each tool", async () => {
    const { client } = await start(catalog());
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual(["search_tools", "describe_tool", "call_tool"]);
    expect(tools.find((t) => t.name === "search_tools")!.annotations).toMatchObject({ readOnlyHint: true });
    expect(tools.find((t) => t.name === "call_tool")!.annotations).toBeUndefined();
  });

  it("keeps the list small: the three tools are less than 2 KB of JSON", () => {
    // The list of each tool costs about 386 tokens for each tool (the spike of 11-16). This list costs the same for any number of tools.
    expect(JSON.stringify(SEARCH_LISTING_TOOLS).length).toBeLessThan(2048);
  });

  it("finds a tool by words, the best match first", async () => {
    const { client } = await start(catalog());
    const result = await call(client, SEARCH_LISTING_NAMES.search, { query: "wilson interval" });
    expect(result.isError).toBeFalsy();
    expect(hitNames(result)[0]).toBe("statistics.wilson");
    expect(result.structuredContent).toMatchObject({ matched: 1, total: 4 });
    expect(JSON.parse((result.content[0] as { text: string }).text)).toEqual(result.structuredContent);
    expect(hitNames(await call(client, SEARCH_LISTING_NAMES.search, { query: "statistics", limit: 1 }))).toHaveLength(1);
  });

  it("describes a tool with its input schema", async () => {
    const { client } = await start(catalog());
    const result = await call(client, SEARCH_LISTING_NAMES.describe, { name: "git.status" });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({ name: "git.status", description: "The status of the working tree" });
    expect(result.structuredContent!["inputSchema"]).toMatchObject({ type: "object" });
    // Without a task store, the definition does not say that the tool runs as a task
    expect(result.structuredContent!["execution"]).toBeUndefined();
  });

  it("calls a tool by its name with its input, as a direct call does", async () => {
    const { client } = await start(catalog());
    const through = await call(client, SEARCH_LISTING_NAMES.call, { name: "statistics.median", input: { values: [1, 2, 3] } });
    const direct = await call(client, "statistics.median", { values: [1, 2, 3] });
    expect(through.isError).toBeFalsy();
    expect(through.content).toEqual(direct.content);
    expect(JSON.parse((through.content[0] as { text: string }).text)).toEqual({ called: "statistics.median", input: { values: [1, 2, 3] } });
    // A call with no input gives the tool an empty input
    expect((await call(client, SEARCH_LISTING_NAMES.call, { name: "git.status" })).isError).toBeFalsy();
  });

  it("refuses an input that is not correct, with the reason", async () => {
    const { client } = await start(catalog());
    const refusals: Array<[string, Record<string, unknown>, string]> = [
      [SEARCH_LISTING_NAMES.search, {}, "INVALID_INPUT"],
      [SEARCH_LISTING_NAMES.search, { query: "  " }, "INVALID_INPUT"],
      [SEARCH_LISTING_NAMES.search, { query: "median", limit: 0 }, "INVALID_INPUT"],
      [SEARCH_LISTING_NAMES.search, { query: "median", limit: 1.5 }, "INVALID_INPUT"],
      [SEARCH_LISTING_NAMES.describe, {}, "INVALID_INPUT"],
      [SEARCH_LISTING_NAMES.describe, { name: "no.such" }, "NOT_FOUND"],
      [SEARCH_LISTING_NAMES.call, { name: "no.such" }, "NOT_FOUND"],
      [SEARCH_LISTING_NAMES.call, { name: "git.status", input: [1] }, "INVALID_INPUT"],
      ["no.such", {}, "NOT_FOUND"],
    ];
    for (const [name, args, code] of refusals) {
      const result = await call(client, name, args);
      expect(result.isError, `${name} ${JSON.stringify(args)}`).toBe(true);
      expect(result._meta, `${name} ${JSON.stringify(args)}`).toMatchObject({ code });
    }
  });

  it("finds and calls only the tools that the server exposes", async () => {
    const { client } = await start(catalog(), { include: (path) => path[0] !== "admin" });
    const search = await call(client, SEARCH_LISTING_NAMES.search, { query: "reset state server" });
    expect(hitNames(search)).not.toContain("admin.reset");
    expect(search.structuredContent).toMatchObject({ total: 3 });
    expect((await call(client, SEARCH_LISTING_NAMES.describe, { name: "admin.reset" }))._meta).toMatchObject({ code: "NOT_FOUND" });
    expect((await call(client, SEARCH_LISTING_NAMES.call, { name: "admin.reset" }))._meta).toMatchObject({ code: "NOT_FOUND" });
  });

  it("finds a new tool at once, and sends no list_changed: the list stays the same", async () => {
    const registry = catalog();
    const { client, changes } = await start(registry);
    registry.register(tool(["weather", "forecast"], "The forecast of a place"));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(hitNames(await call(client, SEARCH_LISTING_NAMES.search, { query: "forecast" }))).toEqual(["weather.forecast"]);
    expect(changes()).toBe(0);
  });
});
