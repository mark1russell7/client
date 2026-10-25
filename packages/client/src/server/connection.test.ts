/**
 * The connection of a network request (CLI-71). The credentials of a network request have the
 * addresses and the ports of its socket, as frozen plain data, so a request hook can find the
 * caller from its TCP peer.
 *
 * - `requestCredentials` copies the four fields of a socket, and only the fields that the socket
 *   has. A header such as `X-Forwarded-For` or `Forwarded` changes nothing.
 * - Without a socket, the credentials have no connection, as before.
 * - The admitted credentials keep the connection, and a call with them skips the checks (CLI-2b).
 * - On the HTTP face, the request hook reads the connection. Its remote port is the local port of
 *   the socket of the client.
 * - A call in this process has no connection.
 */

import { describe, it, expect, afterEach } from "vitest";
import { createServer, request, type IncomingMessage, type Server as HttpServer, type ServerResponse as NodeResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { z } from "zod";
import { createProcedure } from "../procedures/define.js";
import { createRegistry } from "../procedures/module.js";
import { procedureHandler } from "../adapters/http/server/handler.js";
import { ProcedureServer, type ProcedureServerOptions } from "./procedure-server.js";
import { pathToMethod } from "./method.js";
import { LOCAL_CREDENTIALS, requestCredentials } from "./request-auth.js";
import type { Credentials, PrincipalOf, RequestConnection, ServerRequest } from "./types.js";

let cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup();
  cleanups = [];
});

function server(options: Omit<ProcedureServerOptions, "registry" | "autoRegister">): ProcedureServer {
  return new ProcedureServer({
    autoRegister: true,
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
    ...options,
  });
}

const call = (credentials: Credentials): ServerRequest => ({ id: "c1", method: pathToMethod(["who", "am"]), payload: {}, metadata: {}, credentials });

/** A request hook that gives the principal of the TCP peer, as the fleet site does with `resources.peer`. It keeps each connection that it sees. */
function peerHook(): { readonly hook: PrincipalOf; readonly seen: Array<{ id: string; connection: RequestConnection | undefined }> } {
  const seen: Array<{ id: string; connection: RequestConnection | undefined }> = [];
  return {
    seen,
    hook: (credentials, req) => {
      seen.push({ id: req.id, connection: credentials.connection });
      const port = credentials.connection?.remotePort;
      return port === undefined ? undefined : { principal: { id: `peer:${port}`, via: "peer" } };
    },
  };
}

