/**
 * The upgrade of the WebSocket face (CLI-7): the face refuses a connection that the server does
 * not admit, with the same path as each call. Thus no idle connection without credentials stays open.
 *
 * - A host with a token refuses an upgrade without the token with 401.
 * - A request hook that refuses the credentials gives 401. A request hook that admits a request
 *   without credentials (an empty identity) lets the connection open.
 * - A failed browser check gives 403, as on the HTTP face.
 */

import { describe, it, expect, afterEach } from "vitest";
import { randomBytes } from "node:crypto";
import { request } from "node:http";
import { hostPolicy, ProcedureRegistry, type HostPolicy } from "@procedures/client";
import { createPeer, type Peer } from "../peer/index.js";

let peers: Peer[] = [];
afterEach(async () => {
  for (const peer of peers) await peer.stop();
  peers = [];
});

/** A peer with a WebSocket transport on a free port, and its port. */
async function wsPeer(policy: HostPolicy): Promise<number> {
  const peer = await createPeer({ id: "peer-upgrade", registry: new ProcedureRegistry(), policy, transports: [{ type: "websocket", port: 0, host: "127.0.0.1" }] });
  await peer.start();
  peers.push(peer);
  const [endpoint] = peer.getEndpoints();
  return Number(new URL(endpoint!.address).port);
}

/** The status of an upgrade: 101 when the connection opens, else the status of the refusal. */
function upgrade(port: number, path: string, headers: Record<string, string> = {}): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = request({
      host: "127.0.0.1",
      port,
      path,
      headers: {
        Connection: "Upgrade",
        Upgrade: "websocket",
        "Sec-WebSocket-Version": "13",
        "Sec-WebSocket-Key": randomBytes(16).toString("base64"),
        Host: `127.0.0.1:${port}`,
        ...headers,
      },
    });
    req.on("upgrade", (res, socket) => {
      socket.destroy();
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

describe("the upgrade of the WebSocket face (CLI-7)", () => {
  it("refuses an upgrade without the token of the host with 401, and opens one with it", async () => {
    const port = await wsPeer(hostPolicy({ token: "ws-token" }));
    expect(await upgrade(port, "/ws")).toBe(401);
    expect(await upgrade(port, "/ws?token=wrong")).toBe(401);
    expect(await upgrade(port, "/ws?token=ws-token")).toBe(101);
    expect(await upgrade(port, "/ws", { Authorization: "Bearer ws-token" })).toBe(101);
  });

  it("refuses an upgrade that the request hook refuses, and opens one that it admits", async () => {
    const port = await wsPeer(hostPolicy({ principalOf: (credentials) => (credentials.headers?.["x-user"] ? { principal: { id: "ann", via: "x-user" } } : undefined) }));
    expect(await upgrade(port, "/ws")).toBe(401);
    expect(await upgrade(port, "/ws", { "X-User": "ann" })).toBe(101);
  });

  it("opens an upgrade without credentials when the request hook admits it", async () => {
    const port = await wsPeer(hostPolicy({ principalOf: () => ({}) }));
    expect(await upgrade(port, "/ws")).toBe(101);
  });

  it("refuses a web page of another origin with 403, as the HTTP face does", async () => {
    const port = await wsPeer(hostPolicy({ token: "ws-token" }));
    expect(await upgrade(port, "/ws?token=ws-token", { Origin: "https://evil.example" })).toBe(403);
  });
});
