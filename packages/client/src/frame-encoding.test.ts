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

/** A receiver of the tests: each call gives a new subscriber. */
const receiver = (): object => ({});

/** The cases where the hand encoder can differ from `JSON.stringify`, each at levels 1, 2 and 3 of a frame. */
const CASES = [
  "undefined in an object",
  "undefined in an array",
  "function in an object",
  "function in an array",
  "symbol in an object",
  "symbol in an array",
  "NaN",
  "Infinity",
  "-0",
  "integer key",
  "symbol key",
  "quote",
  "control character",
  "lone surrogate",
  "Date",
  "toJSON",
] as const;
type Case = (typeof CASES)[number];

const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;

function stringCases(text: string, found: Set<Case>): void {
  if (text.includes('"') || text.includes("\\")) found.add("quote");
  if (/[\u0000-\u001f]/.test(text)) found.add("control character");
  if (LONE_SURROGATE.test(text)) found.add("lone surrogate");
}

/** The cases of one value of a level: the value itself, or an element of an array of that level. */
function valueCases(value: unknown, inArray: boolean, found: Set<Case>): void {
  if (value === undefined) found.add(inArray ? "undefined in an array" : "undefined in an object");
  else if (typeof value === "function") found.add(inArray ? "function in an array" : "function in an object");
  else if (typeof value === "symbol") found.add(inArray ? "symbol in an array" : "symbol in an object");
  else if (typeof value === "number") {
    if (Number.isNaN(value)) found.add("NaN");
    else if (!Number.isFinite(value)) found.add("Infinity");
    else if (Object.is(value, -0)) found.add("-0");
  } else if (typeof value === "string") stringCases(value, found);
  else if (value instanceof Date) found.add("Date");
  else if (Array.isArray(value) && !inArray) for (const each of value) valueCases(each, true, found);
}

/** True for an object that a level of the frame holds as a child level. */
function isLevel(value: unknown): value is object {
  return typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof Date);
}

/** The cases that each level of a frame reaches: level 1 is the frame, level 2 its objects, level 3 their objects. */
function levelsOf(frame: object): Array<Set<Case>> {
  const levels = [new Set<Case>(), new Set<Case>(), new Set<Case>()];
  const visit = (object: object, level: number): void => {
    const found = levels[level - 1]!;
    if (typeof (object as { toJSON?: unknown }).toJSON === "function") found.add("toJSON");
    if (Object.getOwnPropertySymbols(object).length > 0) found.add("symbol key");
    for (const key of Object.keys(object)) {
      if (/^(0|[1-9]\d*)$/.test(key)) found.add("integer key");
      stringCases(key, found);
      const value = (object as Record<string, unknown>)[key];
      valueCases(value, false, found);
      for (const child of Array.isArray(value) ? value : [value]) if (level < 3 && isLevel(child)) visit(child, level + 1);
    }
  };
  visit(frame, 1);
  return levels;
}

/** The objects of the levels 1 to 3 of a frame, in arrays too. */
function objectsOf(frame: object): object[] {
  const objects: object[] = [];
  const collect = (value: unknown, level: number): void => {
    if (level > 3 || !isLevel(value)) return;
    objects.push(value);
    for (const child of Object.values(value)) for (const item of Array.isArray(child) ? child : [child]) collect(item, level + 1);
  };
  collect(frame, 1);
  return objects;
}

