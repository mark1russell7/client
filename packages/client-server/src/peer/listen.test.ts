/**
 * A peer that cannot listen reports the error and leaves no port open (deep dive CLI-16).
 */

import { describe, it, expect } from "vitest";
import { createServer, type Server } from "node:net";
import { ProcedureRegistry } from "@mark1russell7/client";
import { createPeer } from "./index.js";

/** A server on a free loopback port */
async function occupy(): Promise<{ server: Server; port: number }> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  return { server, port: typeof address === "object" && address ? address.port : 0 };
}

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

describe("peer listen errors", () => {
  it("rejects when the WebSocket port is in use, and closes the HTTP port it opened", async () => {
    const busy = await occupy();
    const free = await occupy();
    await close(free.server);

    const peer = await createPeer({
      id: "peer-listen-test",
      registry: new ProcedureRegistry(),
      transports: [
        { type: "http", port: free.port, host: "127.0.0.1" },
        { type: "websocket", port: busy.port, host: "127.0.0.1" },
      ],
    });
    await expect(peer.start()).rejects.toThrow(`The WebSocket server cannot listen on 127.0.0.1:${busy.port}`);
    expect(peer.getEndpoints()).toEqual([]);

    // The HTTP port is free again
    const again = createServer();
    await new Promise<void>((resolve, reject) => {
      again.once("error", reject);
      again.listen(free.port, "127.0.0.1", () => resolve());
    });
    await close(again);
    await close(busy.server);
  });
});
