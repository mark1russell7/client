/**
 * The golden frames of wire protocol v1 (roadmap R25). Each test records the frames of a real
 * exchange and compares them with `test/wire/*.golden.json`. A change of a frame fails here: a
 * change after v1 adds only optional fields, or it makes v2. To accept an intended change,
 * start the tests with `UPDATE_WIRE_GOLDENS=1` and review the diff of the golden files.
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { MessageChannel, type MessagePort } from "node:worker_threads";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { z } from "zod";
import { WebSocket as WsClient, WebSocketServer } from "ws";
import { createProcedure } from "./procedures/define.js";
import { createRegistry } from "./procedures/module.js";
import { ProcedureServer } from "./server/procedure-server.js";
import { pathToMethod } from "./server/method.js";
import { HttpServerTransport } from "./adapters/http/server/transport.js";
import { HttpTransport } from "./adapters/http/client/transport.js";
import { WebSocketServerTransport } from "./adapters/websocket/server/transport.js";
import { WebSocketTransport } from "./adapters/websocket/client/transport.js";
import { PortTransport, type PortLike } from "./adapters/port/transport.js";
import { Client } from "./client/client.js";
import type { Message, Transport } from "./client/types.js";
import { ERROR_CODES, PROTOCOL_VERSION, httpStatusOf } from "./protocol.js";
import { createEventBus } from "./events/bus.js";
import type { EventBus } from "./events/types.js";

const GOLDENS = join(dirname(fileURLToPath(import.meta.url)), "..", "test", "wire");
const UPDATE = process.env["UPDATE_WIRE_GOLDENS"] === "1";

/** This function compares a value with its golden file, or writes the file when asked. */
function golden(name: string, value: unknown): void {
  const file = join(GOLDENS, `${name}.golden.json`);
  const text = `${JSON.stringify(value, null, 2)}\n`;
  if (UPDATE || !existsSync(file)) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
  expect(JSON.parse(text)).toEqual(JSON.parse(readFileSync(file, "utf8")));
}

/** The frames with their ids and the per-call metadata keys replaced, so a run is stable. */
function normalize(frames: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const ids = new Map<string, string>();
  const idOf = (id: unknown): unknown => {
    if (typeof id !== "string" || id === "hello") return id;
    if (!ids.has(id)) ids.set(id, `<id ${ids.size + 1}>`);
    return ids.get(id);
  };
  return frames.map((frame) => {
    const out: Record<string, unknown> = { ...frame, id: idOf(frame["id"]) };
    if (frame["metadata"] && typeof frame["metadata"] === "object") {
      const metadata = { ...(frame["metadata"] as Record<string, unknown>) };
      for (const key of ["idempotency-key", "procedure-timeout", "traceparent", "connectionId", "remoteAddress", "headers"]) {
        if (key in metadata) metadata[key] = `<${key}>`;
      }
      out["metadata"] = metadata;
    }
    return out;
  });
}

function registry() {
  const read = { reads: [], writes: [] };
  return createRegistry({
    name: "wire",
    procedures: [
      createProcedure()
        .path(["wire", "echo"])
        .input(z.object({ text: z.string() }))
        .output(z.object({ text: z.string() }))
        .meta({ effects: read })
        .handler(async (input) => ({ text: input.text }))
        .build(),
      createProcedure()
        .path(["wire", "count"])
        .input(z.object({ to: z.number() }))
        .output(z.number())
        .meta({ effects: read })
        .handler(async function* (input: { to: number }) {
          for (let n = 1; n <= input.to; n++) yield n;
        } as never)
        .build(),
      createProcedure()
        .path(["wire", "write"])
        .input(z.object({}))
        .output(z.boolean())
        .meta({ effects: { writes: ["data"] } })
        .handler(async () => true)
        .build(),
    ],
  });
}

let cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup().catch(() => {});
  cleanups = [];
  vi.restoreAllMocks();
});

