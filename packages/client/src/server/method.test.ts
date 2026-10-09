/**
 * A conformance test of the path encoding (deep dive architecture review 3.3) and of the live
 * registry lookup of `ProcedureServer` (deep dive TRN-13, roadmap 0.4).
 *
 * A 3-segment procedure must answer through each host face: LocalTransport, HTTP, WebSocket and
 * `Server.handle`. Before, the hosts sent two encodings, and the server matched one exactly.
 */

import { describe, it, expect, afterEach } from "vitest";
import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { Client } from "../client/client.js";
import { HttpTransport } from "../adapters/http/client/index.js";
import { HttpServerTransport } from "../adapters/http/server/index.js";
import { WebSocketTransport } from "../adapters/websocket/client/transport.js";
import { WebSocketServerTransport } from "../adapters/websocket/server/transport.js";
import { LocalTransport } from "../adapters/local/client/transport.js";
import { ProcedureServer } from "./procedure-server.js";
import { ProcedureRegistry } from "../procedures/registry.js";
import { defineProcedure } from "../procedures/define.js";
import { outputSchema } from "../procedures/core/schemas.js";
import { pathToMethod, methodToPath } from "./method.js";
import type { ServerResponse } from "./types.js";

const PATH = ["conf", "nested", "echo"];

function echo(path: string[], tag: string) {
  return defineProcedure({
    path,
    input: outputSchema<unknown>(),
    output: outputSchema<unknown>(),
    handler: (input: unknown) => ({ tag, input }),
  });
}

let cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup().catch(() => {});
  cleanups = [];
});

async function listen(http: HttpServer): Promise<number> {
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", () => resolve()));
  return (http.address() as AddressInfo).port;
}

async function httpClient(server: ProcedureServer): Promise<{ client: Client; url: string }> {
  const app = express();
  app.use(express.json({ strict: false }));
  const http = createServer(app);
  server.addTransport(new HttpServerTransport(server, { app, httpServer: http }));
  await server.start();
  const port = await listen(http);
  cleanups.push(() => new Promise<void>((resolve) => http.close(() => resolve())));
  const url = `http://127.0.0.1:${port}/api`;
  return { client: new Client(new HttpTransport({ baseUrl: url })), url };
}

async function wsClient(server: ProcedureServer): Promise<Client> {
  const http = createServer();
  const transport = new WebSocketServerTransport(server, { server: http, path: "/ws" });
  server.addTransport(transport);
  await server.start();
  const port = await listen(http);
  const client = new WebSocketTransport({ url: `ws://127.0.0.1:${port}/ws`, heartbeat: { enabled: false } });
  cleanups.push(async () => {
    await client.close();
    await transport.stop();
    await new Promise<void>((resolve) => http.close(() => resolve()));
  });
  return new Client(client);
}

function handle(server: ProcedureServer, service: string, operation: string, payload: unknown = {}): Promise<ServerResponse> {
  return server.handle({ id: "1", method: { service, operation }, payload, metadata: {} });
}

describe("pathToMethod and methodToPath", () => {
  it("put every segment but the last in the service", () => {
    expect(pathToMethod(["docker", "compose", "up"])).toEqual({ service: "docker.compose", operation: "up" });
    expect(pathToMethod(["git", "status"])).toEqual({ service: "git", operation: "status" });
    expect(() => pathToMethod(["one"])).toThrow(/two segments/);
  });

  it("read both encodings back to one path", () => {
    expect(methodToPath({ service: "docker.compose", operation: "up" })).toEqual(["docker", "compose", "up"]);
    expect(methodToPath({ service: "docker", operation: "compose.up" })).toEqual(["docker", "compose", "up"]);
  });
});

describe("a 3-segment procedure through each host face", () => {
  const registry = (): ProcedureRegistry => {
    const r = new ProcedureRegistry();
    r.register(echo(PATH, "v1"));
    return r;
  };

  it("LocalTransport", async () => {
    const client = new Client(new LocalTransport({ registry: registry() }));
    expect(await client.call(pathToMethod(PATH), { n: 1 })).toEqual({ tag: "v1", input: { n: 1 } });
  });

  it("Server.handle, with both encodings", async () => {
    const server = new ProcedureServer({ registry: registry(), autoRegister: true });
    expect((await handle(server, "conf.nested", "echo")).payload).toEqual({ tag: "v1", input: {} });
    expect((await handle(server, "conf", "nested.echo")).payload).toEqual({ tag: "v1", input: {} });
  });

  it("HTTP", async () => {
    const { client } = await httpClient(new ProcedureServer({ registry: registry(), autoRegister: true }));
    expect(await client.call(pathToMethod(PATH), { n: 2 })).toEqual({ tag: "v1", input: { n: 2 } });
  }, 10_000);

  it("WebSocket", async () => {
    const client = await wsClient(new ProcedureServer({ registry: registry(), autoRegister: true }));
    expect(await client.call(pathToMethod(PATH), { n: 3 })).toEqual({ tag: "v1", input: { n: 3 } });
  }, 10_000);
});

describe("ProcedureServer reads the live registry (TRN-13)", () => {
  it("serves a procedure that was registered after the server started", async () => {
    const registry = new ProcedureRegistry();
    const server = new ProcedureServer({ registry, autoRegister: true });
    registry.register(echo(PATH, "late"));
    expect((await handle(server, "conf.nested", "echo")).payload).toEqual({ tag: "late", input: {} });
    expect(server.hasProcedure(PATH)).toBe(true);
  });

  it("serves the new handler after an override, and nothing after an unregistration", async () => {
    const registry = new ProcedureRegistry();
    registry.register(echo(PATH, "v1"));
    const server = new ProcedureServer({ registry, autoRegister: true });
    registry.register(echo(PATH, "v2"), { override: true });
    expect((await handle(server, "conf.nested", "echo")).payload).toEqual({ tag: "v2", input: {} });
    registry.unregister(PATH);
    const response = await handle(server, "conf.nested", "echo");
    expect(response.status).toMatchObject({ type: "error", code: "NOT_FOUND" });
    expect(server.hasProcedure(PATH)).toBe(false);
  });

  it("applies the expose rule when the request arrives", async () => {
    const registry = new ProcedureRegistry();
    const server = new ProcedureServer({ registry, autoRegister: true, expose: (path) => path[0] === "conf" });
    registry.register(echo(["hidden", "thing"], "secret"));
    registry.register(echo(PATH, "open"));
    expect((await handle(server, "hidden", "thing")).status).toMatchObject({ type: "error", code: "NOT_FOUND" });
    expect((await handle(server, "conf.nested", "echo")).status.type).toBe("success");
  });

  it("answers an unknown procedure with HTTP 404", async () => {
    const { url } = await httpClient(new ProcedureServer({ registry: new ProcedureRegistry(), autoRegister: true }));
    const response = await fetch(`${url}/no.such/thing`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: "NOT_FOUND" });
  }, 10_000);
});
