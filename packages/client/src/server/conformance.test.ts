/**
 * The faces of `@procedures/client` run the transport contract (roadmap R18, CLI-85): the same
 * cases go through `LocalTransport`, HTTP (the handler without a framework and the Express shim),
 * WebSocket (the upgrade handler and the server transport) and a message port. The cases are in
 * `src/testing/transport-contract.ts` (`@procedures/client/testing`). The MCP faces run them in `client-mcp`, and the faces of
 * a host run them in `client-server`.
 *
 * This file also has the checks that only one face has: the HTTP status of an error and a direct
 * `handle()` of the server.
 */

import { describe, it, expect, afterEach } from "vitest";
import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { MessageChannel } from "node:worker_threads";
import express from "express";
import { z } from "zod";
import { HttpTransport } from "../adapters/http/client/index.js";
import { HttpServerTransport } from "../adapters/http/server/index.js";
import { procedureHandler } from "../adapters/http/server/handler.js";
import { WebSocketTransport } from "../adapters/websocket/client/transport.js";
import { WebSocketServerTransport } from "../adapters/websocket/server/transport.js";
import { upgradeHandler } from "../adapters/websocket/server/upgrade.js";
import { LocalTransport } from "../adapters/local/client/transport.js";
import { PortTransport } from "../adapters/port/transport.js";
import { createProcedure } from "../procedures/define.js";
import { createRegistry } from "../procedures/module.js";
import { ProcedureServer } from "./procedure-server.js";
import { pathToMethod } from "./method.js";
import { LOCAL_CREDENTIALS } from "./request-auth.js";
import { VersionConflictError, type VersionConflict } from "../procedures/collection/precondition.js";
import {
  clientCaller,
  describeTransportContract,
  type ContractCapabilities,
  type ContractFace,
  type ContractServer,
  type ContractSpec,
} from "../testing/index.js";

async function listen(http: HttpServer): Promise<number> {
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", () => resolve()));
  return (http.address() as AddressInfo).port;
}

async function closeHttp(http: HttpServer): Promise<void> {
  http.closeAllConnections();
  await new Promise<void>((resolve) => http.close(() => resolve()));
}

/** The procedure server of a spec. */
async function serverOf(spec: ContractSpec): Promise<ProcedureServer> {
  const server = new ProcedureServer({
    registry: spec.registry,
    autoRegister: true,
    collections: spec.collections,
    events: spec.events,
    ...(spec.token !== undefined && { token: spec.token }),
    ...(spec.principalOf !== undefined && { principalOf: spec.principalOf }),
    ...(spec.errors !== undefined && { errors: spec.errors }),
    ...(spec.onError !== undefined && { onError: spec.onError }),
  });
  return server;
}

/** The capabilities of a face of the server. */
const SERVER_FACE: ContractCapabilities = { server: true, auth: true, subscriptions: true, streams: "items", deadline: true, errorMetadata: true, retryable: true };

const httpCaller = (port: number, bearer: string | undefined) =>
  clientCaller(new HttpTransport({ baseUrl: `http://127.0.0.1:${port}/api`, defaultHeaders: bearer === undefined ? {} : { Authorization: `Bearer ${bearer}` } }));

const wsCaller = (port: number, bearer: string | undefined) => {
  const transport = new WebSocketTransport({
    url: `ws://127.0.0.1:${port}/ws${bearer === undefined ? "" : `?token=${bearer}`}`,
    heartbeat: { enabled: false },
    reconnect: { enabled: false },
  });
  return clientCaller(transport, () => transport.close());
};

