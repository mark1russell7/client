/**
 * The body of a peer request and the stop of a peer (roadmap R5).
 *
 * - The peer had the strict JSON parser of express: a bare value (a number, a string, null) got
 *   400, and its limit of 100 kB replaced `bodyLimit`. The transport reads the body itself now.
 * - `stop()` did not close the HTTP server that the peer made for its WebSocket transport, so
 *   the port stayed bound.
 *
 * Each peer listens on port 0 and reads its real port from `getEndpoints()`. Before, a helper
 * found a free port and closed it, and the peer took it later. In that gap another test or
 * process took the port, and one CI run failed with EADDRINUSE.
 */

import { describe, it, expect, afterEach } from "vitest";
import { createServer } from "node:net";
import { request } from "node:http";
import { ProcedureRegistry, defineProcedure, outputSchema } from "@procedures/client";
import { createPeer, type Peer } from "./index.js";

/** The port of the only endpoint of a started peer. */
function portOf(peer: Peer): number {
  const [endpoint] = peer.getEndpoints();
  const port = Number(new URL(endpoint!.address).port);
  expect(port).toBeGreaterThan(0);
  return port;
}

function post(port: number, path: string, body: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request(
      { host: "127.0.0.1", port, path, method: "POST", headers: { "content-type": "application/json", host: `127.0.0.1:${port}` } },
      (res) => {
        let text = "";
        res.on("data", (chunk: Buffer) => (text += chunk.toString()));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body: text }));
      },
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

let peers: Peer[] = [];
afterEach(async () => {
  for (const peer of peers) await peer.stop();
  peers = [];
});

function registry(): ProcedureRegistry {
  const registry = new ProcedureRegistry();
  registry.register(
    defineProcedure({
      path: ["test", "double"],
      input: outputSchema<number>(),
      output: outputSchema<number>(),
      handler: (input: number) => input * 2,
    }),
  );
  registry.register(
    defineProcedure({
      path: ["test", "length"],
      input: outputSchema<{ text: string }>(),
      output: outputSchema<number>(),
      handler: (input: { text: string }) => input.text.length,
    }),
  );
  return registry;
}

describe("the body of a peer request (R5)", () => {
  it("accepts a bare JSON value", async () => {
    const peer = await createPeer({ id: "peer-body", registry: registry(), transports: [{ type: "http", port: 0, host: "127.0.0.1" }] });
    peers.push(peer);
    await peer.start();
    const port = portOf(peer);
    const response = await post(port, "/api/test/double", "21");
    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toBe(42);
  });

  it("obeys bodyLimit, not the 100 kB of express", async () => {
    const peer = await createPeer({
      id: "peer-limit",
      registry: registry(),
      transports: [{ type: "http", port: 0, host: "127.0.0.1", bodyLimit: 300_000 }],
    });
    peers.push(peer);
    await peer.start();
    const port = portOf(peer);
    const big = JSON.stringify({ text: "x".repeat(200_000) });
    const accepted = await post(port, "/api/test/length", big);
    expect(accepted.status).toBe(200);
    expect(JSON.parse(accepted.body)).toBe(200_000);
    const tooBig = await post(port, "/api/test/length", JSON.stringify({ text: "x".repeat(400_000) }));
    expect(tooBig.status).toBe(413);
  });
});

describe("the stop of a peer (R5)", () => {
  it("closes the HTTP server of its WebSocket transport, so the port is free again", async () => {
    const peer = await createPeer({ id: "peer-stop", registry: registry(), transports: [{ type: "websocket", port: 0, host: "127.0.0.1" }] });
    await peer.start();
    const port = portOf(peer);
    await peer.stop();
    const again = createServer();
    await new Promise<void>((resolve, reject) => {
      again.once("error", reject);
      again.listen(port, "127.0.0.1", () => resolve());
    });
    await new Promise<void>((resolve) => again.close(() => resolve()));
  });
});