/** This function reads one call of a transport to its end: the payload and the metadata of each item. */
async function itemsOf(transport: Transport, method = pathToMethod(["wire", "count"])): Promise<Array<{ payload: unknown; metadata: unknown }>> {
  const message: Message = { id: "m1", method, payload: { to: 4 }, metadata: {} };
  const items: Array<{ payload: unknown; metadata: unknown }> = [];
  for await (const item of transport.send(message)) items.push({ payload: item.payload, metadata: item.metadata });
  return items;
}

/**
 * The frames of a stream with a duplicate, a late frame and a gap. Frame 2 arrives after frame 3,
 * and frame 1 arrives two times. The end frame waits for the first credit of the caller.
 */
const DISORDERED_STREAM = [
  { seq: 1, payload: 1 },
  { seq: 1, payload: 1 },
  { seq: 3, payload: 3 },
  { seq: 2, payload: 2 },
  { seq: 4, payload: 4 },
];

describe("the error codes of protocol v1 (R25)", () => {
  it("each code has its HTTP status", () => {
    golden("error-codes", Object.fromEntries(Object.entries(ERROR_CODES).map(([code, info]) => [code, { http: info.http, retryable: info.retryable }])));
    expect(httpStatusOf("FORBIDDEN")).toBe(403);
    expect(httpStatusOf("SOMETHING_ELSE")).toBeUndefined();
  });
});

