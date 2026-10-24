// server-ws --port N --tcp-keepalive off|N --heartbeat off|on [--heartbeat-interval-ms N --heartbeat-misses N]
//
// The `server` program of the procedures subject (CLI-33): the procedures server of the
// @procedures/client of this checkout (ProcedureServer and WebSocketServerTransport) on the
// http.Server of Node, at the path /ws. ProcedureServer is the server that each procedures host
// runs. It serves two procedures from a registry: `harness.echo` answers at once, and
// `harness.hold` answers after `ms` milliseconds (a held reply, as BLPOP is for Redis). The
// subject that the harness of systems shipped had the same program on `Server`, the base class.
//
// --tcp-keepalive is the keepalive of each accepted socket: off, or its idle time in ms. Node's
// default is off (keepAlive of http.Server), and the cell says it.
//
// --heartbeat is the heartbeat of the server (roadmap R3): a WebSocket ping to each connection at
// each interval, and terminate() for a connection that missed `misses` pongs. Each setting is a
// flag, and the server has no default. Each time is a duration. One setInterval of the
// transport, from its start, beats for all connections: the first ping of a connection comes at
// the next beat after its accept.
//
// The readiness of the target is the line `listening`: the harness waits for it. The program has
// no health route of its own (SERVER-LAYERS.md: the host owns the probes).
//
// Each event is a JSON line on the clock of the clients: a connection (`accepted`), a request,
// a reply, and the close of a connection. The `ws` package does the WebSocket of the server. Its
// `ping` and `terminate` write a line first (`ping`, `drop`): the heartbeat of the server pings its
// clients and drops a silent one. Each line names the connection by its peer.

import http from "node:http";
import { WebSocket } from "ws";
import { z } from "zod";
import { ProcedureServer, createProcedure, createRegistry } from "@procedures/client";
import { WebSocketServerTransport } from "@procedures/client/node";
import { bootId, commandLine, emit, subjectPackage } from "./lines.mjs";

const line = commandLine("server-ws --port N --tcp-keepalive off|N --heartbeat off|on [--heartbeat-interval-ms N --heartbeat-misses N]");
const port = line.number("--port");
const keepalive = line.required("--tcp-keepalive");
const keepAliveMs = keepalive === "off" ? null : Number(keepalive);
if (keepAliveMs !== null && !Number.isFinite(keepAliveMs)) line.fail("--tcp-keepalive is off or a number of ms");
const heartbeat = line.toggle("--heartbeat")
  ? { interval: line.number("--heartbeat-interval-ms"), misses: line.number("--heartbeat-misses") }
  : null;

const peerOf = (socket) => `${socket?.remoteAddress}:${socket?.remotePort}`;

// the acts of a heartbeat of the server, in the package that the transport imports
const ping = WebSocket.prototype.ping;
WebSocket.prototype.ping = function (...args) {
  emit("ping", { peer: peerOf(this._socket) });
  return ping.apply(this, args);
};
const terminate = WebSocket.prototype.terminate;
WebSocket.prototype.terminate = function (...args) {
  emit("drop", { peer: peerOf(this._socket) });
  return terminate.apply(this, args);
};

/** The two procedures read nothing and change nothing. */
const NONE = { reads: [], writes: [] };
const registry = createRegistry({
  name: "harness",
  procedures: [
    createProcedure()
      .path(["harness", "echo"])
      .input(z.object({}).passthrough())
      .output(z.object({ ok: z.boolean() }))
      .meta({ effects: NONE })
      .handler(async () => {
        emit("request", { method: "harness.echo" });
        return { ok: true };
      })
      .build(),
    createProcedure()
      .path(["harness", "hold"])
      .input(z.object({ ms: z.number().nonnegative() }))
      .output(z.object({ ok: z.boolean(), held: z.number() }))
      .meta({ effects: NONE })
      .handler(async ({ ms }, ctx) => {
        emit("request", { method: "harness.hold", ms });
        await new Promise((resolve) => {
          const timer = setTimeout(resolve, ms);
          ctx.signal?.addEventListener("abort", () => {
            clearTimeout(timer);
            resolve();
          });
        });
        emit("replied", { method: "harness.hold", aborted: ctx.signal?.aborted === true });
        return { ok: true, held: ms };
      })
      .build(),
  ],
});
const server = new ProcedureServer({ registry });
server.registerFromRegistry();

const httpServer = http.createServer({
  keepAlive: keepAliveMs !== null,
  ...(keepAliveMs === null ? {} : { keepAliveInitialDelay: keepAliveMs }),
});
const transport = new WebSocketServerTransport(server, {
  server: httpServer,
  path: "/ws",
  heartbeat: heartbeat === null ? false : { interval: { value: heartbeat.interval, unit: "ms" }, misses: heartbeat.misses },
  onConnection: (ws, request) => {
    const peer = peerOf(request.socket);
    emit("accepted", { peer });
    ws.on("close", (code) => emit("closed", { peer, code }));
  },
});
server.addTransport(transport);
await server.start();

httpServer.listen(port, "0.0.0.0", () =>
  emit("listening", {
    port,
    boot_id: bootId(),
    node: process.version,
    package: subjectPackage(),
    server: "ProcedureServer",
    tcpKeepalive: keepAliveMs,
    heartbeat,
  }),
);
