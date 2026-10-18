/**
 * The keep-alive lines of an NDJSON stream over HTTP (WIRE-PROTOCOL.md, "The keep-alive of an
 * NDJSON stream"). The server writes a blank line after each quiet time, and the client skips it.
 * The tests run a real HTTP server with a fake clock, so the times are exact.
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import express from "express";
import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { z } from "zod";
import { fakeClock } from "@mark1russell7/service/testing";
import { createProcedure } from "../../procedures/define.js";
import { createRegistry } from "../../procedures/module.js";
import { ProcedureServer } from "../../server/procedure-server.js";
import { pathToMethod } from "../../server/method.js";
import { Client } from "../../client/client.js";
import type { Message, ResponseItem } from "../../client/types.js";
import { ms, seconds } from "../../duration.js";
import { STREAM_GAP_METADATA_KEY, STREAM_ITEM_METADATA_KEY } from "../sequence.js";
import { HttpServerTransport } from "./server/transport.js";
import type { HttpServerTransportOptions } from "./server/types.js";
import { HttpTransport } from "./client/transport.js";
import { createDefaultHeaderConverter, type HeaderConverter } from "./shared/headers.js";
import { doneLine, feedOf, itemLine, openStream, sleep, type Feed } from "../../../test/streams.js";

let cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup().catch(() => undefined);
  cleanups = [];
  vi.restoreAllMocks();
});

/** A host with the procedure `ka.feed`: a stream of the items of the feed. */
async function startHost(feed: Feed, options: Partial<HttpServerTransportOptions> = {}) {
  const registry = createRegistry({
    name: "ka",
    procedures: [
      createProcedure()
        .path(["ka", "feed"])
        .input(z.object({}))
        .output(z.unknown())
        .meta({ effects: { reads: [], writes: [] } })
        .handler(async function* (_input: unknown, ctx: { signal?: AbortSignal }) {
          yield* feed.items(ctx.signal);
        } as never)
        .build(),
    ],
  });
  const server = new ProcedureServer({ registry });
  server.registerFromRegistry();
  const app = express();
  const http = createServer(app);
  const transport = new HttpServerTransport(server, { app, httpServer: http, ...options });
  server.addTransport(transport);
  await server.start();
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", () => resolve()));
  cleanups.push(async () => {
    await server.stop();
    http.closeAllConnections();
    await new Promise<void>((resolve) => http.close(() => resolve()));
  });
  const base = `http://127.0.0.1:${(http.address() as AddressInfo).port}/api`;
  const openRequests = (): number => (transport as unknown as { handler: { inFlight(): number } }).handler.inFlight();
  return { base, url: `${base}/ka/feed`, transport, openRequests };
}

/** The JSON lines of a body, without the keep-alive lines. */
const framesOf = (text: string): unknown[] => text.split("\n").filter((line) => line !== "").map((line) => JSON.parse(line) as unknown);