describe("the WebSocket frames of protocol v1 (R25)", () => {
  it("the server: hello, a response, a stream, a validation error and a refused write", async () => {
    // A read-only capability refuses the write procedure: FORBIDDEN with its reason
    const server = new ProcedureServer({ registry: registry(), capability: { effects: { writes: [] } } });
    server.registerFromRegistry();
    const http = createServer();
    server.addTransport(new WebSocketServerTransport(server, { server: http, path: "/ws", heartbeat: false }));
    await server.start();
    await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", () => resolve()));
    cleanups.push(async () => {
      await server.stop();
      http.closeAllConnections();
      await new Promise<void>((resolve) => http.close(() => resolve()));
    });
    const socket = new WsClient(`ws://127.0.0.1:${(http.address() as AddressInfo).port}/ws`);
    cleanups.push(async () => socket.terminate());
    const received: Array<Record<string, unknown>> = [];
    socket.on("message", (data) => received.push(JSON.parse(String(data)) as Record<string, unknown>));
    await new Promise((resolve) => socket.once("open", resolve));
    const sent = [
      { id: "hello", type: "hello", protocol: PROTOCOL_VERSION },
      { id: "c1", type: "request", method: pathToMethod(["wire", "echo"]), payload: { text: "hi" }, metadata: {} },
      { id: "c2", type: "request", method: pathToMethod(["wire", "count"]), payload: { to: 2 }, metadata: {}, credit: 64 },
      { id: "c3", type: "request", method: pathToMethod(["wire", "echo"]), payload: { text: 5 }, metadata: {} },
      { id: "c4", type: "request", method: pathToMethod(["wire", "write"]), payload: {}, metadata: {} },
    ];
    for (const frame of sent) {
      socket.send(JSON.stringify(frame));
      // One frame at a time, so the order of the answers is stable
      const before = received.length;
      const until = Date.now() + 2000;
      while (received.length === before && Date.now() < until) await new Promise((resolve) => setTimeout(resolve, 5));
      if (frame.id === "c2") while (received.length < before + 3 && Date.now() < until) await new Promise((resolve) => setTimeout(resolve, 5));
    }
    const messages = received.map((frame) => {
      // The message of a validation error comes from zod: the golden keeps its code only
      if (frame["type"] === "error" && (frame["error"] as { code?: string } | undefined)?.code === "VALIDATION_ERROR") {
        return { ...frame, error: { ...(frame["error"] as object), message: "<message>" }, status: { ...(frame["status"] as object), message: "<message>" } };
      }
      return frame;
    });
    golden("websocket-server", { sent, received: normalize(messages) });
  });

  it("the client: hello, a request with credit, the credit and the cancel of a stream", async () => {
    const http = createServer();
    const wss = new WebSocketServer({ server: http, path: "/ws" });
    const received: Array<Record<string, unknown>> = [];
    wss.on("connection", (socket) => {
      socket.on("message", (data) => {
        const frame = JSON.parse(String(data)) as Record<string, unknown>;
        received.push(frame);
        if (frame["type"] === "hello") socket.send(JSON.stringify({ id: "hello", type: "hello", protocol: PROTOCOL_VERSION }));
        // A stream of 40 items: the client gives credit after 32, then cancels at the 35th. This
        // server is an older peer: its stream frames have no seq, and the client takes them.
        if (frame["type"] === "request") {
          for (let n = 1; n <= 40; n++) socket.send(JSON.stringify({ id: frame["id"], type: "stream", payload: n, stream: { done: false } }));
        }
      });
    });
    await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", () => resolve()));
    cleanups.push(async () => {
      for (const client of wss.clients) client.terminate();
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      http.closeAllConnections();
      await new Promise<void>((resolve) => http.close(() => resolve()));
    });
    const transport = new WebSocketTransport({ url: `ws://127.0.0.1:${(http.address() as AddressInfo).port}/ws`, heartbeat: { enabled: false }, reconnect: { enabled: false } });
    cleanups.push(() => transport.close());
    const client = new Client(transport);
    for await (const item of client.stream<unknown, number>(pathToMethod(["wire", "count"]), { to: 40 })) {
      if (item === 35) break;
    }
    const until = Date.now() + 2000;
    while (!received.some((frame) => frame["type"] === "cancel") && Date.now() < until) await new Promise((resolve) => setTimeout(resolve, 5));
    expect(transport.getServerProtocol()).toBe(PROTOCOL_VERSION);
    golden("websocket-client", normalize(received));
  });

  it("the client: the seq of the stream frames, with a duplicate, a late frame and a gap", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const http = createServer();
    const wss = new WebSocketServer({ server: http, path: "/ws" });
    const sent: Array<Record<string, unknown>> = [];
    const received: Array<Record<string, unknown>> = [];
    wss.on("connection", (socket) => {
      const send = (frame: Record<string, unknown>): void => {
        sent.push(frame);
        socket.send(JSON.stringify(frame));
      };
      socket.on("message", (data) => {
        const frame = JSON.parse(String(data)) as Record<string, unknown>;
        received.push(frame);
        if (frame["type"] === "hello") socket.send(JSON.stringify({ id: "hello", type: "hello", protocol: PROTOCOL_VERSION }));
        if (frame["type"] === "request") {
          for (const step of DISORDERED_STREAM) send({ id: frame["id"], type: "stream", ...step, stream: { done: false } });
        }
        if (frame["type"] === "credit") send({ id: frame["id"], type: "stream", seq: 5, stream: { done: true } });
      });
    });
    await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", () => resolve()));
    cleanups.push(async () => {
      for (const client of wss.clients) client.terminate();
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      http.closeAllConnections();
      await new Promise<void>((resolve) => http.close(() => resolve()));
    });
    // A window of 4: the client gives credit after 2 items. The lost frame 2 counts as read.
    const transport = new WebSocketTransport({ url: `ws://127.0.0.1:${(http.address() as AddressInfo).port}/ws`, heartbeat: { enabled: false }, reconnect: { enabled: false }, streamWindow: 4 });
    cleanups.push(() => transport.close());
    const items = await itemsOf(transport);
    expect(items.map((item) => item.payload)).toEqual([1, 3, 4]);
    golden("websocket-stream-seq", { sent: normalize(sent), items, received: normalize(received) });
  });
});

