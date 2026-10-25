/**
 * The connection of a network request on each face of the procedures host (CLI-71).
 *
 * The request hook (`principalOf`) of each network face reads `credentials.connection`: the
 * addresses and the ports of the socket of the request, as frozen data. The remote port is the
 * local port of the socket of the client. The fleet site finds the caller from this TCP peer
 * (`resources.peer` of headroom).
 *
 * - The HTTP face: the hook of each request reads the connection.
 * - The WebSocket face: the hook reads the connection at the upgrade (`admits()`). A hook that
 *   looks up the peer admits a known peer and refuses another one. Each call over the connection
 *   has the connection of the upgrade.
 * - The MCP face: the one admission of each HTTP request reads the connection, and a tool call
 *   gets the principal of that admission.
 * - The local face: a call in this process has no connection.
 */

import { describe, it, expect, afterEach } from "vitest";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { request, type IncomingHttpHeaders } from "node:http";
import { connect, type Socket } from "node:net";
import { z } from "zod";
import { service, type ServiceBuilder } from "@mark1russell7/service";
import { fakeClock, fakeProcess, seeded } from "@mark1russell7/service/testing";
import {
  Client,
  WebSocketTransport,
  createProcedure,
  createRegistry,
  hostPolicy,
  isLocalCredentials,
  ms,
  pathToMethod,
  seconds,
  type PrincipalOf,
  type RequestConnection,
} from "@procedures/client";
import { mcpFace } from "@procedures/mcp-server";
import { createProcedureHost, LOCAL_LISTENER_KNOBS, localFace } from "./index.js";

let cleanups: Array<() => Promise<unknown> | unknown> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

/** A service with short stages. */
function serviceOf(name: string): ServiceBuilder {
  return service(name)
    .readiness({ type: "debounce", interval: seconds(5), failAfter: 3, recoverAfter: 1 })
    .liveness({ type: "window", failAfter: seconds(45) })
    .startup(seconds(10))
    .phase("fail readiness", ms(10))
    .phase("stop intake", ms(500))
    .phase("drain", ms(1000))
    .phase("close transports", ms(500))
    .phase("stop the poller", ms(100))
    .phase("tear down dependencies", ms(500))
    .phase("close the health server", ms(100))
    .cooperativeWindow(ms(500))
    .onRepeatSignal("ignore");
}

/** One run of the request hook: the id of its request and the connection of its credentials. */
interface Seen {
  readonly id: string;
  readonly connection: RequestConnection | undefined;
}

/**
 * A request hook that gives the principal of the TCP peer, as the fleet site does with
 * `resources.peer`. `known` limits the peers: without it, each peer with a port passes.
 */
function peerHook(seen: Seen[], known?: ReadonlySet<number>): PrincipalOf {
  return (credentials, req) => {
    seen.push({ id: req.id, connection: credentials.connection });
    const port = credentials.connection?.remotePort;
    if (port === undefined || (known !== undefined && !known.has(port))) return undefined;
    return { principal: { id: `peer:${String(port)}`, via: "peer" } };
  };
}

/** The local credentials that the authenticate function of the host saw: true for a local request. */
interface Authenticated {
  readonly local: boolean;
  readonly connection: RequestConnection | undefined;
}

/**
 * A host with the HTTP, WebSocket, MCP and local faces on one listener, under `run()` on a fake
 * clock. The authenticate function keeps the principal of the hook and gives a local call the
 * principal `app`.
 */
async function runHost(principalOf: PrincipalOf, authenticated: Authenticated[] = []): Promise<{ address: (type: string) => string; port: number; client: Client }> {
  const clock = fakeClock();
  const local = localFace();
  const host = createProcedureHost({
    name: "connection",
    registry: createRegistry({
      name: "connection",
      procedures: [
        createProcedure()
          .path(["who", "am"])
          .input(z.object({}).passthrough())
          .output(z.unknown())
          .meta({ effects: { reads: [], writes: [] } })
          .handler(async (_input, ctx) => ({ principal: ctx.principal ?? null }))
          .build(),
      ],
    }),
    clock,
    policy: hostPolicy({ principalOf }),
    serverOptions: {
      authenticate: (req) => {
        const isLocal = isLocalCredentials(req.credentials);
        authenticated.push({ local: isLocal, connection: req.credentials?.connection });
        return isLocal ? { id: "app", via: "local" } : req.principal;
      },
    },
    faces: { http: true, ws: true, mcp: mcpFace({ serverInfo: { name: "connection", version: "0.0.0" } }), local: local.face },
    listen: [{ port: 0, knobs: LOCAL_LISTENER_KNOBS }],
  });
  const svc = host.declare(serviceOf("connection"));
  await svc.run({ clock, process: fakeProcess({ clock }), random: seeded(7) });
  await clock.advance(0);
  cleanups.push(async () => {
    for (const part of [...host.parts].reverse()) await part.impl.close();
  });
  const address = (type: string): string => host.info.endpoints().find((endpoint) => endpoint.type === type)!.address;
  return { address, port: Number(new URL(address("http")).port), client: new Client({ transport: local.transport, throwOnError: true }) };
}

