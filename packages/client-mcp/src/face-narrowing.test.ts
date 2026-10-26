/**
 * The narrowing of the MCP face (CLI-43): `mcpFace({ narrowing })` gives each call of the face a
 * narrower capability, through the meet of the narrowing key (CLI-30). The read-only face lists and
 * runs only the tools that change nothing, as `mark mcp --read-only` does. A narrowing can only
 * narrow: it gets no more than the policy of the host gives.
 */

import { describe, it, expect, afterEach } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { z } from "zod";
import { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { CallToolResultSchema, CreateTaskResultSchema } from "@modelcontextprotocol/sdk/types.js";
import {
  NARROWING_METADATA_KEY,
  ProcedureServer,
  createProcedure,
  createRegistry,
  hostPolicy,
  ladder,
  procedureServerOptions,
  type Credentials,
  type HostPolicyOptions,
  type ProcedureRegistry,
  type ServerRequest,
} from "@procedures/client";
import { mcpFace, type McpFaceOptions } from "./face.js";
import { createMcpHost } from "./host.js";

const TOKEN = "face-narrowing-token";
const AUDIENCES = ["public", "guest", "intimate"];
const READ_ONLY = { effects: { writes: [] } };

/** The procedures of the test: a read, a write and a procedure that declares no effects. */
function testRegistry(): ProcedureRegistry {
  const capabilityOutput = z.object({ clearance: z.unknown(), writes: z.unknown(), deadline: z.boolean() });
  return createRegistry({
    name: "face-narrowing",
    procedures: [
      createProcedure()
        .path(["notes", "read"])
        .input(z.object({}).passthrough())
        .output(capabilityOutput)
        .meta({ description: "notes read", effects: { reads: ["notes"], writes: [] } })
        .handler(async (_input, ctx) => ({
          clearance: ctx.capability.clearance ?? null,
          writes: ctx.capability.effects?.writes ?? null,
          deadline: ctx.capability.deadline !== undefined,
        }))
        .build(),
      createProcedure()
        .path(["notes", "write"])
        .input(z.object({}).passthrough())
        .output(z.object({ written: z.boolean() }))
        .meta({ description: "notes write", effects: { reads: [], writes: ["notes"] } })
        .handler(async () => ({ written: true }))
        .build(),
      createProcedure()
        .path(["notes", "undeclared"])
        .input(z.object({}).passthrough())
        .output(z.object({ ran: z.boolean() }))
        .meta({ description: "notes undeclared" })
        .handler(async () => ({ ran: true }))
        .build(),
    ],
  });
}

let cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup().catch(() => {});
  cleanups = [];
});

interface Started {
  readonly client: McpClient;
  /** The requests that reached the handler of the host, after the face. */
  readonly requests: ServerRequest[];
}

/** This function starts a face on a listener of the test, with a server of the policy, and connects a client. */
async function start(faceOptions: McpFaceOptions, policyOptions: HostPolicyOptions = {}): Promise<Started> {
  const registry = testRegistry();
  // The tools of the test are the notes: the server also pins its own procedures in the registry
  const policy = hostPolicy({ token: TOKEN, expose: ["notes.*"], ...policyOptions });
  const server = new ProcedureServer(procedureServerOptions(policy, registry));
  const requests: ServerRequest[] = [];
  const handler = {
    handle: (request: ServerRequest) => {
      requests.push(request);
      return server.handle(request);
    },
    // The one admission of each HTTP request (CLI-2b)
    admission: (credentials: Credentials) => server.admission(credentials),
  };
  const face = mcpFace({ serverInfo: { name: "face-narrowing", version: "0.0.0" }, ...faceOptions })({ handler, registry, policy });
  await face.parts.start();
  cleanups.push(() => face.parts.close());
  const listener: Server = createServer((req, res) => {
    if (face.handler(req, res)) return;
    res.statusCode = 404;
    res.end();
  });
  await new Promise<void>((resolve) => listener.listen(0, "127.0.0.1", () => resolve()));
  cleanups.push(
    () =>
      new Promise<void>((resolve) => {
        listener.close(() => resolve());
        listener.closeAllConnections();
      }),
  );
  const url = new URL(`http://127.0.0.1:${(listener.address() as AddressInfo).port}/mcp`);
  const client = new McpClient({ name: "test", version: "0" });
  // The SDK types do not agree with exactOptionalPropertyTypes
  await client.connect(new StreamableHTTPClientTransport(url, { requestInit: { headers: { Authorization: `Bearer ${TOKEN}` } } }) as never);
  cleanups.push(() => client.close());
  return { client, requests };
}