describe("the message port frames of protocol v1 (R27)", () => {
  it("the frames of a value and of a stream with seq: the frames of WebSocket, as objects", async () => {
    const server = new ProcedureServer({ registry: registry() });
    server.registerFromRegistry();
    const channel = new MessageChannel();
    /** A port that records the frames that its side posts. */
    const recording = (port: MessagePort, frames: unknown[]): PortLike => ({
      postMessage: (frame) => {
        frames.push(frame);
        port.postMessage(frame);
      },
      addEventListener: (type, listener) => port.addEventListener(type, listener),
      removeEventListener: (type, listener) => port.removeEventListener(type, listener),
      start: () => port.start(),
    });
    const fromWorker: Array<Record<string, unknown>> = [];
    const fromPage: Array<Record<string, unknown>> = [];
    const worker = new PortTransport(recording(channel.port1, fromWorker), { serve: server });
    const page = new PortTransport(recording(channel.port2, fromPage));
    cleanups.push(async () => {
      await page.close();
      await worker.close();
      channel.port1.close();
      channel.port2.close();
    });
    const client = new Client(page);
    expect(await client.call(pathToMethod(["wire", "echo"]), { text: "hi" })).toEqual({ text: "hi" });
    expect(await itemsOf(page)).toEqual([1, 2, 3, 4].map((payload) => ({ payload, metadata: {} })));
    golden("port-stream", { page: normalize(fromPage), worker: normalize(fromWorker) });
  });
});

/** A host with the remote events: `orders.*` for each call, and `secret.*` that `allow` refuses. */
function eventHost(bus: EventBus): ProcedureServer {
  return new ProcedureServer({
    registry: createRegistry(),
    events: { bus, topics: ["orders.*", "secret.*"], allow: (topic) => !topic.startsWith("secret.") },
  });
}

/** This function waits until the list has `count` frames, or two seconds pass. */
async function framesUntil(frames: unknown[], count: number): Promise<void> {
  const until = Date.now() + 2000;
  while (frames.length < count && Date.now() < until) await new Promise((resolve) => setTimeout(resolve, 5));
}

