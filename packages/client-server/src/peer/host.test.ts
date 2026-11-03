/**
 * The procedures of a host (roadmap R19): host.health, host.info and host.metrics of a peer,
 * through its HTTP transport.
 */

import { describe, it, expect, afterEach } from "vitest";
import { Client, HttpTransport, ProcedureRegistry, defineProcedure, outputSchema } from "@procedures/client";
import { createPeer, type Peer } from "./index.js";

/**
 * The port of the first endpoint of a started peer. The peer listens on port 0, so no other test or
 * process takes the port between a probe and the listen (EADDRINUSE on CI).
 */
function portOf(peer: Peer): number {
  const [endpoint] = peer.getEndpoints();
  const port = Number(new URL(endpoint!.address).port);
  expect(port).toBeGreaterThan(0);
  return port;
}

let peers: Peer[] = [];
afterEach(async () => {
  for (const peer of peers) await peer.stop();
  peers = [];
});

describe("host procedures of a peer (R19)", () => {
  it("gives the health, the info and the metrics of the host", async () => {
    const registry = new ProcedureRegistry();
    registry.register(
      defineProcedure({
        path: ["test", "echo"],
        input: outputSchema<{ text: string }>(),
        output: outputSchema<string>(),
        metadata: { effects: { reads: [], writes: [] } },
        handler: (input: { text: string }) => input.text,
      }),
    );
    const peer = await createPeer({ id: "peer-host", registry, transports: [{ type: "http", port: 0, host: "127.0.0.1" }] });
    peers.push(peer);
    await peer.start();
    const client = new Client(new HttpTransport({ baseUrl: `http://127.0.0.1:${portOf(peer)}/api` }));

    expect(await client.call({ service: "test", operation: "echo" }, { text: "hi" })).toBe("hi");

    const health = await client.call<unknown, { status: string; peerId: string; procedures: number; callsInFlight: number }>(
      { service: "host", operation: "health" },
      {},
    );
    expect(health).toMatchObject({ status: "ok", peerId: "peer-host", callsInFlight: 1 });
    expect(health.procedures).toBeGreaterThanOrEqual(1);

    const info = await client.call<unknown, { endpoints: Array<{ type: string }>; runtime: string }>({ service: "host", operation: "info" }, {});
    expect(info.endpoints.map((endpoint) => endpoint.type)).toEqual(["http"]);
    expect(info.runtime).toMatch(/^node /);

    const metrics = await client.call<unknown, { procedures: Record<string, { calls: number }> }>({ service: "host", operation: "metrics" }, {});
    expect(metrics.procedures["test.echo"]?.calls).toBe(1);
    // The host procedures are pinned on the server: the registry of the caller does not change
    expect(registry.get(["host", "health"])).toBeUndefined();
  });
});
