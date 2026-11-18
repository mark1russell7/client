/**
 * The module of a running peer over HTTP (d40-tool-surface, step 2). Each peer of the test is a
 * procedures server with a token on a free port of `127.0.0.1`. A local server serves the stubs of
 * `peerModule`, and each call goes to the peer.
 */

import { afterEach, describe, expect, it } from "vitest";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import * as z from "zod";
import { createRegistry } from "../procedures/module.js";
import { ProcedureRegistry } from "../procedures/registry.js";
import { jsonSchemaOf } from "../procedures/schema.js";
import type { AnyProcedure, ProcedureModule } from "../procedures/types.js";
import { ProcedureServer } from "../server/procedure-server.js";
import { hostPolicy, procedureServerOptions } from "../server/host-policy.js";
import { pathToMethod } from "../server/method.js";
import { procedureHandler } from "../adapters/http/server/handler.js";
import { peerModule, type PeerAddress } from "./peer-module.js";

let cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup().catch(() => {});
  cleanups = [];
});

/** The jobs of a peer. Each answer names the peer, so a test sees which peer answered. */
function jobsModule(peer: string): ProcedureModule {
  const jobs: string[] = [];
  return {
    name: "jobs",
    procedures: [
      {
        path: ["jobs", "add"],
        input: z.object({ name: z.string() }),
        output: z.object({ count: z.number(), peer: z.string() }),
        metadata: { description: "This procedure adds a job.", effects: { reads: ["jobs"], writes: ["jobs"] } },
        handler: async (input: { name: string }) => {
          jobs.push(input.name);
          return { count: jobs.length, peer };
        },
      },
      {
        path: ["jobs", "list"],
        input: z.object({}),
        output: z.array(z.string()),
        metadata: { description: "This procedure lists the jobs.", effects: { reads: ["jobs"], writes: [] } },
        handler: async () => [...jobs],
      },
    ] as AnyProcedure[],
  };
}

/** This function starts a peer with a token on a free port, and gives its address and its stop. */
async function startPeer(token: string, registry: ProcedureRegistry): Promise<{ address: PeerAddress; stop: () => Promise<void> }> {
  const server = new ProcedureServer(procedureServerOptions(hostPolicy({ token }), registry));
  server.registerFromRegistry();
  const handler = procedureHandler(server, { basePath: "/api" });
  const http = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (handler(req, res)) return;
    res.statusCode = 404;
    res.end();
  });
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", () => resolve()));
  const port = (http.address() as AddressInfo).port;
  let stopped = false;
  const stop = async (): Promise<void> => {
    if (stopped) return;
    stopped = true;
    await handler.close();
    http.closeAllConnections();
    await new Promise<void>((resolve) => http.close(() => resolve()));
  };
  cleanups.push(stop);
  return { address: { url: `http://127.0.0.1:${port}/api`, token }, stop };
}

/** The status and the value of a call of the local server. */
async function call(server: ProcedureServer, path: string[], payload: unknown): Promise<{ type: string; code?: string; value?: unknown }> {
  const response = await server.handle({ id: "1", method: pathToMethod(path), payload, metadata: {} });
  const status = response.status as { type: string; code?: string };
  return { type: status.type, ...(status.type === "error" ? { code: String(status.code) } : {}), value: response.payload };
}

/** A local server that serves a module. */
function localServer(module: ProcedureModule): ProcedureServer {
  const server = new ProcedureServer({ registry: createRegistry(module) });
  server.registerFromRegistry();
  return server;
}

describe("peerModule", () => {
  it("reads the manifest of the peer, and the local server sends each call to the peer", async () => {
    const peer = await startPeer("t-1", createRegistry(jobsModule("first")));
    const module = await peerModule({ name: "jobs", address: peer.address });
    expect(module.procedures.map((procedure) => procedure.path.join("."))).toEqual(["jobs.add", "jobs.list"]);

    const add = module.procedures[0]!;
    expect(add.metadata).toMatchObject({ description: "This procedure adds a job.", effects: { reads: ["jobs"], writes: ["jobs"] }, forwarded: "jobs.add" });
    expect(jsonSchemaOf(add.input)).toMatchObject({ type: "object", properties: { name: { type: "string" } } });

    const local = localServer(module);
    expect(await call(local, ["jobs", "add"], { name: "a" })).toEqual({ type: "success", value: { count: 1, peer: "first" } });
    expect(await call(local, ["jobs", "list"], {})).toEqual({ type: "success", value: ["a"] });
  });

  it("gives the validation error of the peer for a bad input", async () => {
    const peer = await startPeer("t-1", createRegistry(jobsModule("first")));
    const local = localServer(await peerModule({ name: "jobs", address: peer.address }));
    expect(await call(local, ["jobs", "add"], { name: 7 })).toMatchObject({ type: "error", code: "VALIDATION_ERROR" });
    expect(await call(local, ["jobs", "list"], {})).toEqual({ type: "success", value: [] });
  });

  it("reads the address at each call: after a restart with a new port and token, the calls go to the new peer", async () => {
    const first = await startPeer("t-1", createRegistry(jobsModule("first")));
    let address = first.address;
    const local = localServer(await peerModule({ name: "jobs", address: () => address }));
    expect(await call(local, ["jobs", "add"], { name: "a" })).toEqual({ type: "success", value: { count: 1, peer: "first" } });

    await first.stop();
    const second = await startPeer("t-2", createRegistry(jobsModule("second")));
    expect(second.address.url).not.toBe(first.address.url);
    address = second.address;
    expect(await call(local, ["jobs", "add"], { name: "b" })).toEqual({ type: "success", value: { count: 1, peer: "second" } });
  });

  it("puts the prefix in front of each local path", async () => {
    const peer = await startPeer("t-1", createRegistry(jobsModule("first")));
    const module = await peerModule({ name: "jobs", address: peer.address, prefix: ["peer"] });
    expect(module.procedures.map((procedure) => procedure.path.join("."))).toEqual(["peer.jobs.add", "peer.jobs.list"]);
    const local = localServer(module);
    expect(await call(local, ["peer", "jobs", "add"], { name: "a" })).toEqual({ type: "success", value: { count: 1, peer: "first" } });
  });

  it("fails when the token is wrong", async () => {
    const peer = await startPeer("t-1", createRegistry(jobsModule("first")));
    await expect(peerModule({ name: "jobs", address: { ...peer.address, token: "wrong" } })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("fails when the answer of the peer is not a manifest", async () => {
    const registry = new ProcedureRegistry();
    registry.register({ path: ["procedure", "manifest"], input: z.object({}), output: z.unknown(), metadata: { effects: { reads: [], writes: [] } }, handler: async () => ({ format: "other" }) } as AnyProcedure);
    const peer = await startPeer("t-1", registry);
    await expect(peerModule({ name: "odd", address: peer.address })).rejects.toThrow("the peer of the module odd gave no manifest of the format procedures.manifest/1");
  });
});