describe("the keep-alive lines of HttpServerTransport", () => {
  it("writes a blank line after each quiet time of 15 s, starts the time again at each item, and stops at the end", async () => {
    const clock = fakeClock();
    const feed = feedOf();
    const { url } = await startHost(feed, { clock });
    const stream = openStream(url);
    expect((await stream.head).headers["content-type"]).toBe("application/x-ndjson");

    // Three quiet intervals: three keep-alive lines, and not one before 15 s
    await clock.advance(14_999);
    await sleep(20);
    expect(stream.text).toBe("");
    await clock.advance(30_001);
    await stream.until((text) => text === "\n\n\n", "three keep-alive lines");

    // 10 s later, an item starts the time again: the next line comes 15 s after the item
    await clock.advance(10_000);
    feed.push("a");
    await stream.until((text) => text === `\n\n\n${itemLine(1, "a")}`, "the item");
    await clock.advance(14_999);
    await sleep(20);
    expect(stream.text).toBe(`\n\n\n${itemLine(1, "a")}`);
    await clock.advance(1);
    await stream.until((text) => text === `\n\n\n${itemLine(1, "a")}\n`, "a keep-alive line 15 s after the item");

    feed.push("b");
    feed.end();
    await stream.ended;
    expect(stream.text).toBe(`\n\n\n${itemLine(1, "a")}\n${itemLine(2, "b")}${doneLine(3)}`);
    // No timer stays after the done line
    expect(clock.pending).toBe(0);
  });

  it("writes no keep-alive line after an error, and no timer stays", async () => {
    const clock = fakeClock();
    const feed = feedOf();
    const { url, openRequests } = await startHost(feed, { clock, keepAlive: seconds(1) });
    const stream = openStream(url);
    await stream.head;
    await clock.advance(1000);
    feed.push(1);
    feed.fail(Object.assign(new Error("busy"), { code: "BUSY", retryable: true }));
    await stream.ended;
    expect(stream.text.startsWith("\n")).toBe(true);
    expect(framesOf(stream.text)).toEqual([{ type: "item", seq: 1, payload: 1 }, { type: "error", error: { code: "BUSY", message: "busy", retryable: true } }]);
    expect(clock.pending).toBe(0);
    await clock.advance(10_000);
    expect(openRequests()).toBe(0);
  });

  it("writes no keep-alive line after stop() aborts the stream", async () => {
    const clock = fakeClock();
    const feed = feedOf();
    const { url, transport } = await startHost(feed, { clock, keepAlive: seconds(1) });
    const stream = openStream(url);
    feed.push(1);
    await stream.until((text) => text === itemLine(1, 1), "the item");
    await transport.stop();
    await stream.ended;
    expect(framesOf(stream.text)).toEqual([
      { type: "item", seq: 1, payload: 1 },
      { type: "error", error: { code: "ABORTED", message: "The server stopped the request", retryable: true } },
    ]);
    expect(clock.pending).toBe(0);
    await vi.waitFor(() => expect(feed.returned).toBe(true));
  });

  it("writes no keep-alive line after the client closes the connection, and the handler stops", async () => {
    const clock = fakeClock();
    const feed = feedOf();
    const { url, openRequests } = await startHost(feed, { clock, keepAlive: seconds(1) });
    const stream = openStream(url);
    feed.push(1);
    await stream.until((text) => text === itemLine(1, 1), "the item");
    stream.destroy();
    await vi.waitFor(() => expect(feed.returned).toBe(true));
    await vi.waitFor(() => expect(openRequests()).toBe(0));
    expect(clock.pending).toBe(0);
    await clock.advance(10_000);
    expect(clock.pending).toBe(0);
  });

  it("sends no keep-alive line with keepAlive: false or a duration of zero", async () => {
    for (const keepAlive of [false, ms(0)] as const) {
      const clock = fakeClock();
      const feed = feedOf();
      const { url } = await startHost(feed, { clock, keepAlive });
      const stream = openStream(url);
      await stream.head;
      await clock.advance(10 * 60_000);
      expect(clock.pending).toBe(0);
      feed.push(1);
      feed.end();
      await stream.ended;
      expect(stream.text).toBe(`${itemLine(1, 1)}${doneLine(2)}`);
    }
  });

  it("takes the keep-alive time of the option", async () => {
    const clock = fakeClock();
    const feed = feedOf();
    const { url } = await startHost(feed, { clock, keepAlive: ms(250) });
    const stream = openStream(url);
    await stream.head;
    await clock.advance(1000);
    await stream.until((text) => text === "\n\n\n\n", "four keep-alive lines");
    feed.end();
    await stream.ended;
    expect(stream.text).toBe(`\n\n\n\n${doneLine(1)}`);
  });

  it("refuses a keepAlive that is not a duration when the transport starts", () => {
    const server = new ProcedureServer({ registry: createRegistry() });
    expect(() => new HttpServerTransport(server, { app: express(), keepAlive: 15 as never })).toThrow(/keepAlive must be a duration/);
  });
});

