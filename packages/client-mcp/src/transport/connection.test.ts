/**
 * The connection of a request of MCP over Streamable HTTP (CLI-71). The credentials of each HTTP
 * request have the addresses and the ports of its socket, as frozen data. The remote port is the
 * local port of the socket of the client.
 *
 * - With a `ProcedureServer`, the one admission of each HTTP request (CLI-2b) gives the connection
 *   to the request hook. A tool call gets the principal of that admission.
 * - With a handler without `admission()`, each tool call has the credentials of its HTTP request,
 *   with the connection.
 */

import { describe, it, expect, afterEach } from "vitest";
import { createServer, request, type IncomingHttpHeaders } from "node:http";
import type { AddressInfo } from "node:net";
import { z } from "zod";
import {
  ProcedureServer,
  createProcedure,
  createRegistry,
  type Credentials,
  type PrincipalOf,
  type ProcedureRegistry,
  type RequestConnection,
  type RequestHandler,
} from "@procedures/client";
import { McpServerTransport } from "./mcp-transport.js";

let cleanups: Array<() => Promise<unknown> | unknown> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

function registryOf(): ProcedureRegistry {
  return createRegistry({
    name: "connection",
    procedures: [
      createProcedure()
        .path(["who", "am"])
        .input(z.object({}).passthrough())
        .output(z.unknown())
        .meta({ description: "who am I", effects: { reads: [], writes: [] } })
        .handler(async (_input, ctx) => ({ principal: ctx.principal ?? null }))
        .build(),
    ],
  });
}

/** A listener of `node:http` for the endpoint of the transport. It gives the port. */
async function listen(mcp: McpServerTransport): Promise<number> {
  const listener = createServer((req, res) => {
    if (mcp.handleHttp(req, res)) return;
    res.statusCode = 404;
    res.end();
  });
  await new Promise<void>((resolve) => listener.listen(0, "127.0.0.1", resolve));
  cleanups.push(
    () =>
      new Promise<void>((resolve) => {
        listener.close(() => resolve());
        listener.closeAllConnections();
      }),
  );
  return (listener.address() as AddressInfo).port;
}

/** The answer of a raw HTTP request, and the local port of the socket of the client. */
interface Answer {
  readonly status: number;
  readonly headers: IncomingHttpHeaders;
  readonly text: string;
  readonly clientPort: number | undefined;
}

/** A raw POST of JSON-RPC to the endpoint, on a new connection. The answer has the local port of the socket of the client. */
function post(port: number, body: unknown, headers: Record<string, string> = {}): Promise<Answer & { session: string | null; message: Record<string, unknown> | undefined }> {
  const text = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: "127.0.0.1",
        port,
        path: "/mcp",
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "content-length": String(Buffer.byteLength(text)), ...headers },
        agent: false,
      },
      (res) => {
        const clientPort = res.socket.localPort;
        let answer = "";
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => (answer += chunk));
        res.on("end", () => {
          const data = answer.split(/\r?\n/).find((line) => line.startsWith("data: "));
          const json = answer.startsWith("{") ? answer : data?.slice("data: ".length);
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            text: answer,
            clientPort,
            session: [res.headers["mcp-session-id"]].flat()[0] ?? null,
            message: json ? (JSON.parse(json) as Record<string, unknown>) : undefined,
          });
        });
      },
    );
    req.on("error", reject);
    req.end(text);
  });
}

const INITIALIZE = { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "connection", version: "0" } } };
const INITIALIZED = { jsonrpc: "2.0", method: "notifications/initialized" };
const CALL = { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "who.am", arguments: {} } };

/** The connection of a client socket of the test on this port of the endpoint. */
const loopback = (clientPort: number | undefined, port: number): RequestConnection => ({ remoteAddress: "127.0.0.1", remotePort: clientPort, localAddress: "127.0.0.1", localPort: port });

/** The JSON text of the first content item of a tool result. */
function toolValue(message: Record<string, unknown> | undefined): unknown {
  const result = message?.["result"] as { content?: Array<{ text?: string }> } | undefined;
  return JSON.parse(result?.content?.[0]?.text ?? "null") as unknown;
}

describe("the connection of a request of MCP over Streamable HTTP (CLI-71)", () => {
  it("gives the connection to the request hook in the one admission of each HTTP request", async () => {
    const seen: Array<{ id: string; connection: RequestConnection | undefined }> = [];
    const principalOf: PrincipalOf = (credentials, req) => {
      seen.push({ id: req.id, connection: credentials.connection });
      const remotePort = credentials.connection?.remotePort;
      return remotePort === undefined ? undefined : { principal: { id: `peer:${String(remotePort)}`, via: "peer" } };
    };
    const registry = registryOf();
    const server = new ProcedureServer({ registry, autoRegister: true, principalOf });
    const mcp = new McpServerTransport(server, { registry, transport: "http" });
    server.addTransport(mcp);
    await server.start();
    cleanups.push(() => server.stop());
    const port = await listen(mcp);

    const opened = await post(port, INITIALIZE);
    expect(opened.status).toBe(200);
    expect(opened.clientPort).toBeTypeOf("number");
    expect(seen).toEqual([{ id: "admission", connection: loopback(opened.clientPort, port) }]);
    expect(Object.isFrozen(seen[0]!.connection)).toBe(true);

    const session = { "mcp-session-id": opened.session! };
    await post(port, INITIALIZED, session);
    const called = await post(port, CALL, session);
    expect(called.status).toBe(200);
    // One admission for each HTTP request, each with the connection of its socket. The tool call adds none.
    expect(seen).toHaveLength(3);
    expect(seen[2]).toEqual({ id: "admission", connection: loopback(called.clientPort, port) });
    expect(toolValue(called.message)).toEqual({ principal: { id: `peer:${String(called.clientPort)}`, via: "peer" } });
  });

  it("gives each tool call the credentials of its HTTP request with the connection, for a handler without admission()", async () => {
    const calls: Array<Credentials | undefined> = [];
    const handler: RequestHandler = {
      handle: async (req) => {
        calls.push(req.credentials);
        return { id: req.id, status: { type: "success", code: 200 }, payload: { ok: true }, metadata: {} };
      },
    };
    const mcp = new McpServerTransport(handler, { registry: registryOf(), transport: "http" });
    await mcp.start();
    cleanups.push(() => mcp.stop());
    const port = await listen(mcp);

    const opened = await post(port, INITIALIZE, { "x-user": "ann" });
    expect(opened.status).toBe(200);
    const session = { "mcp-session-id": opened.session!, "x-user": "ann" };
    await post(port, INITIALIZED, session);
    const called = await post(port, CALL, session);
    expect(called.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.headers?.["x-user"]).toBe("ann");
    expect(calls[0]?.connection).toEqual(loopback(called.clientPort, port));
    expect(Object.isFrozen(calls[0]?.connection)).toBe(true);
  });
});