type ToolResult = { structuredContent?: Record<string, unknown>; isError?: boolean; content?: Array<{ text?: string }>; _meta?: { code?: unknown; reason?: unknown } };

async function call(client: McpClient, name: string, narrowing?: unknown): Promise<ToolResult> {
  const params = narrowing === undefined ? { name, arguments: {} } : { name, arguments: {}, _meta: { [NARROWING_METADATA_KEY]: narrowing } };
  return (await client.callTool(params)) as ToolResult;
}

async function toolNames(client: McpClient): Promise<string[]> {
  return (await client.listTools()).tools.map((tool) => tool.name).sort();
}

describe("mcpFace({ narrowing }) (CLI-43)", () => {
  it("a read-only face lists and runs only the tools that change nothing, as mark mcp --read-only", async () => {
    const { client, requests } = await start({ narrowing: READ_ONLY });
    // The same tools as the read-only stdio host (`mark mcp --read-only`)
    const stdio = createMcpHost({ registry: testRegistry(), surface: ["notes.*"], readOnly: true, faces: {} });
    expect(await toolNames(client)).toEqual(stdio.tools().map((tool) => tool.name).sort());
    expect(await toolNames(client)).toEqual(["notes.read"]);

    // Each call has the read-only capability
    expect((await call(client, "notes.read")).structuredContent).toEqual({ clearance: null, writes: [], deadline: false });
    // A write tool is refused
    const refused = await call(client, "notes.write");
    expect(refused.isError).toBe(true);
    expect(refused.content?.[0]?.text).toContain("Tool not found");
    expect((await call(client, "notes.undeclared")).isError).toBe(true);
    // The refused calls do not reach the server, and the call that does carries the narrowing as a source of the key
    expect(requests.map((request) => request.metadata[NARROWING_METADATA_KEY])).toEqual([[READ_ONLY]]);
  });

  it("a key of the caller cannot widen the narrowing of the face, and a narrower key applies", async () => {
    const { client } = await start({ narrowing: { clearance: "guest", effects: { writes: [] } } }, { clearanceOrder: ladder(AUDIENCES) });
    const wider = await call(client, "notes.read", { clearance: "intimate", effects: { writes: "any" } });
    expect(wider.structuredContent).toEqual({ clearance: "guest", writes: [], deadline: false });
    const narrower = await call(client, "notes.read", { clearance: "public" });
    expect(narrower.structuredContent).toEqual({ clearance: "public", writes: [], deadline: false });
  });

  it("a narrowing that asks for more than the policy of the host gets no more", async () => {
    const policy: HostPolicyOptions = { readOnly: true, capability: { clearance: "guest" }, clearanceOrder: ladder(AUDIENCES) };
    const { client } = await start({ narrowing: { clearance: "intimate", effects: { reads: "any", writes: "any" } } }, policy);
    // The face lists no tool that the policy refuses
    expect(await toolNames(client)).toEqual(["notes.read"]);
    expect((await call(client, "notes.read")).structuredContent).toEqual({ clearance: "guest", writes: [], deadline: false });

    // A narrowing that permits one write lists that tool, and a key of the caller still narrows the call
    const open = await start({ narrowing: { effects: { writes: ["notes"] } } });
    expect(await toolNames(open.client)).toEqual(["notes.read", "notes.write"]);
    expect((await call(open.client, "notes.write")).structuredContent).toEqual({ written: true });
    expect((await call(open.client, "notes.write", READ_ONLY))._meta).toMatchObject({ code: "FORBIDDEN", reason: "effects-exceeded" });
  });

  it("a time of the narrowing limits each call, not the tools", async () => {
    const { client } = await start({ narrowing: [READ_ONLY, { timeoutMs: 60_000 }] });
    expect(await toolNames(client)).toEqual(["notes.read"]);
    expect((await call(client, "notes.read")).structuredContent).toEqual({ clearance: null, writes: [], deadline: true });
  });

  it("narrows a call that runs as an MCP task too (CLI-35)", async () => {
    const registry = createRegistry({
      name: "face-narrowing-task",
      procedures: [
        createProcedure()
          .path(["notes", "scan"])
          .input(z.object({}).passthrough())
          .output(z.object({ writes: z.unknown() }))
          .meta({ description: "notes scan", effects: { reads: ["notes"], writes: [] }, taskSupport: "optional" })
          .handler(async (_input, ctx) => ({ writes: ctx.capability.effects?.writes ?? null }))
          .build(),
      ],
    });
    const policy = hostPolicy({ token: TOKEN, expose: ["notes.*"] });
    const server = new ProcedureServer(procedureServerOptions(policy, registry));
    const requests: ServerRequest[] = [];
    const handler = {
      handle: (request: ServerRequest) => {
        requests.push(request);
        return server.handle(request);
      },
      // The one admission of each HTTP request (CLI-2b)
      admission: (credentials: Credentials) => server.admission(credentials),
    };
    const face = mcpFace({ serverInfo: { name: "face-narrowing", version: "0.0.0" }, narrowing: READ_ONLY, tasks: {} })({ handler, registry, policy });
    await face.parts.start();
    cleanups.push(() => face.parts.close());
    const listener: Server = createServer((req, res) => {
      if (face.handler(req, res)) return;
      res.statusCode = 404;
      res.end();
    });
    await new Promise<void>((resolve) => listener.listen(0, "127.0.0.1", () => resolve()));
    cleanups.push(
      () =>
        new Promise<void>((resolve) => {
          listener.close(() => resolve());
          listener.closeAllConnections();
        }),
    );
    const url = new URL(`http://127.0.0.1:${(listener.address() as AddressInfo).port}/mcp`);
    const client = new McpClient({ name: "test", version: "0" });
    await client.connect(new StreamableHTTPClientTransport(url, { requestInit: { headers: { Authorization: `Bearer ${TOKEN}` } } }) as never);
    cleanups.push(() => client.close());

    const created = await client.request({ method: "tools/call", params: { name: "notes.scan", arguments: {}, task: {} } }, CreateTaskResultSchema);
    let task = created.task;
    for (let tries = 0; tries < 300 && task.status === "working"; tries++) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      task = await client.experimental.tasks.getTask(created.task.taskId);
    }
    expect(task.status).toBe("completed");
    const result = await client.experimental.tasks.getTaskResult(created.task.taskId, CallToolResultSchema);
    // The call of the task has the read-only capability of the face
    expect(result.structuredContent).toEqual({ writes: [] });
    expect(requests.map((request) => request.metadata[NARROWING_METADATA_KEY])).toEqual([[READ_ONLY]]);
  });

  it("refuses a narrowing that is not valid when the host makes the face", () => {
    const registry = testRegistry();
    const policy = hostPolicy({ clearanceOrder: ladder(AUDIENCES) });
    const server = new ProcedureServer(procedureServerOptions(policy, registry));
    const make = (narrowing: unknown) => () => mcpFace({ narrowing: narrowing as McpFaceOptions["narrowing"] })({ handler: server, registry, policy });
    expect(make({ clearance: "pubic" })).toThrow(/narrowing of the MCP face is not valid/);
    expect(make({ efects: { writes: [] } })).toThrow(/unknown field/);
    expect(make({ timeoutMs: "soon" })).toThrow(/not a number/);
    expect(make({ effects: { writes: "none" } })).toThrow(/not valid/);
    expect(make(READ_ONLY)).not.toThrow();
  });
});
