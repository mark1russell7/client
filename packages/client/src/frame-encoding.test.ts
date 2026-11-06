/**
 * The encoding of a frame with a shared value (roadmap CLI-112). The gate has no time in it. The text of each frame is
 * byte-equal to `JSON.stringify` of the frame. One event gets one encode at each count of subscribers. This is true on
 * the WebSocket and the NDJSON transports.
 */

import { describe, it, expect, afterEach } from "vitest";
import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import fc from "fast-check";
import type { Transport } from "./client/types.js";
import { HttpTransport } from "./adapters/http/client/index.js";
import { HttpServerTransport } from "./adapters/http/server/index.js";
import { WebSocketTransport } from "./adapters/websocket/client/transport.js";
import { WebSocketServerTransport } from "./adapters/websocket/server/transport.js";
import { createRegistry } from "./procedures/module.js";
import { ProcedureServer } from "./server/procedure-server.js";
import { createEventBus } from "./events/bus.js";
import { EventPublisher } from "./events/publisher.js";
import { subscribeRemote } from "./events/remote.js";
import { encodeFrame, shareEncoding, sharedEncodes } from "./frame-encoding.js";

describe("the text of a frame", () => {
  /** A JSON value, with the values that `JSON.stringify` leaves out or changes. */
  const leaf = fc.oneof(
    fc.string(),
    fc.double(),
    fc.integer(),
    fc.boolean(),
    fc.constant(null),
    fc.constant(undefined),
    fc.constant(() => 1),
    fc.date({ noInvalidDate: true }),
  );
  const value = fc.letrec((tie) => ({
    node: fc.oneof({ depthSize: "small" }, leaf, tie("object"), tie("array")),
    object: fc.dictionary(fc.string(), tie("node"), { maxKeys: 5 }),
    array: fc.array(tie("node"), { maxLength: 5 }),
  })).node;

  it("is byte-equal to JSON.stringify, with any value shared", () => {
    fc.assert(
      fc.property(value, value, fc.boolean(), (payload, data, share) => {
        const item = { type: "event", topic: "t", data: share ? shareEncoding(data) : data, seq: 1, payload };
        const frame = { id: "c1", type: "stream", seq: 1, payload: item, stream: { done: false } };
        expect(encodeFrame(frame)).toBe(JSON.stringify(frame));
        // A second frame with the same shared value reads the stored text
        expect(encodeFrame({ ...frame, id: "c2" })).toBe(JSON.stringify({ ...frame, id: "c2" }));
      }),
      { numRuns: 500 },
    );
  });

  it("gives a toJSON method its key, as JSON.stringify does", () => {
    const keyed = { toJSON: (key: string) => `key ${key}` };
    const frame = { id: "c1", payload: { data: keyed, list: [keyed], deep: { a: { b: keyed } } } };
    expect(encodeFrame(frame)).toBe(JSON.stringify(frame));
    expect(encodeFrame(frame)).toContain('"data":"key data"');
  });

  it("gives a bigint with a toJSON method its key, and throws for a bigint without one", () => {
    const prototype = BigInt.prototype as { toJSON?: (key: string) => string };
    expect(() => encodeFrame({ n: 1n })).toThrow(TypeError);
    prototype.toJSON = function (this: bigint, key: string) {
      return `${key}=${this.toString()}`;
    };
    try {
      const frame = { id: "c1", payload: { n: 7n } };
      expect(encodeFrame(frame)).toBe(JSON.stringify(frame));
    } finally {
      delete prototype.toJSON;
    }
  });

  it("keeps a key __proto__, an object with no prototype and a key with any character", () => {
    const bare = Object.assign(Object.create(null) as Record<string, unknown>, { a: 1 });
    const frame = JSON.parse('{"__proto__":{"x":1},"é\\u2028":2}') as Record<string, unknown>;
    frame["bare"] = bare;
    expect(encodeFrame(frame)).toBe(JSON.stringify(frame));
  });

  it("encodes a shared value once for any count of frames", () => {
    const data = shareEncoding({ big: "x".repeat(1000) });
    const before = sharedEncodes();
    for (let n = 0; n < 100; n++) encodeFrame({ id: `c${n}`, payload: { data } });
    expect(sharedEncodes() - before).toBe(1);
  });
});

let cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const cleanup of cleanups.reverse()) await Promise.resolve(cleanup()).catch(() => {});
  cleanups = [];
});

async function listen(http: HttpServer): Promise<number> {
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", () => resolve()));
  return (http.address() as AddressInfo).port;
}

/** A host of the publisher on one transport, and a function that gives a new client connection. */
interface Face {
  readonly name: string;
  host(publisher: EventPublisher): Promise<() => Transport>;
}

const faces: Face[] = [
  {
    name: "NDJSON",
    async host(publisher) {
      const server = new ProcedureServer({ registry: createRegistry(), autoRegister: true, events: publisher });
      const app = express();
      const http = createServer(app);
      server.addTransport(new HttpServerTransport(server, { app, httpServer: http }));
      await server.start();
      const port = await listen(http);
      cleanups.push(async () => {
        await server.stop();
        http.closeAllConnections();
        await new Promise<void>((resolve) => http.close(() => resolve()));
      });
      return () => new HttpTransport({ baseUrl: `http://127.0.0.1:${port}/api` });
    },
  },
  {
    name: "WebSocket",
    async host(publisher) {
      const server = new ProcedureServer({ registry: createRegistry(), autoRegister: true, events: publisher });
      const http = createServer();
      server.addTransport(new WebSocketServerTransport(server, { server: http, path: "/ws", heartbeat: false }));
      await server.start();
      const port = await listen(http);
      cleanups.push(async () => {
        await server.stop();
        http.closeAllConnections();
        await new Promise<void>((resolve) => http.close(() => resolve()));
      });
      return () => {
        const transport = new WebSocketTransport({ url: `ws://127.0.0.1:${port}/ws`, heartbeat: { enabled: false }, reconnect: { enabled: false } });
        cleanups.push(() => transport.close());
        return transport;
      };
    },
  },
];

describe.each(faces)("the encodes of one event on $name", (face) => {
  it.each([1, 10, 100])("is 1 with %i subscribers", async (subscribers) => {
    const bus = createEventBus();
    const publisher = new EventPublisher({ bus, topics: ["room.*"] });
    const connect = await face.host(publisher);
    const seen: unknown[] = [];
    for (let n = 0; n < subscribers; n++) {
      const unsubscribe = subscribeRemote(connect(), ["room.a"], (data) => void seen.push(data));
      cleanups.push(() => unsubscribe());
      await unsubscribe.ready;
    }
    const data = { big: "x".repeat(1000), n: 1 };
    const before = sharedEncodes();
    publisher.publish("room.a", data);
    const end = Date.now() + 5000;
    while (seen.length < subscribers && Date.now() < end) await new Promise((resolve) => setTimeout(resolve, 5));
    expect(seen).toHaveLength(subscribers);
    expect(seen.every((each) => JSON.stringify(each) === JSON.stringify(data))).toBe(true);
    expect(sharedEncodes() - before).toBe(1);
  });
});
