/**
 * The MCP faces run the transport contract (roadmap R18, CLI-85): the cases of
 * `@procedures/client/testing` go through an MCP client over an in-memory pair
 * (a local face, as stdio) and over Streamable HTTP (a network face, with the token and the size
 * limit of a request). The other faces run the suite in `client` and in `client-server`.
 *
 * An MCP tool call is one result: a stream comes back as one result with a text block for each
 * item, so the caller cannot stop a stream. MCP carries no deadline of the caller and no metadata
 * of an error. The capabilities of the faces declare these skips.
 */

import { describe, it, expect, afterEach } from "vitest";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { z } from "zod";
import { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ProcedureServer, createProcedure, createRegistry, hostPolicy, procedureServerOptions, seconds } from "@procedures/client";
import { McpServerTransport } from "./mcp-transport.js";
import {
  mcpCaller,
  describeTransportContract,
  type ContractCapabilities,
  type ContractFace,
  type ContractSpec,
} from "@procedures/client/testing";

/** The server of the options of the spec. */
function serverOf(spec: ContractSpec): ProcedureServer {
  return new ProcedureServer({
    registry: spec.registry,
    autoRegister: true,
    collections: spec.collections,
    events: spec.events,
    ...(spec.token !== undefined && { token: spec.token }),
    ...(spec.principalOf !== undefined && { principalOf: spec.principalOf }),
    ...(spec.errors !== undefined && { errors: spec.errors }),
    ...(spec.onError !== undefined && { onError: spec.onError }),
  });
}

/** MCP has no subscription, no cancel of a stream, no deadline of the caller and no error metadata. */
const MCP_FACE: ContractCapabilities = { server: true, auth: false, subscriptions: false, streams: "collected", deadline: false, errorMetadata: false, retryable: true };

const faces: ContractFace[] = [
  {
    name: "MCP over an in-memory pair",
    // A local face, as stdio: it presents no network credentials and has no limit of a request
    capabilities: MCP_FACE,
    async start(spec) {
      const server = serverOf(spec);
      const faces: McpServerTransport[] = [];
      await server.start();
      return {
        async connect() {
          const [serverSide, clientSide] = InMemoryTransport.createLinkedPair();
          const mcp = new McpServerTransport(server, { registry: spec.registry, sdkTransport: serverSide });
          faces.push(mcp);
          await mcp.start();
          return mcpCaller(async () => {
            const client = new McpClient({ name: "contract", version: "0" });
            await client.connect(clientSide);
            return client;
          });
        },
        async stop() {
          for (const face of faces) await face.stop().catch(() => undefined);
          await server.stop();
        },
      };
    },
  },
  {
    name: "MCP over Streamable HTTP",
    capabilities: { ...MCP_FACE, auth: true, sizeLimit: { code: "PAYLOAD_TOO_LARGE" } },
    async start(spec) {
      const server = serverOf(spec);
      const mcp = new McpServerTransport(server, {
        registry: spec.registry,
        transport: "http",
        ...(spec.sizeLimit !== undefined && { httpOptions: { maxBodyBytes: spec.sizeLimit } }),
      });
      server.addTransport(mcp);
      await server.start();
      const listener = createServer((req, res) => {
        if (mcp.handleHttp(req, res)) return;
        res.statusCode = 404;
        res.end();
      });
      await new Promise<void>((resolve) => listener.listen(0, "127.0.0.1", resolve));
      const url = new URL(`http://127.0.0.1:${(listener.address() as AddressInfo).port}/mcp`);
      return {
        connect: async (bearer) =>
          mcpCaller(async () => {
            const client = new McpClient({ name: "contract", version: "0" });
            await client.connect(new StreamableHTTPClientTransport(url, { requestInit: { headers: bearer === undefined ? {} : { authorization: `Bearer ${bearer}` } } }) as never);
            return client;
          }),
        async stop() {
          await server.stop();
          listener.closeAllConnections();
          await new Promise<void>((resolve) => listener.close(() => resolve()));
        },
      };
    },
  },
];

for (const face of faces) describeTransportContract(face, { describe, it, afterEach, expect });

let cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup().catch(() => {});
  cleanups = [];
});

describe("the time limit of an MCP host (R18)", () => {
  it("gives the time limit of the host to the handler as its deadline", async () => {
    const deadlineLeft: number[] = [];
    const registry = createRegistry({
      name: "conformance",
      procedures: [
        createProcedure()
          .path(["conf", "echo"])
          .input(z.object({ text: z.string() }))
          .output(z.object({ text: z.string() }))
          .meta({ effects: { reads: [], writes: [] }, description: "echo" })
          .handler(async (input, ctx) => {
            const deadline = ctx.capability?.deadline;
            if (deadline !== undefined) deadlineLeft.push(deadline - Date.now());
            return { text: input.text };
          })
          .build(),
      ],
    });
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
    await client.callTool({ name: tools.find((tool) => tool.description === "echo")!.name, arguments: { text: "x" } });
    expect(deadlineLeft[0]).toBeGreaterThan(2000);
    expect(deadlineLeft[0]).toBeLessThanOrEqual(3000);
  });
});