describe("the connection of a network request (CLI-71)", () => {
  it("copies the addresses and the ports of the socket as frozen plain data, and only from the socket", () => {
    const socket = { remoteAddress: "127.0.0.1", remotePort: 50_123, localAddress: "127.0.0.2", localPort: 8080, remoteFamily: "IPv4", write: () => true };
    const credentials = requestCredentials({
      headers: { "x-forwarded-for": "203.0.113.7", forwarded: "for=203.0.113.7;proto=https", "x-real-ip": "203.0.113.7" },
      url: "/api/who/am",
      socket,
    });
    expect(credentials.connection).toEqual({ remoteAddress: "127.0.0.1", remotePort: 50_123, localAddress: "127.0.0.2", localPort: 8080 });
    expect(Object.isFrozen(credentials.connection)).toBe(true);
    // A copy, not the socket: a later change of the socket does not change it
    socket.remotePort = 1;
    expect(credentials.connection?.remotePort).toBe(50_123);
    // The proxy headers stay headers
    expect(credentials.headers?.["x-forwarded-for"]).toBe("203.0.113.7");
  });

  it("leaves out each field that the socket does not have: a named pipe, a Unix socket or a closed socket", () => {
    // A server socket of a named pipe or of a Unix socket has no addresses and no ports
    const pipe = requestCredentials({ headers: {}, socket: {} });
    expect(pipe.connection).toEqual({});
    expect(Object.isFrozen(pipe.connection)).toBe(true);
    // A closed socket keeps no peer, and a value that is not an address or a port stays out
    const closed = requestCredentials({ headers: {}, socket: { remoteAddress: undefined, remotePort: Number.NaN, localAddress: "127.0.0.1", localPort: 70_000 } });
    expect(closed.connection).toEqual({ localAddress: "127.0.0.1" });
  });

  it("gives no connection without a socket, so the credentials keep their shape", () => {
    const credentials = requestCredentials({ headers: { authorization: "Bearer t-1" }, url: "/ws?x=1" });
    expect("connection" in credentials).toBe(false);
    expect(credentials).toEqual({ bearer: "t-1", cookies: {}, headers: { authorization: "Bearer t-1" }, query: { x: "1" } });
  });

  it("gives the connection to the request hook in admission(), and the admitted credentials keep it", async () => {
    const { hook, seen } = peerHook();
    const value = server({ principalOf: hook });
    const credentials = requestCredentials({ headers: {}, socket: { remoteAddress: "127.0.0.1", remotePort: 50_200, localAddress: "127.0.0.1", localPort: 4731 } });
    const admitted = await value.admission(credentials);
    expect(admitted).toMatchObject({ ok: true, principal: { id: "peer:50200", via: "peer" } });
    expect(seen).toEqual([{ id: "admission", connection: { remoteAddress: "127.0.0.1", remotePort: 50_200, localAddress: "127.0.0.1", localPort: 4731 } }]);
    if (!admitted.ok) throw new Error("not admitted");
    expect(admitted.credentials.connection).toEqual(credentials.connection);
    // A call with the admitted credentials gets the principal of the peer, and the hook does not run again
    const response = await value.handle(call(admitted.credentials));
    expect(response.payload).toEqual({ principal: { id: "peer:50200", via: "peer" } });
    expect(seen).toHaveLength(1);
    // admits() and identify() give the connection to the hook too
    expect(await value.admits(credentials)).toBe(true);
    expect(await value.identify(credentials)).toEqual({ id: "peer:50200", via: "peer" });
    expect(seen.map((entry) => [entry.id, entry.connection?.remotePort])).toEqual([
      ["admission", 50_200],
      ["connection", 50_200],
      ["identify", 50_200],
    ]);
  });

  it("the HTTP face: the request hook reads the connection, and its remote port is the local port of the socket of the client", async () => {
    const { hook, seen } = peerHook();
    const value = server({ principalOf: hook });
    const handler = procedureHandler(value);
    const http: HttpServer = createServer((req: IncomingMessage, res: NodeResponse) => {
      if (handler(req, res)) return;
      res.statusCode = 404;
      res.end();
    });
    await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", () => resolve()));
    cleanups.push(async () => {
      await handler.close();
      http.closeAllConnections();
      await new Promise<void>((resolve) => http.close(() => resolve()));
    });
    const serverPort = (http.address() as AddressInfo).port;

    // A raw request on a new connection: the test reads the local port of the socket of the client
    const answer = await new Promise<{ status: number; body: string; clientPort: number | undefined }>((resolve, reject) => {
      const req = request(
        { host: "127.0.0.1", port: serverPort, method: "POST", path: "/api/who/am", headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.7" }, agent: false },
        (res) => {
          const clientPort = res.socket.localPort;
          let body = "";
          res.setEncoding("utf8");
          res.on("data", (chunk: string) => (body += chunk));
          res.on("end", () => resolve({ status: res.statusCode ?? 0, body, clientPort }));
        },
      );
      req.on("error", reject);
      req.end("{}");
    });

    expect(answer.status).toBe(200);
    expect(answer.clientPort).toBeTypeOf("number");
    expect(seen).toHaveLength(1);
    const connection = seen[0]!.connection;
    expect(connection).toEqual({ remoteAddress: "127.0.0.1", remotePort: answer.clientPort, localAddress: "127.0.0.1", localPort: serverPort });
    expect(Object.isFrozen(connection)).toBe(true);
    // The principal comes from the TCP peer, not from the X-Forwarded-For header
    expect(JSON.parse(answer.body)).toEqual({ principal: { id: `peer:${String(answer.clientPort)}`, via: "peer" } });
  });

  it("a call in this process has no connection, and the request hook does not run for it", async () => {
    const { hook, seen } = peerHook();
    const requests: Array<Credentials | undefined> = [];
    const value = server({
      principalOf: hook,
      authenticate: (req) => {
        requests.push(req.credentials);
        return { id: "app", via: "local" };
      },
    });
    const response = await value.handle(call(LOCAL_CREDENTIALS));
    expect(response.status.type).toBe("success");
    expect(requests).toHaveLength(1);
    expect(requests[0]?.connection).toBeUndefined();
    expect(seen).toEqual([]);
  });
});
