/**
 * The golden frames of wire protocol v1 (roadmap R25). Each test records the frames of a real
 * exchange and compares them with `test/wire/*.golden.json`. A change of a frame fails here: a
 * change after v1 adds only optional fields, or it makes v2. To accept an intended change,
 * start the tests with `UPDATE_WIRE_GOLDENS=1` and review the diff of the golden files.
 */

import { describe, it, expect, afterEach } from "vitest";
import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
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
import { Client } from "./client/client.js";
import { ERROR_CODES, PROTOCOL_VERSION, httpStatusOf } from "./protocol.js";

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
});

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
        // A stream of 40 items: the client gives credit after 32, then cancels at the 35th
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
});

describe("the HTTP exchange of protocol v1 (R25)", () => {
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
});