describe("the text of a frame", () => {
  const strange = fc.constantFrom('"', 'a "b" \\ c', "\u0000\u001f\n\t\b", "\ud800", "a\udc00b", "  ", "é");
  const text = fc.oneof(fc.string(), strange);
  const key = fc.oneof(text, fc.constantFrom("0", "1", "2", "10", "4294967294", "4294967295", "01", "-1", "__proto__"));
  const leaf = fc.oneof(
    text,
    fc.integer(),
    fc.double(),
    fc.boolean(),
    fc.constant(null),
    fc.constantFrom<unknown>(undefined, () => 1, Symbol("s"), Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -0),
    fc.date(),
  );
  /** An object of a level, at times with a symbol key or a `toJSON` method. */
  const objectOf = (child: fc.Arbitrary<unknown>, withToJSON: boolean): fc.Arbitrary<Record<string, unknown>> =>
    fc
      .tuple(fc.dictionary(key, fc.oneof(child, fc.array(child, { maxLength: 3 })), { maxKeys: 5 }), fc.boolean(), fc.integer({ min: 0, max: 7 }))
      .map(([object, symbolKey, roll]) => {
        if (symbolKey) Object.defineProperty(object, Symbol("k"), { value: 1, enumerable: true });
        if (withToJSON && roll === 0) Object.defineProperty(object, "toJSON", { value: (name: string) => ({ name, keys: Object.keys(object) }) });
        return object;
      });
  const level3 = objectOf(leaf, true);
  const level2 = objectOf(fc.oneof(leaf, level3), true);
  const frame = objectOf(fc.oneof(leaf, level2), true);

  it("is byte-equal to JSON.stringify at each level, with any object shared, and reaches each case", () => {
    const reached = new Map<string, number>();
    fc.assert(
      fc.property(frame, fc.nat(), (value, pick) => {
        const objects = objectsOf(value);
        shareEncoding(objects[pick % objects.length], receiver());
        expect(encodeFrame(value)).toBe(JSON.stringify(value));
        // A second frame of the same event reads the stored text
        expect(encodeFrame(value)).toBe(JSON.stringify(value));
        levelsOf(value).forEach((found, index) => {
          for (const each of found) {
            const name = `${each} at level ${index + 1}`;
            reached.set(name, (reached.get(name) ?? 0) + 1);
          }
        });
      }),
      { numRuns: 500, seed: 112 },
    );
    const table = CASES.flatMap((each) => [1, 2, 3].map((level) => `${each} at level ${level}`)).map((name) => [name, reached.get(name) ?? 0] as const);
    if (process.env["FRAME_CASES"]) console.log(table.map(([name, count]) => `${name}: ${count}`).join("\n"));
    expect(table.filter(([, count]) => count === 0).map(([name]) => name)).toEqual([]);
  });

  it("gives a toJSON method its key, as JSON.stringify does", () => {
    const keyed = { toJSON: (name: string) => `key ${name}` };
    const value = { id: "c1", payload: { data: keyed, list: [keyed], deep: { a: { b: keyed } } } };
    expect(encodeFrame(value)).toBe(JSON.stringify(value));
    expect(encodeFrame(value)).toContain('"data":"key data"');
  });

  it("gives a bigint with a toJSON method its key, and throws for a bigint without one", () => {
    const prototype = BigInt.prototype as { toJSON?: (name: string) => string };
    expect(() => encodeFrame({ n: 1n })).toThrow(TypeError);
    prototype.toJSON = function (this: bigint, name: string) {
      return `${name}=${this.toString()}`;
    };
    try {
      const value = { id: "c1", payload: { n: 7n } };
      expect(encodeFrame(value)).toBe(JSON.stringify(value));
    } finally {
      delete prototype.toJSON;
    }
  });

  it("keeps a key __proto__ and an object with no prototype", () => {
    const bare = Object.assign(Object.create(null) as Record<string, unknown>, { a: 1 });
    const value = JSON.parse('{"__proto__":{"x":1},"é\\u2028":2}') as Record<string, unknown>;
    value["bare"] = bare;
    expect(encodeFrame(value)).toBe(JSON.stringify(value));
  });

  it("encodes a shared value once for the receivers of one event", () => {
    const data = { big: "x".repeat(1000) };
    const before = sharedEncodes();
    for (let n = 0; n < 100; n++) encodeFrame({ id: `c${n}`, payload: { data: shareEncoding(data, receiver()) } });
    expect(sharedEncodes() - before).toBe(1);
  });

  it("encodes a changed value again when a receiver gets it again", () => {
    const data = { n: 1 };
    const first = receiver();
    const second = receiver();
    expect(encodeFrame({ data: shareEncoding(data, first) })).toBe('{"data":{"n":1}}');
    expect(encodeFrame({ data: shareEncoding(data, second) })).toBe('{"data":{"n":1}}');
    data.n = 2;
    expect(encodeFrame({ data: shareEncoding(data, first) })).toBe('{"data":{"n":2}}');
    expect(encodeFrame({ data: shareEncoding(data, second) })).toBe('{"data":{"n":2}}');
  });

  it("encodes a changed value again for a new receiver of a later emit (audit 2026-11-08)", () => {
    const data = { n: 1 };
    const [first, late] = [{}, {}];
    expect(encodeFrame({ data: shareEncoding(data, receiver(), first) })).toBe('{"data":{"n":1}}');
    data.n = 2;
    // The late receiver did not get the first emit: before the mark, it got the text of that emit
    expect(encodeFrame({ data: shareEncoding(data, receiver(), late) })).toBe('{"data":{"n":2}}');
    expect(encodeFrame({ data: shareEncoding(data, receiver(), late) })).toBe('{"data":{"n":2}}');
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

/** This function waits until each list has `count` items, for at most 5 seconds. */
async function waitForEach(lists: unknown[][], count: number): Promise<void> {
  const end = Date.now() + 5000;
  while (lists.some((list) => list.length < count) && Date.now() < end) await new Promise((resolve) => setTimeout(resolve, 5));
}

describe.each(faces)("the encodes of one event on $name", (face) => {
  it.each([1, 10, 100])("is 1 with %i subscribers", async (subscribers) => {
    const bus = createEventBus();
    const publisher = new EventPublisher({ bus, topics: ["room.*"] });
    const connect = await face.host(publisher);
    const seen: unknown[][] = [];
    for (let n = 0; n < subscribers; n++) {
      const list: unknown[] = [];
      seen.push(list);
      const unsubscribe = subscribeRemote(connect(), ["room.a"], (data) => void list.push(data));
      cleanups.push(() => unsubscribe());
      await unsubscribe.ready;
    }
    const data = { big: "x".repeat(1000), n: 1 };
    const before = sharedEncodes();
    publisher.publish("room.a", data);
    await waitForEach(seen, 1);
    expect(seen.map((list) => list.map((each) => JSON.stringify(each)))).toEqual(seen.map(() => [JSON.stringify(data)]));
    expect(sharedEncodes() - before).toBe(1);
  });

  it("sends an object that changed and is published again with its new value", async () => {
    const bus = createEventBus();
    const publisher = new EventPublisher({ bus, topics: ["room.*"] });
    const connect = await face.host(publisher);
    const seen: string[][] = [[], []];
    for (const list of seen) {
      const unsubscribe = subscribeRemote(connect(), ["room.a"], (data) => void list.push(JSON.stringify(data)));
      cleanups.push(() => unsubscribe());
      await unsubscribe.ready;
    }
    const data = { n: 1 };
    const before = sharedEncodes();
    publisher.publish("room.a", data);
    await waitForEach(seen, 1);
    data.n = 2;
    publisher.publish("room.a", data);
    await waitForEach(seen, 2);
    expect(seen).toEqual([
      ['{"n":1}', '{"n":2}'],
      ['{"n":1}', '{"n":2}'],
    ]);
    expect(sharedEncodes() - before).toBe(2);
  });

  it("sends the new value of an object published again to a subscriber that joined after the first publish (audit 2026-11-08)", async () => {
    const bus = createEventBus();
    const publisher = new EventPublisher({ bus, topics: ["room.*"] });
    const connect = await face.host(publisher);
    const early: string[] = [];
    const leave = subscribeRemote(connect(), ["room.a"], (data) => void early.push(JSON.stringify(data)));
    await leave.ready;
    const data = { n: 1 };
    publisher.publish("room.a", data);
    await waitForEach([early], 1);
    leave();
    const late: string[] = [];
    const unsubscribe = subscribeRemote(connect(), ["room.a"], (data) => void late.push(JSON.stringify(data)));
    cleanups.push(() => unsubscribe());
    await unsubscribe.ready;
    data.n = 2;
    publisher.publish("room.a", data);
    await waitForEach([late], 1);
    expect({ early, late }).toEqual({ early: ['{"n":1}'], late: ['{"n":2}'] });
  });
});
