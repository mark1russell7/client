/**
 * The HTTP and WebSocket transports over real servers on 127.0.0.1 (deep dive TRN-3, TRN-6,
 * TRN-7, TRN-9, TRN-10, TRN-11, TRN-14, TRN-15, TRN-16, and the lower CORS and query items).
 */

import { describe, it, expect, afterEach } from "vitest";
import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { WebSocketServer, WebSocket as WsSocket } from "ws";
import { Client } from "../client/client.js";
import { HttpTransport } from "./http/client/index.js";
import { HttpServerTransport } from "./http/server/index.js";
import { WebSocketTransport } from "./websocket/client/transport.js";
import { WebSocketServerTransport } from "./websocket/server/transport.js";
import { WebSocketState } from "./websocket/client/types.js";
import { ProcedureServer } from "../server/procedure-server.js";
import { ProcedureRegistry } from "../procedures/registry.js";
import { defineProcedure } from "../procedures/define.js";
import { outputSchema } from "../procedures/core/schemas.js";
import type { ProcedureContext } from "../procedures/types.js";
import type { Transport } from "../client/types.js";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const BIG = "x".repeat(64 * 1024);

interface Probe {
  produced: number;
  aborted: boolean;
}

function makeServer(probe: Probe): ProcedureServer {
  const registry = new ProcedureRegistry();
  const add = (path: string[], handler: (input: never, ctx: ProcedureContext) => unknown) =>
    registry.register(defineProcedure({ path, input: outputSchema<unknown>(), output: outputSchema<unknown>(), handler: handler as never }));
  add(["t", "echo"], (input) => input);
  add(["t", "void"], () => undefined);
  add(["t", "meta"], (input: { keys: string[] }, ctx) => Object.fromEntries(input.keys.map((key) => [key, ctx.metadata[key]])));
  add(["t", "flaky"], () => {
    throw Object.assign(new Error("try later"), { retryable: true });
  });
  add(["t", "big"], async function* () {
    for (let i = 0; i < 3000; i++) {
      probe.produced++;
      yield BIG;
    }
  });
  add(["t", "slow"], async function* () {
    // The first item at once, then the stream runs longer than the client's timeout
    for (let i = 0; i < 6; i++) {
      if (i > 0) await sleep(100);
      yield i;
    }
  });
  add(["t", "hang"], async function* (_input, ctx) {
    yield "first";
    try {
      await new Promise<void>((resolve) => ctx.signal?.addEventListener("abort", () => resolve()));
    } finally {
      probe.aborted = true;
    }
  });
  return new ProcedureServer({ registry, autoRegister: true });
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

interface HttpHarness {
  url: string;
  probe: Probe;
  http: HttpServer;
  transport: HttpServerTransport;
  client: (options?: { timeout?: number }) => Client;
}

/** An HTTP server with no body parser: the transport reads the body itself. */
async function startHttp(cors?: { origin: string | string[] }): Promise<HttpHarness> {
  const probe: Probe = { produced: 0, aborted: false };
  const server = makeServer(probe);
  const app = express();
  const http = createServer(app);
  const transport = new HttpServerTransport(server, { app, httpServer: http, ...(cors ? { cors: true, corsOptions: cors } : {}) });
  server.addTransport(transport);
  await server.start();
  const port = await listen(http);
  cleanups.push(async () => {
    http.closeAllConnections();
    await new Promise<void>((resolve) => http.close(() => resolve()));
  });
  const url = `http://127.0.0.1:${port}/api`;
  return {
    url,
    probe,
    http,
    transport,
    client: (options) => new Client(new HttpTransport({ baseUrl: url, ...(options?.timeout ? { timeout: options.timeout } : {}) })),
  };
}

interface WsHarness {
  url: string;
  probe: Probe;
  wsServer: WebSocketServerTransport;
  client: (options?: Partial<ConstructorParameters<typeof WebSocketTransport>[0]>) => { client: Client; transport: WebSocketTransport };
}

async function startWs(options: { maxPayload?: number } = {}): Promise<WsHarness> {
  const probe: Probe = { produced: 0, aborted: false };
  const server = makeServer(probe);
  const http = createServer();
  const wsServer = new WebSocketServerTransport(server, { server: http, path: "/ws", ...options });
  server.addTransport(wsServer);
  await server.start();
  const port = await listen(http);
  const url = `ws://127.0.0.1:${port}/ws`;
  cleanups.push(async () => {
    await wsServer.stop();
    http.closeAllConnections();
    await new Promise<void>((resolve) => http.close(() => resolve()));
  });
  return {
    url,
    probe,
    wsServer,
    client: (extra) => {
      const transport = new WebSocketTransport({ url, heartbeat: { enabled: false }, ...extra });
      cleanups.push(() => transport.close());
      return { client: new Client(transport), transport };
    },
  };
}

const echo = { service: "t", operation: "echo" };

describe("primitive payloads and results (TRN-10)", () => {
  const values: unknown[] = [5, 0, "hello", "", true, false, null, [1, 2]];

  it("survive HTTP", async () => {
    const { client } = await startHttp();
    const c = client();
    for (const value of values) expect(await c.call(echo, value)).toEqual(value);
    expect(await c.call({ service: "t", operation: "void" }, {})).toBeUndefined();
  }, 10_000);

  it("survive WebSocket", async () => {
    const { client } = await startWs();
    const { client: c } = client();
    for (const value of values) expect(await c.call(echo, value)).toEqual(value);
    expect(await c.call({ service: "t", operation: "void" }, {})).toBeUndefined();
  }, 10_000);
});

describe("metadata (TRN-11)", () => {
  const metadata = { note: "naïve ✓ 日本", page: { cursor: "abc", size: 2 }, "odd key": "v", count: 3 };
  const keys = [...Object.keys(metadata), "__schema"];

  it("reaches the server over HTTP: any JSON value, any key, no internal keys", async () => {
    const { client } = await startHttp();
    const result = await client().call({ service: "t", operation: "meta" }, { keys }, { metadata: { ...metadata, __schema: "internal" } });
    expect(result).toEqual({ ...metadata, __schema: undefined });
  }, 10_000);

  it("reaches the server over WebSocket, with no internal keys", async () => {
    const { client } = await startWs();
    const result = await client().client.call({ service: "t", operation: "meta" }, { keys }, { metadata: { ...metadata, __schema: "internal" } });
    expect(result).toEqual({ ...metadata, __schema: undefined });
  }, 10_000);

  it("rejects a metadata header past the size limit (HTTP)", async () => {
    const { client } = await startHttp();
    await expect(client().call(echo, 1, { metadata: { huge: "y".repeat(20_000) } })).rejects.toMatchObject({ code: "METADATA_TOO_LARGE" });
  }, 10_000);

  it("does not let a query parameter replace metadata.headers (HTTP)", async () => {
    const { url } = await startHttp();
    const response = await fetch(`${url}/t/meta?headers=fake`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ keys: ["headers"] }) });
    const body = (await response.json()) as { headers: unknown };
    expect(typeof body.headers).toBe("object");
  }, 10_000);
});

