/**
 * server.call with an address (audit O56 #2): the call makes a connection for itself, and it
 * closes that connection after a success, an error and an abort. Before, each call left its
 * client, its entry in the map of the connections and, with WebSocket, an open socket.
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { createServer } from "node:net";
import { z } from "zod";
import { ProcedureRegistry, createProcedure, type ProcedureContext } from "@procedures/client";
import { createPeer, type Peer } from "../peer/index.js";
import { connect, disconnect, getConnectionIds } from "../connection/index.js";
import { serverCallProcedure, type ServerCallInput, type ServerCallOutput } from "./server.call.js";

async function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(typeof address === "object" && address ? address.port : 0));
    });
  });
}

async function waitFor(check: () => boolean, what: string, limit = 3000): Promise<void> {
  const end = Date.now() + limit;
  while (!check()) {
    if (Date.now() > end) throw new Error(`waitFor: ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

const NO_EFFECTS = { reads: [], writes: [] };

/** A registry with test.echo, test.fail and test.wait (it ends when its call is aborted). */
function registry(): ProcedureRegistry {
  const registry = new ProcedureRegistry();
  registry.register(
    createProcedure()
      .path(["test", "echo"])
      .input(z.object({ text: z.string() }))
      .output(z.string())
      .meta({ effects: NO_EFFECTS })
      .handler(async (input) => input.text)
      .build(),
  );
  registry.register(
    createProcedure()
      .path(["test", "fail"])
      .input(z.object({}))
      .output(z.string())
      .meta({ effects: NO_EFFECTS })
      .handler(async () => {
        throw new Error("the remote procedure failed");
      })
      .build(),
  );
  registry.register(
    createProcedure()
      .path(["test", "wait"])
      .input(z.object({}))
      .output(z.string())
      .meta({ effects: NO_EFFECTS })
      .handler(
        (_input, ctx) =>
          new Promise<string>((resolve) => {
            const timer = setTimeout(() => resolve("late"), 10_000);
            ctx?.signal?.addEventListener("abort", () => {
              clearTimeout(timer);
              resolve("aborted");
            });
          }),
      )
      .build(),
  );
  return registry;
}

const call = (input: ServerCallInput, ctx?: ProcedureContext): Promise<ServerCallOutput> =>
  Promise.resolve(serverCallProcedure.handler!(input, ctx as ProcedureContext) as ServerCallOutput | Promise<ServerCallOutput>);

let peers: Peer[] = [];
afterEach(async () => {
  for (const peer of peers) await peer.stop();
  peers = [];
  vi.restoreAllMocks();
});

async function startPeer(type: "http" | "websocket"): Promise<{ peer: Peer; address: string }> {
  // The peers of this test have no discovery procedure: connect() warns and goes on
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const port = await freePort();
  const peer = await createPeer({ id: `peer-call-${type}`, registry: registry(), transports: [{ type, port, host: "127.0.0.1" }] });
  peers.push(peer);
  await peer.start();
  return { peer, address: type === "http" ? `http://127.0.0.1:${port}/api` : `ws://127.0.0.1:${port}/ws` };
}

describe("server.call with an address closes its connection (audit O56 #2)", () => {
  it.each(["http", "websocket"] as const)("after a success, over %s", async (type) => {
    const { peer, address } = await startPeer(type);
    const before = getConnectionIds();
    const output = await call({ address, path: "test.echo", input: { text: "hi" } });
    expect(output.result).toBe("hi");
    expect(output.path).toEqual(["test", "echo"]);
    expect(getConnectionIds()).toEqual(before);
    if (type === "websocket") await waitFor(() => peer.connections().length === 0, "the peer has no open socket");
  });

  it.each(["http", "websocket"] as const)("after an error of the remote procedure, over %s", async (type) => {
    const { peer, address } = await startPeer(type);
    const before = getConnectionIds();
    await expect(call({ address, path: ["test", "fail"], input: {} })).rejects.toThrow("the remote procedure failed");
    expect(getConnectionIds()).toEqual(before);
    if (type === "websocket") await waitFor(() => peer.connections().length === 0, "the peer has no open socket");
  });

  it.each(["http", "websocket"] as const)("after an abort, over %s", async (type) => {
    const { peer, address } = await startPeer(type);
    const before = getConnectionIds();
    const controller = new AbortController();
    const pending = call({ address, path: "test.wait", input: {} }, { signal: controller.signal } as ProcedureContext);
    setTimeout(() => controller.abort(), 50);
    await expect(pending).rejects.toThrow();
    expect(getConnectionIds()).toEqual(before);
    if (type === "websocket") await waitFor(() => peer.connections().length === 0, "the peer has no open socket");
  });

  it("keeps a connection of server.connect open: its owner closes it", async () => {
    const { peer, address } = await startPeer("websocket");
    const connection = await connect({ address });
    try {
      const output = await call({ connectionId: connection.id, path: "test.echo", input: { text: "again" } });
      expect(output).toMatchObject({ result: "again", connectionId: connection.id });
      expect(getConnectionIds()).toContain(connection.id);
      expect(peer.connections()).toHaveLength(1);
    } finally {
      await disconnect(connection.id);
    }
    expect(getConnectionIds()).not.toContain(connection.id);
  });
});
