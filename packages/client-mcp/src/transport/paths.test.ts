/**
 * Procedure paths of each length on the MCP face (CLI-28). A path of one segment gets a tool name
 * and a method. Two procedures whose names collide after the join of the segments are both left
 * out, so a call never reaches the wrong procedure.
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { z } from "zod";
import { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createProcedure, defineModule } from "@procedures/client";
import { createMcpHost, type McpHostOptions } from "../host.js";

const PATHS: string[][] = [["morning"], ["notes", "list"], ["a", "b", "c", "d"], ["a_b", "c"], ["a", "b_c"]];

function testModule() {
  return defineModule(
    "paths-test",
    PATHS.map(
      (path) =>
        createProcedure()
          .path(path)
          .input(z.object({}).passthrough())
          .output(z.object({ path: z.array(z.string()) }))
          .meta({ description: path.join(" "), effects: { reads: [], writes: [] } })
          .handler(async (_input, ctx) => ({ path: [...ctx.path] }))
          .build(),
    ),
  );
}

let cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup();
  cleanups = [];
});

async function start(options: Partial<McpHostOptions> = {}) {
  const [serverSide, clientSide] = InMemoryTransport.createLinkedPair();
  const host = createMcpHost({ modules: [testModule()], faces: { sdk: serverSide }, ...options });
  await host.start();
  const client = new McpClient({ name: "test", version: "0" });
  await client.connect(clientSide);
  cleanups.push(async () => {
    await client.close();
    await host.stop();
  });
  return { client, host };
}

type ToolResult = { structuredContent?: Record<string, unknown>; isError?: boolean };

describe("paths of each length on the MCP face (CLI-28)", () => {
  it("gives a tool to a path of 1, 2 and 4 segments, and calls each one", async () => {
    const { client } = await start();
    // The registry of the host also has the core procedures (client.*)
    const names = (await client.listTools()).tools.map((tool) => tool.name);
    expect(names).toEqual(expect.arrayContaining(["a.b.c.d", "a.b_c", "a_b.c", "morning", "notes.list"]));
    for (const [name, path] of [["morning", ["morning"]], ["notes.list", ["notes", "list"]], ["a.b.c.d", ["a", "b", "c", "d"]]] as const) {
      const result = (await client.callTool({ name, arguments: {} })) as ToolResult;
      expect(result.structuredContent).toEqual({ path });
    }
  });

  it("leaves out the two tools whose names collide after the join, and says why", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    cleanups.push(() => errors.mockRestore());
    const { client, host } = await start({ toolName: (path) => path.join("_") });
    const names = (await client.listTools()).tools.map((tool) => tool.name);
    expect(names).toEqual(expect.arrayContaining(["a_b_c_d", "morning", "notes_list"]));
    expect(names).not.toContain("a_b_c");
    const hostNames = host.tools().map((tool) => tool.name);
    expect(hostNames).toEqual(expect.arrayContaining(["a_b_c_d", "morning", "notes_list"]));
    expect(hostNames).not.toContain("a_b_c");
    expect(errors.mock.calls.some(([message]) => String(message).includes('"a_b_c"') && String(message).includes("a_b.c") && String(message).includes("a.b_c"))).toBe(true);
    const missing = (await client.callTool({ name: "a_b_c", arguments: {} })) as ToolResult;
    expect(missing.isError).toBe(true);
    const one = (await client.callTool({ name: "morning", arguments: {} })) as ToolResult;
    expect(one.structuredContent).toEqual({ path: ["morning"] });
  });

  it("gives the collision to the logger of the server, with its context in the fields (CLI-87)", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    cleanups.push(() => errors.mockRestore());
    const lines: Array<{ level: string; message: string; fields: Readonly<Record<string, unknown>> }> = [];
    const logger = { log: (level: string, message: string, fields: Readonly<Record<string, unknown>>) => void lines.push({ level, message, fields }) };
    await start({ toolName: (path) => path.join("_"), serverOptions: { logger } });
    const collision = lines.find((line) => line.fields["tool"] === "a_b_c");
    expect(collision).toMatchObject({ level: "error", fields: { transport: "mcp", procedures: expect.arrayContaining(["a_b.c", "a.b_c"]) } });
    expect(errors).not.toHaveBeenCalled();
  });
});
