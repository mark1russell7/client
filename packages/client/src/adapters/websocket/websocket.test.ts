/**
 * WebSocket round trips over a real HTTP server on 127.0.0.1 (regressions: BUGS-2026-07 H6, M5, L29).
 */

import { describe, it, expect, afterEach } from "vitest";
import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Client } from "../../client/client.js";
import { Server } from "../../server/server.js";
import type { ServerRequest, ServerResponse } from "../../server/types.js";
import { WebSocketTransport } from "./client/transport.js";
import { WebSocketServerTransport } from "./server/transport.js";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface Harness {
  url: string;
  wsServer: WebSocketServerTransport;
  connects: () => number;
  close: () => Promise<void>;
}

let cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  for (const cleanup of cleanups.reverse()) {
    await cleanup().catch(() => {});
  }
  cleanups = [];
});

async function startServer(): Promise<Harness> {
  const rpc = new Server();
  rpc.register({ service: "test", operation: "slow" }, async (req: ServerRequest): Promise<ServerResponse> => {
    await sleep(600);
    return { id: req.id, status: { type: "success" }, payload: "done", metadata: {} } as ServerResponse;
  });

  const http: HttpServer = createServer();
  const wsServer = new WebSocketServerTransport(rpc, { server: http, path: "/ws" });
  rpc.addTransport(wsServer);
  await wsServer.start();
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", () => resolve()));

  let connectCount = 0;
  wsServer.onConnect(() => {
    connectCount++;
  });

  const close = async () => {
    await wsServer.stop();
    await new Promise<void>((resolve) => http.close(() => resolve()));
  };
  cleanups.push(close);
  return {
    url: `ws://127.0.0.1:${(http.address() as AddressInfo).port}/ws`,
    wsServer,
    connects: () => connectCount,
    close,
  };
}

function connectClient(url: string, extra: Partial<ConstructorParameters<typeof WebSocketTransport>[0]> = {}): WebSocketTransport {
  const transport = new WebSocketTransport({
    url,
    connectionTimeout: 250,
    heartbeat: { enabled: false },
    reconnect: { initialDelay: 50 },
    ...extra,
  });
  cleanups.push(() => transport.close());
  return transport;
}

async function waitFor(check: () => boolean, ms = 2000): Promise<void> {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error("waitFor: condition not met");
    await sleep(10);
  }
}

describe("WebSocket transport", () => {
  it("M5: a request may take longer than the connection timeout", async () => {
    const { url } = await startServer();
    const transport = connectClient(url, { requestTimeout: 3000 });
    const client = new Client({ transport });

    // The handler takes 600ms; the connection timeout is 250ms
    await expect(client.call({ service: "test", operation: "slow" }, {})).resolves.toBe("done");
  });

  it("H6: close() does not reconnect", async () => {
    const server = await startServer();
    const transport = connectClient(server.url);
    await waitFor(() => transport.isConnected());
    expect(server.connects()).toBe(1);

    await transport.close();
    await sleep(400); // several reconnect delays (50ms, then backoff)

    expect(server.connects()).toBe(1);
    expect(transport.isConnected()).toBe(false);
  });

  it("L29: a server-to-client request fails at once when that client disconnects", async () => {
    const server = await startServer();
    // The client accepts the server's request but never answers
    const transport = connectClient(server.url, { onServerRequest: () => new Promise(() => {}) });
    await waitFor(() => server.wsServer.getTrackedConnections().length === 1);
    const [connection] = server.wsServer.getTrackedConnections();

    const started = Date.now();
    const pending = server.wsServer.callClient(connection!.id, ["client", "work"], {}, 10_000);
    await sleep(50);
    await transport.close();

    await expect(pending).rejects.toThrow("Connection closed");
    expect(Date.now() - started).toBeLessThan(2000);
  });
});