/** The answer of a raw HTTP request, and the local port of the socket of the client. */
interface Answer {
  readonly status: number;
  readonly headers: IncomingHttpHeaders;
  readonly text: string;
  readonly clientPort: number | undefined;
}

/** A raw HTTP request of `node:http`, on a new connection. The answer has the local port of the socket of the client. */
function send(url: string, method: string, headers: Record<string, string>, body?: string): Promise<Answer> {
  const target = new URL(url);
  const length = body !== undefined ? { "content-length": String(Buffer.byteLength(body)) } : {};
  return new Promise((resolve, reject) => {
    const req = request({ host: target.hostname, port: target.port, path: target.pathname, method, headers: { ...headers, ...length }, agent: false }, (res) => {
      const clientPort = res.socket.localPort;
      let text = "";
      res.setEncoding("utf8");
      res.on("data", (chunk: string) => (text += chunk));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, text, clientPort }));
    });
    req.on("error", reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

/** A socket of the client, connected to the port. The test knows its local port before the request. */
async function clientSocket(port: number): Promise<Socket> {
  const socket = connect({ host: "127.0.0.1", port });
  cleanups.push(() => socket.destroy());
  await once(socket, "connect");
  return socket;
}

/** The status of an upgrade of the WebSocket face on the given socket: 101 when the connection opens, else the status of the refusal. */
function upgrade(port: number, socket: Socket): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = request({
      host: "127.0.0.1",
      port,
      path: "/ws",
      headers: { Connection: "Upgrade", Upgrade: "websocket", "Sec-WebSocket-Version": "13", "Sec-WebSocket-Key": randomBytes(16).toString("base64") },
      createConnection: () => socket,
    });
    req.on("upgrade", (res, upgraded) => {
      upgraded.destroy();
      resolve(res.statusCode ?? 101);
    });
    req.on("response", (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    req.on("error", reject);
    req.end();
  });
}

const MCP_HEADERS = { "content-type": "application/json", accept: "application/json, text/event-stream" };
const INITIALIZE = { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "connection", version: "0" } } };

/** A JSON-RPC request to the MCP face: the answer, its session and its message (JSON, or one server-sent event). */
async function postMcp(address: string, body: unknown, headers: Record<string, string>): Promise<Answer & { session: string | null; message: Record<string, unknown> | undefined }> {
  const answer = await send(address, "POST", { ...MCP_HEADERS, ...headers }, JSON.stringify(body));
  const data = answer.text.split(/\r?\n/).find((line) => line.startsWith("data: "));
  const json = answer.text.startsWith("{") ? answer.text : data?.slice("data: ".length);
  const session = [answer.headers["mcp-session-id"]].flat()[0] ?? null;
  return { ...answer, session, message: json ? (JSON.parse(json) as Record<string, unknown>) : undefined };
}

/** The principal that the tool `who.am` gives in an answer of the MCP face. */
function principalOfTool(message: Record<string, unknown> | undefined): unknown {
  const result = message?.["result"] as { content?: Array<{ text?: string }> } | undefined;
  return (JSON.parse(result?.content?.[0]?.text ?? "null") as { principal?: unknown } | null)?.principal;
}

/** The connection that the hook sees for a client socket of the test on this port of the host. */
const loopback = (clientPort: number | undefined, port: number): RequestConnection => ({ remoteAddress: "127.0.0.1", remotePort: clientPort, localAddress: "127.0.0.1", localPort: port });