const faces: ContractFace[] = [
  {
    name: "LocalTransport",
    // The local transport calls the registry: it has no server, no network credentials and no event bus
    capabilities: { server: false, auth: false, subscriptions: false, streams: "items", deadline: true, errorMetadata: true, retryable: false },
    async start(spec): Promise<ContractServer> {
      return {
        connect: async () => clientCaller(new LocalTransport({ registry: spec.registry })),
        stop: async () => {},
      };
    },
  },
  {
    name: "HTTP without a framework",
    capabilities: { ...SERVER_FACE, sizeLimit: { code: "PAYLOAD_TOO_LARGE" } },
    async start(spec) {
      const server = await serverOf(spec);
      await server.start();
      const handler = procedureHandler(server, spec.sizeLimit === undefined ? {} : { bodyLimit: spec.sizeLimit });
      const http = createServer((req, res) => {
        if (!handler(req, res)) res.end("app");
      });
      const port = await listen(http);
      return {
        connect: async (bearer) => httpCaller(port, bearer),
        stop: async () => {
          await server.stop();
          await closeHttp(http);
        },
      };
    },
  },
  {
    name: "HTTP with the Express shim",
    capabilities: { ...SERVER_FACE, sizeLimit: { code: "PAYLOAD_TOO_LARGE" } },
    async start(spec) {
      const server = await serverOf(spec);
      const app = express();
      const http = createServer(app);
      server.addTransport(new HttpServerTransport(server, { app, httpServer: http, ...(spec.sizeLimit !== undefined && { bodyLimit: spec.sizeLimit }) }));
      await server.start();
      const port = await listen(http);
      return {
        connect: async (bearer) => httpCaller(port, bearer),
        stop: async () => {
          await server.stop();
          await closeHttp(http);
        },
      };
    },
  },
  {
    name: "WebSocket with the upgrade handler",
    capabilities: { ...SERVER_FACE, sizeLimit: { code: "PAYLOAD_TOO_LARGE" } },
    async start(spec) {
      const server = await serverOf(spec);
      await server.start();
      const upgrade = upgradeHandler(server, { path: "/ws", heartbeat: false, ...(spec.sizeLimit !== undefined && { maxPayload: spec.sizeLimit }) });
      const http = createServer((_req, res) => res.end("app"));
      http.on("upgrade", (req, socket, head) => {
        if (!upgrade(req, socket, head)) socket.destroy();
      });
      const port = await listen(http);
      return {
        connect: async (bearer) => wsCaller(port, bearer),
        stop: async () => {
          await upgrade.close();
          await server.stop();
          await closeHttp(http);
        },
      };
    },
  },
  {
    name: "WebSocket with the server transport",
    capabilities: { ...SERVER_FACE, sizeLimit: { code: "PAYLOAD_TOO_LARGE" } },
    async start(spec) {
      const server = await serverOf(spec);
      const http = createServer();
      server.addTransport(new WebSocketServerTransport(server, { server: http, path: "/ws", heartbeat: false, ...(spec.sizeLimit !== undefined && { maxPayload: spec.sizeLimit }) }));
      await server.start();
      const port = await listen(http);
      return {
        connect: async (bearer) => wsCaller(port, bearer),
        stop: async () => {
          await server.stop();
          await closeHttp(http);
        },
      };
    },
  },
  {
    name: "a message port",
    // A message port is in one process: structured clone copies a message, and it has no size limit
    capabilities: { ...SERVER_FACE },
    async start(spec) {
      const server = await serverOf(spec);
      await server.start();
      const closes: Array<() => Promise<void>> = [];
      return {
        async connect(bearer) {
          const channel = new MessageChannel();
          // The side of the server sets the credentials of each call: here the bearer of the caller
          const worker = new PortTransport(channel.port1, { serve: server, credentials: bearer === undefined ? {} : { bearer } });
          const page = new PortTransport(channel.port2);
          const close = async () => {
            await page.close();
            await worker.close();
            channel.port1.close();
            channel.port2.close();
          };
          closes.push(close);
          return clientCaller(page, close);
        },
        stop: async () => {
          for (const close of closes) await close().catch(() => undefined);
          await server.stop();
        },
      };
    },
  },
];

for (const face of faces) describeTransportContract(face, { describe, it, afterEach, expect });

/** The conflicts of the procedure `conf.conflict` (roadmap CLI-16). */
const CONFLICTS: VersionConflict[] = [
  { id: "a", expected: "1", found: true, value: { n: 2 }, version: "2" },
  { id: "b", expected: null, found: false, version: null },
];

const TOKEN = "conformance-token-0123456789";

/** The procedures of the checks below. */
function registryOf() {
  const read = { reads: [], writes: [] };
  return createRegistry({
    name: "conformance",
    procedures: [
      createProcedure()
        .path(["conf", "echo"])
        .input(z.object({ text: z.string() }))
        .output(z.object({ text: z.string() }))
        .meta({ effects: read })
        .handler(async (input) => ({ text: input.text }))
        .build(),
      createProcedure()
        .path(["conf", "fail"])
        .input(z.object({ code: z.string().optional(), retryable: z.boolean().optional() }))
        .output(z.string())
        .meta({ effects: read })
        .handler(async (input: { code?: string | undefined; retryable?: boolean | undefined }) => {
          throw Object.assign(new Error("it failed"), input.code === undefined ? {} : { code: input.code }, input.retryable === undefined ? {} : { retryable: input.retryable });
        })
        .build(),
      createProcedure()
        .path(["conf", "conflict"])
        .input(z.object({}))
        .output(z.string())
        .meta({ effects: read })
        .handler(async () => {
          throw new VersionConflictError(CONFLICTS);
        })
        .build(),
    ],
  });
}

let cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup().catch(() => {});
  cleanups = [];
});

describe("the HTTP status of a handler error (WIRE-PROTOCOL.md)", () => {
  it("follows the code: the status of ERROR_CODES for a code of the protocol, 500 for another code, and 500 for a 503 with retryable false", async () => {
    const server = new ProcedureServer({ registry: registryOf(), autoRegister: true });
    const app = express();
    const http = createServer(app);
    server.addTransport(new HttpServerTransport(server, { app, httpServer: http }));
    await server.start();
    const port = await listen(http);
    cleanups.push(async () => {
      await server.stop();
      await closeHttp(http);
    });
    const post = async (body: unknown) => {
      const response = await fetch(`http://127.0.0.1:${port}/api/conf/fail`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      return { status: response.status, body: (await response.json()) as Record<string, unknown> };
    };
    expect(await post({ code: "UNAVAILABLE", retryable: true })).toMatchObject({ status: 503, body: { code: "UNAVAILABLE", retryable: true, error: "it failed" } });
    // Without a flag, the error gets the default of its code: UNAVAILABLE is retryable, and stays 503
    expect(await post({ code: "UNAVAILABLE" })).toMatchObject({ status: 503, body: { code: "UNAVAILABLE", retryable: true, error: "it failed" } });
    // An error with retryable false does not get 503: a 503 invites a retry at the HTTP level (CLI-48)
    expect(await post({ code: "UNAVAILABLE", retryable: false })).toMatchObject({ status: 500, body: { code: "UNAVAILABLE", retryable: false, error: "it failed" } });
    expect(await post({ code: "E_CUSTOM" })).toMatchObject({ status: 500, body: { code: "E_CUSTOM", error: "it failed" } });
    expect(await post({})).toMatchObject({ status: 500, body: { code: "HANDLER_ERROR", error: "it failed" } });
    // A conflict of a precondition: 409, with the current items in the body (roadmap CLI-16)
    const conflict = await fetch(`http://127.0.0.1:${port}/api/conf/conflict`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toMatchObject({ code: "VERSION_CONFLICT", retryable: false, conflicts: CONFLICTS });
  });
});

describe("a direct handle() of the server (R18, CLI-1)", () => {
  it("with the local marker is a request of this process: the token does not apply", async () => {
    const server = new ProcedureServer({ registry: registryOf(), autoRegister: true, token: TOKEN });
    const response = await server.handle({ id: "1", method: pathToMethod(["conf", "echo"]), payload: { text: "x" }, metadata: {}, credentials: LOCAL_CREDENTIALS });
    expect(response.payload).toEqual({ text: "x" });
  });

  it("without credentials does not skip the token (CLI-1)", async () => {
    const server = new ProcedureServer({ registry: registryOf(), autoRegister: true, token: TOKEN });
    const response = await server.handle({ id: "1", method: pathToMethod(["conf", "echo"]), payload: { text: "x" }, metadata: {} });
    expect(response.status).toMatchObject({ type: "error", code: "UNAUTHORIZED" });
  });

  it("an authenticate function gives the principal, and refuses a request without one", async () => {
    const server = new ProcedureServer({
      registry: registryOf(),
      autoRegister: true,
      authenticate: (request) => (request.credentials?.bearer === "alice" ? { id: "alice", via: "test" } : undefined),
    });
    const ok = await server.handle({ id: "1", method: pathToMethod(["conf", "echo"]), payload: { text: "x" }, metadata: {}, credentials: { bearer: "alice" } });
    expect(ok.status.type).toBe("success");
    const refused = await server.handle({ id: "2", method: pathToMethod(["conf", "echo"]), payload: { text: "x" }, metadata: {}, credentials: {} });
    expect(refused.status).toMatchObject({ type: "error", code: "UNAUTHORIZED" });
  });
});