describe("the WebSocket frames of the remote events (EVENTS.md, R25)", () => {
  it("the publisher: a subscription, its events with credit, the refusals and the cancel", async () => {
    const bus = createEventBus();
    const server = eventHost(bus);
    const http = createServer();
    server.addTransport(new WebSocketServerTransport(server, { server: http, path: "/ws", heartbeat: false }));
    await server.start();
    await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", () => resolve()));
    cleanups.push(async () => {
      await server.stop();
      http.closeAllConnections();
      await new Promise<void>((resolve) => http.close(() => resolve()));
    });
    const socket = new WsClient(`ws://127.0.0.1:${(http.address() as AddressInfo).port}/ws`);
    cleanups.push(async () => socket.terminate());
    const received: Array<Record<string, unknown>> = [];
    socket.on("message", (data) => received.push(JSON.parse(String(data)) as Record<string, unknown>));
    await new Promise((resolve) => socket.once("open", resolve));
    const method = { service: "events", operation: "subscribe" };
    const sent: Array<Record<string, unknown>> = [];
    const send = (frame: Record<string, unknown>): void => {
      sent.push(frame);
      socket.send(JSON.stringify(frame));
    };

    send({ id: "hello", type: "hello", protocol: PROTOCOL_VERSION });
    await framesUntil(received, 1);
    // A credit of 2: the confirmation and one event. The second event waits for more credit.
    send({ id: "s1", type: "request", method, payload: { topics: ["orders.created"] }, metadata: {}, credit: 2 });
    await framesUntil(received, 2);
    bus.emit("orders.created", { order: 1 });
    bus.emit("orders.created", { order: 2 });
    await framesUntil(received, 3);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(received).toHaveLength(3);
    send({ id: "s1", type: "credit", credit: 2 });
    await framesUntil(received, 4);
    send({ id: "s2", type: "request", method, payload: { topics: ["orders.created", "users.created"] }, metadata: {}, credit: 64 });
    await framesUntil(received, 5);
    send({ id: "s3", type: "request", method, payload: { topics: ["secret.plans"] }, metadata: {}, credit: 64 });
    await framesUntil(received, 6);
    // The cancel has no answer, and the publisher removes its listener
    send({ id: "s1", type: "cancel" });
    const until = Date.now() + 2000;
    while (bus.subscriberCount("orders.created") > 0 && Date.now() < until) await new Promise((resolve) => setTimeout(resolve, 5));
    bus.emit("orders.created", { order: 3 });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(bus.subscriberCount("orders.created")).toBe(0);
    golden("websocket-events-server", { sent, received: normalize(received) });
  });

  it("the subscriber: the request of a subscription with its credit, and the cancel of the unsubscribe", async () => {
    const http = createServer();
    const wss = new WebSocketServer({ server: http, path: "/ws" });
    const received: Array<Record<string, unknown>> = [];
    wss.on("connection", (socket) => {
      socket.on("message", (data) => {
        const frame = JSON.parse(String(data)) as Record<string, unknown>;
        received.push(frame);
        if (frame["type"] === "hello") socket.send(JSON.stringify({ id: "hello", type: "hello", protocol: PROTOCOL_VERSION }));
        if (frame["type"] === "request") {
          const id = frame["id"];
          socket.send(JSON.stringify({ id, type: "stream", payload: { type: "subscribed", topics: ["orders.created"] }, stream: { done: false } }));
          socket.send(JSON.stringify({ id, type: "stream", payload: { type: "event", topic: "orders.created", data: { order: 1 }, seq: 1 }, stream: { done: false } }));
        }
      });
    });
    await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", () => resolve()));
    cleanups.push(async () => {
      for (const client of wss.clients) client.terminate();
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      http.closeAllConnections();
      await new Promise<void>((resolve) => http.close(() => resolve()));
    });
    const transport = new WebSocketTransport({ url: `ws://127.0.0.1:${(http.address() as AddressInfo).port}/ws`, heartbeat: { enabled: false }, reconnect: { enabled: false } });
    cleanups.push(() => transport.close());
    const events: unknown[] = [];
    const unsubscribe = transport.subscribe("orders.created", (data) => void events.push(data));
    await unsubscribe.ready;
    const until = Date.now() + 2000;
    while (events.length === 0 && Date.now() < until) await new Promise((resolve) => setTimeout(resolve, 5));
    unsubscribe();
    await framesUntil(received, 3);
    expect(events).toEqual([{ order: 1 }]);
    golden("websocket-events-client", normalize(received));
  });
});

