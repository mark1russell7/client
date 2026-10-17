/**
 * `writeNdjsonStream` without Express, on a server of `node:http` (WIRE-PROTOCOL.md). It writes
 * the bytes of `HttpServerTransport`, it waits for a slow reader, it stops when the client goes
 * away or the signal aborts, and `errorOf` gives the error line.
 */

import { describe, it, expect, afterEach } from "vitest";
import express from "express";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { fakeClock } from "@mark1russell7/service/testing";
import { ProcedureRegistry } from "../../../procedures/registry.js";
import { defineProcedure } from "../../../procedures/define.js";
import { outputSchema } from "../../../procedures/core/schemas.js";
import { ProcedureServer } from "../../../server/procedure-server.js";
import { HttpServerTransport } from "./transport.js";
import { writeNdjsonStream } from "./ndjson.js";
import { itemLine, openStream, sleep } from "../../../../test/streams.js";

let cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup().catch(() => undefined);
  cleanups = [];
});

/** A server of `node:http` without Express: each request gets the response of `answer`. */
async function plainServer(answer: (res: ServerResponse) => Promise<void>): Promise<{ url: string; done: Array<Promise<void>> }> {
  const done: Array<Promise<void>> = [];
  const http = createServer((req: IncomingMessage, res) => {
    req.resume();
    req.on("end", () => void done.push(answer(res)));
  });
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", () => resolve()));
  cleanups.push(async () => {
    http.closeAllConnections();
    await new Promise<void>((resolve) => http.close(() => resolve()));
  });
  return { url: `http://127.0.0.1:${(http.address() as AddressInfo).port}/api/s/items`, done };
}

/** A host of `HttpServerTransport` with the procedure `s.items`: the items of `make`. */
async function expressServer(make: () => AsyncIterable<unknown>): Promise<string> {
  const registry = new ProcedureRegistry();
  registry.register(
    defineProcedure({
      path: ["s", "items"],
      input: outputSchema<unknown>(),
      output: outputSchema<unknown>(),
      metadata: { effects: { reads: [], writes: [] } },
      handler: (() => make()) as never,
    }),
  );
  const server = new ProcedureServer({ registry, autoRegister: true });
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
  return `http://127.0.0.1:${(http.address() as AddressInfo).port}/api/s/items`;
}

/** The status, the headers of the protocol and the body of one stream response. */
async function exchange(url: string): Promise<Record<string, unknown>> {
  const stream = openStream(url);
  const head = await stream.head;
  await stream.ended;
  return {
    status: head.status,
    contentType: head.headers["content-type"],
    cacheControl: head.headers["cache-control"],
    protocol: head.headers["procedures-protocol"],
    body: stream.text,
  };
}

/** An iterator whose first item comes at once, and whose next items never come. It counts the calls. */
function quietItems(): { items: AsyncIterable<unknown>; calls: { next: number; returned: number } } {
  const calls = { next: 0, returned: 0 };
  const items: AsyncIterable<unknown> = {
    [Symbol.asyncIterator]: () => ({
      next: () => {
        calls.next++;
        return calls.next === 1 ? Promise.resolve({ value: "first", done: false }) : new Promise<IteratorResult<unknown>>(() => undefined);
      },
      return: () => {
        calls.returned++;
        return Promise.resolve({ value: undefined, done: true });
      },
    }),
  };
  return { items, calls };
}

