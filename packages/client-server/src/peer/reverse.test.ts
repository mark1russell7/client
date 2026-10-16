/**
 * A peer sends calls to its connected clients (roadmap R24): `connections()` and `clientFor()`.
 */

import { describe, it, expect, afterEach } from "vitest";
import { createServer } from "node:net";
import { z } from "zod";
import { ProcedureRegistry, ProcedureServer, WebSocketTransport, createProcedure, createRegistry } from "@procedures/client";
import { createPeer, type Peer } from "./index.js";

async function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(typeof address === "object" && address ? address.port : 0));
    });
  });
}

let cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup().catch(() => {});
  cleanups = [];
});

describe("a peer calls its clients (R24)", () => {
  it("lists the connections, and calls a procedure that a client serves", async () => {
    const port = await freePort();
    const peer: Peer = await createPeer({ id: "peer-reverse", registry: new ProcedureRegistry(), transports: [{ type: "websocket", port, host: "127.0.0.1" }] });
    await peer.start();
    cleanups.push(() => peer.stop());

    const served = new ProcedureServer({
      registry: createRegistry({
        name: "ui",
        procedures: [
          createProcedure()
            .path(["ui", "greet"])
            .input(z.object({ name: z.string() }))
            .output(z.string())
            .meta({ effects: { reads: [], writes: [] } })
            .handler(async (input) => `hello ${input.name}`)
            .build(),
        ],
      }),
    });
    served.registerFromRegistry();
    const transport = new WebSocketTransport({ url: `ws://127.0.0.1:${port}/ws`, heartbeat: { enabled: false }, reconnect: { enabled: false }, serve: served });
    cleanups.push(() => transport.close());

    const until = Date.now() + 2000;
    while (peer.connections().length === 0 && Date.now() < until) await new Promise((resolve) => setTimeout(resolve, 10));
    const [id] = peer.connections();
    expect(id).toBeDefined();
    const client = peer.clientFor(id!);
    expect(await client.call({ service: "ui", operation: "greet" }, { name: "Ann" })).toBe("hello Ann");
    expect(() => peer.clientFor("missing")).toThrow("Connection not found");
  });
});