describe("the connection of a network request on each face of the host (CLI-71)", () => {
  it("the HTTP face: the request hook reads the connection, and its remote port is the local port of the client socket", async () => {
    const seen: Seen[] = [];
    const { address, port } = await runHost(peerHook(seen));
    // A proxy header changes nothing: the connection comes only from the socket
    const answer = await send(`${address("http")}/who/am`, "POST", { "content-type": "application/json", "x-forwarded-for": "203.0.113.7", forwarded: "for=203.0.113.7" }, "{}");
    expect(answer.status).toBe(200);
    expect(answer.clientPort).toBeTypeOf("number");
    expect(seen).toHaveLength(1);
    expect(seen[0]!.connection).toEqual(loopback(answer.clientPort, port));
    expect(Object.isFrozen(seen[0]!.connection)).toBe(true);
    expect(JSON.parse(answer.text)).toEqual({ principal: { id: `peer:${String(answer.clientPort)}`, via: "peer" } });
  });

  it("the WebSocket upgrade: a request hook that looks up the peer gets the connection, admits a known peer and refuses another one", async () => {
    const seen: Seen[] = [];
    const known = new Set<number>();
    const { port } = await runHost(peerHook(seen, known));
    // The peer of this socket is known, as a process that headroom maps to a Claude session
    const knownSocket = await clientSocket(port);
    known.add(knownSocket.localPort!);
    expect(await upgrade(port, knownSocket)).toBe(101);
    expect(seen).toEqual([{ id: "connection", connection: loopback(knownSocket.localPort, port) }]);
    expect(Object.isFrozen(seen[0]!.connection)).toBe(true);

    // Another peer: the same hook refuses the upgrade with 401
    const otherSocket = await clientSocket(port);
    expect(await upgrade(port, otherSocket)).toBe(401);
    expect(seen[1]).toEqual({ id: "connection", connection: loopback(otherSocket.localPort, port) });
  });

  it("the WebSocket face: each call over the connection has the connection of the upgrade", async () => {
    const seen: Seen[] = [];
    const { address } = await runHost(peerHook(seen));
    const socket = new WebSocketTransport({ url: address("websocket"), heartbeat: { enabled: false }, reconnect: { enabled: false } });
    cleanups.push(() => socket.close());
    const principals: unknown[] = [];
    for (let count = 0; count < 2; count++) {
      const message = { id: `ws-${String(count)}`, method: pathToMethod(["who", "am"]), payload: {}, metadata: {} };
      for await (const item of socket.send(message)) {
        expect(item.status.type).toBe("success");
        principals.push(item.payload);
        break;
      }
    }
    // One run of the hook at the upgrade, and one for each call: all with the connection of the upgrade
    expect(seen).toHaveLength(3);
    expect(seen[0]!.id).toBe("connection");
    const remotePort = seen[0]!.connection?.remotePort;
    expect(remotePort).toBeTypeOf("number");
    for (const entry of seen) expect(entry.connection).toEqual(seen[0]!.connection);
    expect(principals).toEqual([
      { principal: { id: `peer:${String(remotePort)}`, via: "peer" } },
      { principal: { id: `peer:${String(remotePort)}`, via: "peer" } },
    ]);
  });

  it("the MCP face: the one admission of each HTTP request reads the connection, and a tool call gets the principal of the peer", async () => {
    const seen: Seen[] = [];
    const { address, port } = await runHost(peerHook(seen));
    const mcp = address("mcp");
    const opened = await postMcp(mcp, INITIALIZE, {});
    expect(opened.status).toBe(200);
    expect(seen).toEqual([{ id: "admission", connection: loopback(opened.clientPort, port) }]);
    expect(Object.isFrozen(seen[0]!.connection)).toBe(true);

    // Each HTTP request is a new connection with its own admission. The tool call adds no run of the hook.
    const session = { "mcp-session-id": opened.session! };
    await postMcp(mcp, { jsonrpc: "2.0", method: "notifications/initialized" }, session);
    const called = await postMcp(mcp, { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "who.am", arguments: {} } }, session);
    expect(called.status).toBe(200);
    expect(seen).toHaveLength(3);
    expect(seen[2]).toEqual({ id: "admission", connection: loopback(called.clientPort, port) });
    expect(principalOfTool(called.message)).toEqual({ id: `peer:${String(called.clientPort)}`, via: "peer" });
  });

  it("the local face: a call in this process has no connection, and the request hook does not run", async () => {
    const seen: Seen[] = [];
    const authenticated: Authenticated[] = [];
    const { client } = await runHost(peerHook(seen), authenticated);
    const before = authenticated.length;
    expect(await client.call({ service: "who", operation: "am" }, {})).toEqual({ principal: { id: "app", via: "local" } });
    expect(seen).toEqual([]);
    expect(authenticated.slice(before)).toEqual([{ local: true, connection: undefined }]);
  });
});
