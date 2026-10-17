/**
 * The sequence numbers of the stream frames (`documentation/WIRE-PROTOCOL.md`). The sender writes
 * `seq` from 1. The receiver drops a duplicate or a late frame, and it reports a gap. The cases run
 * over each transport with stream frames: a message port, WebSocket, and HTTP with NDJSON. A peer
 * without `seq` (an older peer) works as before.
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { MessageChannel } from "node:worker_threads";
import { WebSocketServer } from "ws";
import { z } from "zod";
import type { Message, Transport } from "../client/types.js";
import { Client } from "../client/client.js";
import { createProcedure } from "../procedures/define.js";
import { createRegistry } from "../procedures/module.js";
import { ProcedureServer } from "../server/procedure-server.js";
import { pathToMethod } from "../server/method.js";
import { PROTOCOL_VERSION } from "../protocol.js";
import { PortTransport, type PortLike } from "./port/transport.js";
import { WebSocketTransport } from "./websocket/client/transport.js";
import { HttpTransport } from "./http/client/transport.js";
import { STREAM_GAP_METADATA_KEY, StreamSequence, gapOf, itemMetadata } from "./sequence.js";

/** One stream frame of the fake peer: an item, or the end. A step without `seq` comes from an older peer. */
interface Step {
  seq?: number;
  payload?: unknown;
  done?: true;
}

/** The frames of the fake peer: after the request, and after the first credit of the caller. */
interface Script {
  first: Step[];
  afterCredit?: Step[];
  window?: number;
}

/** What the caller got: the items with their gap, and the frames that it sent after the hello. */
interface Outcome {
  items: Array<{ payload: unknown; gap: number }>;
  sent: Array<Record<string, unknown>>;
}

type Frame = Record<string, unknown>;

let cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup();
  cleanups = [];
  vi.restoreAllMocks();
});

/** The `stream` frame of a step, for a port and for WebSocket. */
function streamFrame(id: unknown, step: Step): Frame {
  const frame: Frame = { id, type: "stream" };
  if (step.seq !== undefined) frame["seq"] = step.seq;
  if (step.done) frame["stream"] = { done: true };
  else Object.assign(frame, { payload: step.payload, stream: { done: false } });
  return frame;
}

/** The NDJSON line of a step. */
function ndjsonLine(step: Step): string {
  const line: Frame = { type: step.done ? "done" : "item" };
  if (step.seq !== undefined) line["seq"] = step.seq;
  if (!step.done) line["payload"] = step.payload;
  return `${JSON.stringify(line)}\n`;
}

/** The fake peer: it answers the request and the first credit with the frames of the script. */
function peer(script: Script, post: (frame: Frame) => void): (frame: Frame) => Frame | undefined {
  let credits = 0;
  return (frame) => {
    if (frame["type"] === "request") for (const step of script.first) post(streamFrame(frame["id"], step));
    if (frame["type"] === "credit" && ++credits === 1) for (const step of script.afterCredit ?? []) post(streamFrame(frame["id"], step));
    return frame;
  };
}

/** This function reads one call to its end, with the gap of each item. */
async function read(transport: Transport): Promise<Outcome["items"]> {
  const message: Message = { id: "m1", method: { service: "seq", operation: "count" }, payload: {}, metadata: {} };
  const items: Outcome["items"] = [];
  for await (const item of transport.send(message)) {
    expect(item.status.type).toBe("success");
    items.push({ payload: item.payload, gap: gapOf(item.metadata) });
  }
  return items;
}

async function overPort(script: Script): Promise<Outcome> {
  const channel = new MessageChannel();
  const sent: Frame[] = [];
  const answer = peer(script, (frame) => channel.port1.postMessage(frame));
  channel.port1.on("message", (frame: Frame) => sent.push(answer(frame)!));
  const transport = new PortTransport(channel.port2, { streamWindow: script.window });
  cleanups.push(async () => {
    await transport.close();
    channel.port1.close();
    channel.port2.close();
  });
  return { items: await read(transport), sent };
}

async function overWebSocket(script: Script): Promise<Outcome> {
  const http = createServer();
  const wss = new WebSocketServer({ server: http, path: "/ws" });
  const sent: Frame[] = [];
  wss.on("connection", (socket) => {
    const answer = peer(script, (frame) => socket.send(JSON.stringify(frame)));
    socket.on("message", (data) => {
      const frame = JSON.parse(String(data)) as Frame;
      if (frame["type"] === "hello") socket.send(JSON.stringify({ id: "hello", type: "hello", protocol: PROTOCOL_VERSION }));
      else sent.push(answer(frame)!);
    });
  });
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", () => resolve()));
  const transport = new WebSocketTransport({
    url: `ws://127.0.0.1:${(http.address() as AddressInfo).port}/ws`,
    heartbeat: { enabled: false },
    reconnect: { enabled: false },
    ...(script.window ? { streamWindow: script.window } : {}),
  });
  cleanups.push(async () => {
    await transport.close();
    for (const client of wss.clients) client.terminate();
    await new Promise<void>((resolve) => wss.close(() => resolve()));
    http.closeAllConnections();
    await new Promise<void>((resolve) => http.close(() => resolve()));
  });
  return { items: await read(transport), sent };
}

async function overHttp(script: Script): Promise<Outcome> {
  const http = createServer((req, res) => {
    req.resume();
    req.on("end", () => {
      res.writeHead(200, { "content-type": "application/x-ndjson" });
      res.end([...script.first, ...(script.afterCredit ?? [])].map(ndjsonLine).join(""));
    });
  });
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", () => resolve()));
  cleanups.push(async () => {
    http.closeAllConnections();
    await new Promise<void>((resolve) => http.close(() => resolve()));
  });
  const transport = new HttpTransport({ baseUrl: `http://127.0.0.1:${(http.address() as AddressInfo).port}/api` });
  return { items: await read(transport), sent: [] };
}