describe("the HTTP exchange of protocol v1 (R25)", () => {
  it("the remote events: the first lines of a subscription, and the status of each refusal (EVENTS.md)", async () => {
    const bus = createEventBus();
    const server = eventHost(bus);
    const app = express();
    const http = createServer(app);
    server.addTransport(new HttpServerTransport(server, { app, httpServer: http }));
    await server.start();
    await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", () => resolve()));
    cleanups.push(async () => {
      await server.stop();
      http.closeAllConnections();
      await new Promise<void>((resolve) => http.close(() => resolve()));
    });
    const url = `http://127.0.0.1:${(http.address() as AddressInfo).port}/api/events/subscribe`;
    const post = async (body: unknown, accept = "application/x-ndjson, application/json") => {
      const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json", accept }, body: JSON.stringify(body) });
      return { status: response.status, contentType: (response.headers.get("content-type") ?? "").split(";")[0], body: await response.json() };
    };

    // The stream has no end: the test reads two lines, then aborts the request
    const controller = new AbortController();
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/x-ndjson, application/json" },
      body: JSON.stringify({ topics: ["orders.created"] }),
      signal: controller.signal,
    });
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let text = "";
    const lines = (): string[] => text.split("\n").filter((line) => line.length > 0);
    const read = async (count: number): Promise<void> => {
      while (lines().length < count) {
        const { value, done } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
        if (lines().length === 1) bus.emit("orders.created", { order: 1 });
      }
    };
    await read(2);
    controller.abort();
    golden("http-events", {
      stream: { status: response.status, contentType: (response.headers.get("content-type") ?? "").split(";")[0], lines: lines().slice(0, 2).map((line) => JSON.parse(line)) },
      unknownTopic: await post({ topics: ["users.created"] }),
      refusedTopic: await post({ topics: ["secret.plans"] }),
      withoutNdjson: await post({ topics: ["orders.created"] }, "application/json"),
    });
  });

  it("the server: a value, an NDJSON stream and a refused write, with the version header", async () => {
    const server = new ProcedureServer({ registry: registry(), capability: { effects: { writes: [] } } });
    server.registerFromRegistry();
    const app = express();
    const http = createServer(app);
    server.addTransport(new HttpServerTransport(server, { app, httpServer: http }));
    await server.start();
    await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", () => resolve()));
    cleanups.push(async () => {
      await server.stop();
      http.closeAllConnections();
      await new Promise<void>((resolve) => http.close(() => resolve()));
    });
    const base = `http://127.0.0.1:${(http.address() as AddressInfo).port}/api`;
    const exchange = async (path: string, body: unknown, accept = "application/json") => {
      const response = await fetch(`${base}/${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", accept, "procedures-protocol": "1" },
        body: JSON.stringify(body),
      });
      return {
        status: response.status,
        protocol: response.headers.get("procedures-protocol"),
        contentType: (response.headers.get("content-type") ?? "").split(";")[0],
        body: await response.text(),
      };
    };
    const newer = await fetch(`${base}/wire/echo`, { method: "POST", headers: { "content-type": "application/json", "procedures-protocol": "2" }, body: "{}" });
    golden("http-server", {
      value: await exchange("wire/echo", { text: "hi" }),
      stream: await exchange("wire/count", { to: 2 }, "application/x-ndjson, application/json"),
      forbidden: await exchange("wire/write", {}),
      notFound: await exchange("wire/missing", {}),
      newerVersion: { status: newer.status, body: await newer.json() },
    });
  });

  it("the client: the method, the path and the headers of a request", async () => {
    const requests: Array<Record<string, unknown>> = [];
    const http = createServer((req: IncomingMessage, res) => {
      let body = "";
      req.on("data", (chunk: Buffer) => (body += chunk.toString()));
      req.on("end", () => {
        const pick = (name: string): unknown => req.headers[name];
        requests.push({
          method: req.method,
          url: req.url,
          headers: {
            "content-type": pick("content-type"),
            accept: pick("accept"),
            "procedures-protocol": pick("procedures-protocol"),
            "x-metadata": decodeURIComponent(String(pick("x-metadata") ?? "")),
          },
          body,
        });
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ text: "ok" }));
      });
    });
    await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", () => resolve()));
    cleanups.push(async () => {
      http.closeAllConnections();
      await new Promise<void>((resolve) => http.close(() => resolve()));
    });
    const client = new Client(new HttpTransport({ baseUrl: `http://127.0.0.1:${(http.address() as AddressInfo).port}/api` }));
    await client.call(pathToMethod(["wire", "echo"]), { text: "hi" }, { context: { tenant: "a" } });
    golden("http-client", requests);
  });

  it("the client: the seq of the NDJSON lines, with a duplicate, a late line and a gap", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const lines = [...DISORDERED_STREAM.map((step) => ({ type: "item", ...step })), { type: "done", seq: 5 }];
    const http = createServer((req: IncomingMessage, res) => {
      req.resume();
      req.on("end", () => {
        res.setHeader("content-type", "application/x-ndjson");
        res.end(lines.map((line) => `${JSON.stringify(line)}\n`).join(""));
      });
    });
    await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", () => resolve()));
    cleanups.push(async () => {
      http.closeAllConnections();
      await new Promise<void>((resolve) => http.close(() => resolve()));
    });
    const items = await itemsOf(new HttpTransport({ baseUrl: `http://127.0.0.1:${(http.address() as AddressInfo).port}/api` }));
    expect(items.map((item) => item.payload)).toEqual([1, 3, 4]);
    golden("http-stream-seq", { lines, items });
  });
});