describe("writeNdjsonStream on node:http", () => {
  it("writes the bytes of HttpServerTransport: each JSON type, the done line and the error line", async () => {
    const failure = (): Error => Object.assign(new Error("busy"), { code: "BUSY", retryable: true });
    const makers: Array<() => AsyncIterable<unknown>> = [
      async function* () {
        yield* [1, "two", { three: [3] }, null, true, 0];
      },
      async function* () {
        yield "first";
        throw failure();
      },
      async function* () {
        throw new Error("before the first item");
      },
    ];
    for (const make of makers) {
      const plain = await plainServer((res) => writeNdjsonStream(res, make()));
      const viaTransport = await exchange(await expressServer(make));
      expect(await exchange(plain.url)).toEqual(viaTransport);
    }
    // The first stream, line by line
    const plain = await plainServer((res) => writeNdjsonStream(res, makers[0]!()));
    expect(await exchange(plain.url)).toEqual({
      status: 200,
      contentType: "application/x-ndjson",
      cacheControl: "no-cache",
      protocol: "1",
      body: [1, "two", { three: [3] }, null, true, 0].map((payload, index) => itemLine(index + 1, payload)).join("") + `${JSON.stringify({ type: "done", seq: 7 })}\n`,
    });
  });

  it("waits for drain: a slow reader keeps the writer from running ahead", async () => {
    const big = "x".repeat(64 * 1024);
    let produced = 0;
    const plain = await plainServer((res) =>
      writeNdjsonStream(
        res,
        (async function* () {
          for (let i = 0; i < 3000; i++) {
            produced++;
            yield big;
          }
        })(),
      ),
    );
    const stream = openStream(plain.url);
    await stream.until((text) => text.length > 0, "the first bytes");
    stream.pause();
    await sleep(500);
    const paused = produced;
    expect(paused).toBeLessThan(200);
    // The reader reads again: the writer goes on
    stream.resume();
    await stream.until(() => produced > paused + 50, "more items after the reader reads again");
    stream.destroy();
    await Promise.all(plain.done);
  }, 15_000);

  it("stops when the client closes the connection, also while the items are quiet", async () => {
    const clock = fakeClock();
    const { items, calls } = quietItems();
    let closeListeners = -1;
    const plain = await plainServer(async (res) => {
      const before = res.listenerCount("close");
      await writeNdjsonStream(res, items, { clock });
      closeListeners = res.listenerCount("close") - before;
    });
    const stream = openStream(plain.url);
    await stream.until((text) => text === itemLine(1, "first"), "the first item");
    stream.destroy();
    await Promise.all(plain.done);
    // The writer did not wait for the quiet item: it ended, the iterator got return(), and no
    // listener and no timer stays
    await sleep(5);
    expect(calls).toEqual({ next: 2, returned: 1 });
    expect(closeListeners).toBe(0);
    expect(clock.pending).toBe(0);
  });

  it("ends the stream with ABORTED when the signal aborts, and the iterator gets return()", async () => {
    const clock = fakeClock();
    const { items, calls } = quietItems();
    const controller = new AbortController();
    const plain = await plainServer((res) => writeNdjsonStream(res, items, { signal: controller.signal, clock }));
    const stream = openStream(plain.url);
    await stream.until((text) => text === itemLine(1, "first"), "the first item");
    controller.abort();
    await stream.ended;
    await Promise.all(plain.done);
    expect(stream.text).toBe(
      itemLine(1, "first") + `${JSON.stringify({ type: "error", error: { code: "ABORTED", message: "The server stopped the request", retryable: true } })}\n`,
    );
    await sleep(5);
    expect(calls.returned).toBe(1);
    expect(clock.pending).toBe(0);
  });

  it("reads no item for a signal that aborted before the start", async () => {
    const { items, calls } = quietItems();
    const plain = await plainServer((res) => writeNdjsonStream(res, items, { signal: AbortSignal.abort() }));
    const result = await exchange(plain.url);
    expect(result["contentType"]).toBe("application/x-ndjson");
    expect(JSON.parse(String(result["body"]))).toMatchObject({ type: "error", error: { code: "ABORTED" } });
    await sleep(5);
    expect(calls).toEqual({ next: 0, returned: 1 });
  });

  it("gives the error line of errorOf, and the default line when errorOf throws", async () => {
    const failing = async function* (): AsyncGenerator<unknown> {
      yield 1;
      throw Object.assign(new Error("db down"), { status: 503 });
    };
    const lastLine = async (answer: (res: ServerResponse) => Promise<void>): Promise<unknown> => {
      const plain = await plainServer(answer);
      const lines = String((await exchange(plain.url))["body"]).trim().split("\n");
      return JSON.parse(lines[lines.length - 1]!);
    };
    const mapped = await lastLine((res) =>
      writeNdjsonStream(res, failing(), {
        errorOf: (error) => ({ code: (error as { status?: number }).status === 503 ? "UNAVAILABLE" : "HANDLER_ERROR", message: `mapped: ${(error as Error).message}`, retryable: true }),
      }),
    );
    expect(mapped).toEqual({ type: "error", error: { code: "UNAVAILABLE", message: "mapped: db down", retryable: true } });
    const byDefault = { type: "error", error: { code: "HANDLER_ERROR", message: "db down", retryable: false } };
    expect(await lastLine((res) => writeNdjsonStream(res, failing()))).toEqual(byDefault);
    const broken = await lastLine((res) =>
      writeNdjsonStream(res, failing(), {
        errorOf: () => {
          throw new Error("errorOf failed");
        },
      }),
    );
    expect(broken).toEqual(byDefault);
  });

  it("starts one timer for each quiet time, not one for each item", async () => {
    const clock = fakeClock();
    let started = 0;
    const counting = { now: () => clock.now(), after: (time: number, run: () => void) => (started++, clock.after(time, run)) };
    const plain = await plainServer((res) =>
      writeNdjsonStream(
        res,
        (async function* () {
          for (let n = 1; n <= 500; n++) yield n;
        })(),
        { clock: counting },
      ),
    );
    const stream = openStream(plain.url);
    await stream.ended;
    expect(stream.text.trim().split("\n")).toHaveLength(501);
    expect(started).toBe(1);
    expect(clock.pending).toBe(0);
  });

  it("writes keep-alive lines on its clock, and none with keepAlive: false", async () => {
    for (const keepAlive of [undefined, false] as const) {
      const clock = fakeClock();
      const { items } = quietItems();
      const controller = new AbortController();
      const plain = await plainServer((res) => writeNdjsonStream(res, items, { clock, signal: controller.signal, ...(keepAlive === false ? { keepAlive } : {}) }));
      const stream = openStream(plain.url);
      await stream.until((text) => text === itemLine(1, "first"), "the first item");
      await clock.advance(30_000);
      if (keepAlive === undefined) await stream.until((text) => text === `${itemLine(1, "first")}\n\n`, "two keep-alive lines");
      else expect(clock.pending).toBe(0);
      controller.abort();
      await stream.ended;
      expect(stream.text.startsWith(keepAlive === undefined ? `${itemLine(1, "first")}\n\n{` : `${itemLine(1, "first")}{`)).toBe(true);
      expect(clock.pending).toBe(0);
    }
  });
});