describe("StreamSequence", () => {
  it("gives -1 for a duplicate or a late seq, and the size of a gap", () => {
    const order = new StreamSequence();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect([1, 1, 3, 2, 4, 7, 7].map((seq) => order.next(seq, "c1"))).toEqual([0, -1, 1, -1, 0, 2, -1]);
  });

  it("takes a frame without a valid seq as a frame of an older peer", () => {
    const order = new StreamSequence();
    expect([undefined, 0, -1, 1.5, "2", Number.NaN, null].map((seq) => order.next(seq, "c1"))).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(order.next(1, "c1")).toBe(0);
  });

  it("removes a stream-gap key that the peer sent", () => {
    expect(itemMetadata({ [STREAM_GAP_METADATA_KEY]: 1000, other: 1 }, 0)).toEqual({ other: 1 });
    expect(itemMetadata({ [STREAM_GAP_METADATA_KEY]: 1000 }, 2)).toEqual({ [STREAM_GAP_METADATA_KEY]: 2 });
    expect(itemMetadata(undefined, 0)).toEqual({});
  });
});

describe.each([
  ["a message port", overPort],
  ["WebSocket", overWebSocket],
  ["HTTP with NDJSON", overHttp],
] as const)("the receiver of stream frames over %s", (_name, over) => {
  it("gives one item for a duplicate frame", async () => {
    const { items } = await over({ first: [{ seq: 1, payload: "a" }, { seq: 1, payload: "a" }, { seq: 2, payload: "b" }, { seq: 3, done: true }] });
    expect(items).toEqual([{ payload: "a", gap: 0 }, { payload: "b", gap: 0 }]);
  });

  it("drops an out-of-order frame", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { items } = await over({ first: [{ seq: 1, payload: "a" }, { seq: 3, payload: "c" }, { seq: 2, payload: "b" }, { seq: 4, done: true }] });
    expect(items).toEqual([{ payload: "a", gap: 0 }, { payload: "c", gap: 1 }]);
  });

  it("continues after a gap: the next item has the number of lost frames, and a warning tells it", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { items } = await over({ first: [{ seq: 1, payload: "a" }, { seq: 4, payload: "d" }, { seq: 5, done: true }] });
    expect(items).toEqual([{ payload: "a", gap: 0 }, { payload: "d", gap: 2 }]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("Frames lost before seq 4"));
  });

  it("reports a gap before the end, and ends the stream", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { items } = await over({ first: [{ seq: 1, payload: "a" }, { seq: 3, done: true }] });
    expect(items).toEqual([{ payload: "a", gap: 0 }]);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("takes the frames of an older peer without seq as before: a duplicate gives a second item", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { items } = await over({ first: [{ payload: "a" }, { payload: "a" }, { payload: "b" }, { done: true }] });
    expect(items).toEqual([{ payload: "a", gap: 0 }, { payload: "a", gap: 0 }, { payload: "b", gap: 0 }]);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe.each([
  ["a message port", overPort],
  ["WebSocket", overWebSocket],
] as const)("the credit of a stream with a gap over %s", (_name, over) => {
  it("gives back the credit of the lost frames", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    // A window of 4: the caller gives credit after 2. The 2 lost frames count as read.
    const { items, sent } = await over({ window: 4, first: [{ seq: 1, payload: "a" }, { seq: 4, payload: "d" }], afterCredit: [{ seq: 5, done: true }] });
    expect(items).toEqual([{ payload: "a", gap: 0 }, { payload: "d", gap: 2 }]);
    expect(sent.map((frame) => frame["type"])).toEqual(["request", "credit"]);
    expect(sent[0]!["credit"]).toBe(4);
    expect(sent[1]!["credit"]).toBe(4);
  });
});

describe("the sender of stream frames", () => {
  it("writes seq from 1 in each stream frame and in the end frame of a port", async () => {
    const registry = createRegistry({
      name: "seq",
      procedures: [
        createProcedure()
          .path(["seq", "count"])
          .input(z.object({ to: z.number() }))
          .output(z.number())
          .meta({ effects: { reads: [], writes: [] } })
          .handler(async function* (input: { to: number }) {
            for (let n = 1; n <= input.to; n++) yield n;
          } as never)
          .build(),
      ],
    });
    const server = new ProcedureServer({ registry });
    server.registerFromRegistry();
    const channel = new MessageChannel();
    const posted: Frame[] = [];
    const recording: PortLike = {
      postMessage: (frame) => {
        posted.push(frame as Frame);
        channel.port1.postMessage(frame);
      },
      addEventListener: (type, listener) => channel.port1.addEventListener(type, listener),
      removeEventListener: (type, listener) => channel.port1.removeEventListener(type, listener),
      start: () => channel.port1.start(),
    };
    const worker = new PortTransport(recording, { serve: server });
    const page = new PortTransport(channel.port2);
    cleanups.push(async () => {
      await page.close();
      await worker.close();
      channel.port1.close();
      channel.port2.close();
    });
    const all: number[] = [];
    for await (const n of new Client(page).stream<unknown, number>(pathToMethod(["seq", "count"]), { to: 3 })) all.push(n);
    expect(all).toEqual([1, 2, 3]);
    expect(posted.map((frame) => [frame["seq"], frame["payload"], (frame["stream"] as { done: boolean }).done])).toEqual([
      [1, 1, false],
      [2, 2, false],
      [3, 3, false],
      [4, undefined, true],
    ]);
  });
});