/** A server that writes the chunks of a body one at a time, with a pause between them. */
async function chunkServer(chunks: string[]): Promise<string> {
  const http = createServer((req: IncomingMessage, res) => {
    req.resume();
    req.on("end", async () => {
      res.writeHead(200, { "content-type": "application/x-ndjson" });
      for (const chunk of chunks) {
        res.write(chunk);
        await sleep(5);
      }
      res.end();
    });
  });
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", () => resolve()));
  cleanups.push(async () => {
    http.closeAllConnections();
    await new Promise<void>((resolve) => http.close(() => resolve()));
  });
  return `http://127.0.0.1:${(http.address() as AddressInfo).port}/api`;
}

/** This function reads one call of a transport to its end. */
async function readAll(transport: HttpTransport): Promise<ResponseItem<unknown>[]> {
  const message: Message = { id: "m1", method: pathToMethod(["ka", "feed"]), payload: {}, metadata: {} };
  const items: ResponseItem<unknown>[] = [];
  for await (const item of transport.send(message)) items.push(item);
  return items;
}

describe("the keep-alive lines at HttpTransport", () => {
  it("skips each blank line: the items come in order, with no gap, and each has stream: true", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const second = itemLine(2, "b");
    // Keep-alive lines before, between and after the items: LF, CRLF and spaces, in their own chunks
    const baseUrl = await chunkServer(["\n", itemLine(1, "a"), "\n\n", second.slice(0, 9), second.slice(9), "\r\n", " \t\n", itemLine(3, "c"), "\n", doneLine(4), "\n"]);
    const items = await readAll(new HttpTransport({ baseUrl }));
    expect(items.map((item) => [item.status.type, item.payload])).toEqual([
      ["success", "a"],
      ["success", "b"],
      ["success", "c"],
    ]);
    for (const item of items) {
      expect(item.metadata).toEqual({ [STREAM_ITEM_METADATA_KEY]: true });
      expect(item.metadata).not.toHaveProperty(STREAM_GAP_METADATA_KEY);
    }
    expect(warn).not.toHaveBeenCalled();
  });

  it("removes the keys stream and stream-gap of the peer, also on the error item", async () => {
    const plain = createDefaultHeaderConverter();
    const headerConverter: HeaderConverter = {
      metadataToHeaders: (metadata) => plain.metadataToHeaders(metadata),
      headersToMetadata: (headers) => ({ ...plain.headersToMetadata(headers), [STREAM_ITEM_METADATA_KEY]: "unbounded", [STREAM_GAP_METADATA_KEY]: 9 }),
    };
    const error = `${JSON.stringify({ type: "error", error: { code: "BUSY", message: "busy", retryable: true } })}\n`;
    const baseUrl = await chunkServer([itemLine(1, "a"), "\n", error]);
    const items = await readAll(new HttpTransport({ baseUrl, headerConverter }));
    expect(items.map((item) => [item.status.type, item.metadata])).toEqual([
      ["success", { [STREAM_ITEM_METADATA_KEY]: true }],
      ["error", { [STREAM_ITEM_METADATA_KEY]: true }],
    ]);
  });

  it("reads a stream of HttpServerTransport with keep-alive lines between the items", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const clock = fakeClock();
    const feed = feedOf();
    const { base } = await startHost(feed, { clock, keepAlive: seconds(1) });
    const client = new Client(new HttpTransport({ baseUrl: base }));
    const iterator = client.stream<unknown, number>(pathToMethod(["ka", "feed"]), {})[Symbol.asyncIterator]();
    feed.push(1);
    expect(await iterator.next()).toEqual({ value: 1, done: false });
    // Three keep-alive lines before the next item
    await clock.advance(3000);
    await sleep(20);
    feed.push(2);
    expect(await iterator.next()).toEqual({ value: 2, done: false });
    await clock.advance(2000);
    await sleep(20);
    feed.end();
    expect((await iterator.next()).done).toBe(true);
    expect(warn).not.toHaveBeenCalled();
  });
});