describe("errors (TRN-7)", () => {
  it("keep retryable from the server over HTTP and WebSocket", async () => {
    const http = await startHttp();
    const ws = await startWs();
    for (const c of [http.client(), ws.client().client]) {
      await expect(c.call({ service: "t", operation: "flaky" }, {})).rejects.toMatchObject({ retryable: true });
    }
  }, 10_000);

  it("give ABORTED for an aborted HTTP request", async () => {
    const { client } = await startHttp();
    const controller = new AbortController();
    controller.abort();
    await expect(client().call(echo, 1, { signal: controller.signal })).rejects.toMatchObject({ code: "ABORTED" });
  }, 10_000);

  it("HttpTransport.timeout covers the time to the first item, not the whole stream", async () => {
    const { client } = await startHttp();
    const items: number[] = [];
    for await (const n of client({ timeout: 250 }).stream<unknown, number>({ service: "t", operation: "slow" }, {})) items.push(n);
    expect(items).toEqual([0, 1, 2, 3, 4, 5]);
  }, 10_000);
});

describe("backpressure (TRN-3)", () => {
  it("HTTP: a slow reader keeps the server from running ahead", async () => {
    const { client, probe } = await startHttp();
    const iterator = client().stream<unknown, string>({ service: "t", operation: "big" }, {})[Symbol.asyncIterator]();
    await iterator.next();
    await sleep(500);
    expect(probe.produced).toBeLessThan(200);
    await iterator.return?.();
  }, 15_000);

  it("WebSocket: the server sends only the items the reader has room for", async () => {
    const { client, probe } = await startWs({ maxPayload: 4 * 1024 * 1024 });
    const iterator = client({ streamWindow: 16 }).client.stream<unknown, string>({ service: "t", operation: "big" }, {})[Symbol.asyncIterator]();
    await iterator.next();
    await sleep(500);
    expect(probe.produced).toBeLessThanOrEqual(40);
    // Reading on gives more items
    for (let i = 0; i < 30; i++) await iterator.next();
    expect(probe.produced).toBeGreaterThan(30);
    await iterator.return?.();
  }, 15_000);
});

describe("WebSocket request ids (TRN-9)", () => {
  it("rejects a second request with the id of a request that still runs", async () => {
    const { url, probe } = await startWs();
    const raw = new WsSocket(url);
    await new Promise((resolve) => raw.once("open", resolve));
    const frames: Array<{ id: string; type: string; error?: { code: string } }> = [];
    raw.on("message", (data) => frames.push(JSON.parse(String(data))));
    const request = { id: "same", type: "request", method: { service: "t", operation: "hang" }, payload: {} };
    raw.send(JSON.stringify(request));
    await sleep(100);
    raw.send(JSON.stringify(request));
    await sleep(100);
    expect(frames.some((f) => f.type === "error" && f.error?.code === "DUPLICATE_REQUEST")).toBe(true);
    // The first request still has its controller: a cancel stops it
    raw.send(JSON.stringify({ id: "same", type: "cancel" }));
    await sleep(100);
    expect(probe.aborted).toBe(true);
    raw.close();
  }, 10_000);
});

describe("WebSocket heartbeat (TRN-6)", () => {
  it("treats a peer that stops answering as gone: pending calls fail, and the state is not CONNECTED", async () => {
    const http = createServer();
    const wss = new WebSocketServer({ server: http });
    // A dead peer: it reads nothing after the handshake, so no pong and no close frame arrive
    wss.on("connection", (socket) => {
      (socket as unknown as { _socket: { pause(): void } })._socket.pause();
    });
    const port = await listen(http);
    cleanups.push(async () => {
      for (const client of wss.clients) client.terminate();
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      http.closeAllConnections();
      await new Promise<void>((resolve) => http.close(() => resolve()));
    });
    let disconnects = 0;
    const transport = new WebSocketTransport({
      url: `ws://127.0.0.1:${port}`,
      heartbeat: { enabled: true, interval: 50, timeout: 50 },
      reconnect: { enabled: false },
      onDisconnect: () => disconnects++,
    });
    cleanups.push(() => transport.close());
    const client = new Client(transport);
    const started = Date.now();
    await expect(client.call(echo, 1)).rejects.toThrow();
    expect(Date.now() - started).toBeLessThan(3000);
    expect(transport.getState()).not.toBe(WebSocketState.CONNECTED);
    expect(disconnects).toBe(1);
  }, 10_000);
});

describe("WebSocket client waiting for a connection (TRN-14)", () => {
  it("leaves no timer behind for a call that failed during an outage", async () => {
    const transport = new WebSocketTransport({
      url: "ws://127.0.0.1:9/ws",
      heartbeat: { enabled: false },
      connectionTimeout: 30,
      reconnect: { enabled: true, initialDelay: 60_000 },
    });
    cleanups.push(() => transport.close());
    const client: Transport = transport;
    await sleep(100);
    const timers = (): number => process.getActiveResourcesInfo().filter((name) => name === "Timeout").length;
    const before = timers();
    for (let i = 0; i < 5; i++) {
      await expect(new Client(client).call(echo, 1)).rejects.toThrow();
    }
    await sleep(50);
    expect(timers()).toBeLessThanOrEqual(before);
  }, 10_000);
});

describe("HTTP server stop (TRN-15)", () => {
  it("ends an open stream, and leaves a caller-supplied server listening", async () => {
    const { client, transport, probe, http } = await startHttp();
    const iterator = client().stream<unknown, string>({ service: "t", operation: "hang" }, {})[Symbol.asyncIterator]();
    expect((await iterator.next()).value).toBe("first");
    const started = Date.now();
    await transport.stop();
    expect(Date.now() - started).toBeLessThan(2000);
    await sleep(50);
    expect(probe.aborted).toBe(true);
    expect(http.listening).toBe(true);
    await iterator.return?.();
  }, 10_000);
});

describe("WebSocket server disconnect events (TRN-16)", () => {
  it("reports the end of a connection that ended with an error", async () => {
    const { url, wsServer } = await startWs({ maxPayload: 100 });
    let disconnects = 0;
    wsServer.onDisconnect(() => disconnects++);
    const raw = new WsSocket(url);
    await new Promise((resolve) => raw.once("open", resolve));
    raw.on("error", () => undefined);
    raw.send("z".repeat(1000)); // past maxPayload: the server's socket emits an error
    await new Promise((resolve) => raw.once("close", resolve));
    await sleep(50);
    expect(disconnects).toBe(1);
  }, 10_000);
});

describe("CORS with a list of origins", () => {
  it("answers with the one matching origin and Vary: Origin", async () => {
    const { url } = await startHttp({ origin: ["https://a.example", "https://b.example"] });
    const allowed = await fetch(`${url}/t/echo`, { method: "OPTIONS", headers: { Origin: "https://b.example" } });
    expect(allowed.headers.get("access-control-allow-origin")).toBe("https://b.example");
    expect(allowed.headers.get("vary")).toContain("Origin");
    const other = await fetch(`${url}/t/echo`, { method: "OPTIONS", headers: { Origin: "https://evil.example" } });
    expect(other.headers.get("access-control-allow-origin")).toBeNull();
  }, 10_000);
});
