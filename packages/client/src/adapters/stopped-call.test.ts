/**
 * The end of a call that the stop of a face cuts (`WIRE-PROTOCOL.md`, section "Error codes",
 * CLI-48). Each face ends the call with `UNAVAILABLE`. The handler of a call that writes started,
 * so the call can have had its effect: its flag is `retryable: false`, and the retry middleware
 * does not send it again. A repeatable call keeps `retryable: true`, as on the host, until the
 * first item of its stream: a retry after an item sends the items again. The tests stop
 * the server with `close()`: the stop of the server aborts the calls before it stops each face.
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import * as z from "zod";
import express from "express";
import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { MessageChannel } from "node:worker_threads";
import { Client } from "../client/client.js";
import { createRetryMiddleware } from "../client/middleware/retry.js";
import { createProcedure } from "../procedures/define.js";
import { createRegistry } from "../procedures/module.js";
import { pathToMethod } from "../server/method.js";
import { ProcedureServer } from "../server/procedure-server.js";
import { ms } from "../duration.js";
import { HttpServerTransport } from "./http/server/transport.js";
import { HttpTransport } from "./http/client/transport.js";
import { WebSocketServerTransport } from "./websocket/server/transport.js";
import { WebSocketTransport } from "./websocket/client/transport.js";
import { PortTransport } from "./port/transport.js";
import type { Transport } from "../client/types.js";

/** The effects of a procedure that changes nothing: a second start gives the same state */
const READS = { reads: [], writes: [] };
/** The effects of a procedure that writes: a second start can do the write two times */
const WRITES = { reads: [], writes: ["notes"] };
const feed = pathToMethod(["t", "feed"]);
const watch = pathToMethod(["t", "watch"]);
const wait = pathToMethod(["t", "wait"]);
const look = pathToMethod(["t", "look"]);

let cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup().catch(() => undefined);
  cleanups = [];
  vi.restoreAllMocks();
});

/** The starts of the handlers, and a promise that each start of `t.wait` resolves. */
interface Seen {
  starts: number;
  waiting: Promise<void>;
  waited: () => void;
}

function seenOf(): Seen {
  let waited = (): void => undefined;
  const waiting = new Promise<void>((resolve) => (waited = resolve));
  return { starts: 0, waiting, waited };
}

/** This function waits until the signal aborts. */
const untilAbort = (signal: AbortSignal | undefined): Promise<void> =>
  new Promise((resolve) => {
    if (signal === undefined || signal.aborted) return resolve();
    signal.addEventListener("abort", () => resolve(), { once: true });
  });

/**
 * A server with the streams `t.feed` and `t.watch` (one item, then a wait for the abort), and the
 * calls `t.wait` and `t.look`. The handlers of `t.wait` and `t.look` wait for the abort and then
 * throw, as a handler that obeys its signal does. `t.feed` and `t.wait` write. `t.watch` and
 * `t.look` change nothing, so they are repeatable.
 */
function serverOf(seen: Seen): ProcedureServer {
  const server = new ProcedureServer({
    registry: createRegistry({
      name: "t",
      procedures: [
        ...(["feed", "watch"] as const).map((name) =>
          createProcedure()
            .path(["t", name])
            .input(z.object({}))
            .output(z.number())
            .meta({ effects: name === "feed" ? WRITES : READS })
            .handler(async function* (_input: unknown, ctx: { signal?: AbortSignal }) {
              seen.starts++;
              yield 1;
              await untilAbort(ctx.signal);
            } as never)
            .build(),
        ),
        ...(["wait", "look"] as const).map((name) =>
          createProcedure()
            .path(["t", name])
            .input(z.object({}))
            .output(z.string())
            .meta({ effects: name === "wait" ? WRITES : READS })
            .handler(async (_input, ctx) => {
              seen.starts++;
              seen.waited();
              await untilAbort(ctx.signal);
              ctx.signal?.throwIfAborted();
              return "late";
            })
            .build(),
        ),
      ],
    }),
  });
  server.registerFromRegistry();
  return server;
}

/** A client of the transport with the retry middleware: a retryable end makes a second try. */
const retryingClient = (transport: Transport): Client =>
  new Client({ transport, throwOnError: true }).use(createRetryMiddleware({ retryDelay: ms(1), jitter: 0 }));

async function listen(http: HttpServer): Promise<number> {
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", () => resolve()));
  cleanups.push(async () => {
    http.closeAllConnections();
    await new Promise<void>((resolve) => http.close(() => resolve()));
  });
  return (http.address() as AddressInfo).port;
}

/** This function reads the stream until its error. After the first item, it starts `cut`. */
async function readUntilCut(items: AsyncIterable<unknown>, cut: () => Promise<void>): Promise<{ items: unknown[]; error: unknown; cutting: Promise<void> | undefined }> {
  const seen: unknown[] = [];
  let cutting: Promise<void> | undefined;
  try {
    for await (const item of items) {
      seen.push(item);
      if (seen.length === 1) cutting = cut();
    }
  } catch (error) {
    return { items: seen, error, cutting };
  }
  return { items: seen, error: undefined, cutting };
}

/** This function starts the call, waits for its handler, starts `cut` and gives the error of the call. */
async function errorOfCut(call: Promise<unknown>, seen: Seen, cut: () => Promise<void>): Promise<unknown> {
  const outcome = call.then(() => undefined, (error: unknown) => error);
  await seen.waiting;
  await cut();
  return outcome;
}

/** The error of a call that the stop cut: `ClientError` keeps the flag in its status. */
const STOPPED = { status: { code: "UNAVAILABLE", retryable: false } };
/** The error of a repeatable call that the stop cut: a retry of it is safe. */
const STOPPED_REPEATABLE = { status: { code: "UNAVAILABLE", retryable: true } };

/** A client of the transport without the retry middleware: the test reads the first end. */
const plainClient = (transport: Transport): Client => new Client({ transport, throwOnError: true });

describe("a call that the stop of a face cuts ends with UNAVAILABLE, and a retry only for a repeatable call (CLI-48)", () => {
  describe("the HTTP face", () => {
    /** A server on Express, and a client with a spy fetch that keeps the status of each answer. */
    async function start(seen: Seen) {
      const server = serverOf(seen);
      const app = express();
      const http = createServer(app);
      server.addTransport(new HttpServerTransport(server, { app, httpServer: http }));
      await server.start();
      const port = await listen(http);
      cleanups.push(() => server.stop());
      const statuses: number[] = [];
      const spy: typeof fetch = async (url, init) => {
        const response = await fetch(url, init);
        statuses.push(response.status);
        return response;
      };
      const transport = new HttpTransport({ baseUrl: `http://127.0.0.1:${port}/api`, fetch: spy });
      return { server, client: retryingClient(transport), plain: plainClient(transport), statuses };
    }

    it("ends a stream after its first item with the error line, and sends no second try", async () => {
      const seen = seenOf();
      const { server, client, statuses } = await start(seen);
      const read = await readUntilCut(client.stream(feed, {}), () => server.close());
      await read.cutting;
      expect(read.items).toEqual([1]);
      expect(read.error).toMatchObject(STOPPED);
      expect(statuses).toEqual([200]);
      expect(seen.starts).toBe(1);
    });

    it("ends a repeatable stream after its first item with no retry: a retry sends the items again", async () => {
      const seen = seenOf();
      const { server, client, statuses } = await start(seen);
      const read = await readUntilCut(client.stream(watch, {}), () => server.close());
      await read.cutting;
      expect(read.items).toEqual([1]);
      expect(read.error).toMatchObject(STOPPED);
      expect(statuses).toEqual([200]);
      expect(seen.starts).toBe(1);
    });

    it("ends a call with a value with HTTP 500, and sends no second try", async () => {
      const seen = seenOf();
      const { server, client, statuses } = await start(seen);
      const error = await errorOfCut(client.call(wait, {}), seen, () => server.close());
      expect(error).toMatchObject(STOPPED);
      // UNAVAILABLE with no retry is 500: a 503 invites a retry at the HTTP level (CLI-48)
      expect(statuses).toEqual([500]);
      expect(seen.starts).toBe(1);
    });

    it("ends a repeatable call with HTTP 503 and the retryable flag", async () => {
      const seen = seenOf();
      const { server, plain, statuses } = await start(seen);
      const error = await errorOfCut(plain.call(look, {}), seen, () => server.close());
      expect(error).toMatchObject(STOPPED_REPEATABLE);
      expect(statuses).toEqual([503]);
      expect(seen.starts).toBe(1);
    });
  });

  describe("the WebSocket face", () => {
    async function start(seen: Seen) {
      // The client logs each error frame
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      const server = serverOf(seen);
      const http = createServer();
      server.addTransport(new WebSocketServerTransport(server, { server: http, path: "/ws", heartbeat: false }));
      await server.start();
      const port = await listen(http);
      cleanups.push(() => server.stop());
      const transport = new WebSocketTransport({ url: `ws://127.0.0.1:${port}/ws`, heartbeat: { enabled: false }, reconnect: { enabled: false } });
      cleanups.push(() => transport.close());
      return { server, client: retryingClient(transport), plain: plainClient(transport) };
    }

    it("sends the error frame of a stream before the socket closes", async () => {
      const seen = seenOf();
      const { server, client } = await start(seen);
      const read = await readUntilCut(client.stream(feed, {}), () => server.close());
      await read.cutting;
      expect(read.items).toEqual([1]);
      // Before, the client got CONNECTION_CLOSED: the outcome was not known
      expect(read.error).toMatchObject(STOPPED);
      expect(seen.starts).toBe(1);
    });

    it("sends the error frame of a repeatable stream after its first item with no retry", async () => {
      const seen = seenOf();
      const { server, client } = await start(seen);
      const read = await readUntilCut(client.stream(watch, {}), () => server.close());
      await read.cutting;
      expect(read.items).toEqual([1]);
      expect(read.error).toMatchObject(STOPPED);
      expect(seen.starts).toBe(1);
    });

    it("sends the error frame of a call with a value before the socket closes", async () => {
      const seen = seenOf();
      const { server, client } = await start(seen);
      const error = await errorOfCut(client.call(wait, {}), seen, () => server.close());
      expect(error).toMatchObject(STOPPED);
      expect(seen.starts).toBe(1);
    });

    it("sends the error frame of a repeatable call with the retryable flag", async () => {
      const seen = seenOf();
      const { server, plain } = await start(seen);
      const error = await errorOfCut(plain.call(look, {}), seen, () => server.close());
      expect(error).toMatchObject(STOPPED_REPEATABLE);
      expect(seen.starts).toBe(1);
    });
  });

  describe("the port face", () => {
    function start(seen: Seen) {
      const channel = new MessageChannel();
      const worker = new PortTransport(channel.port1, { serve: serverOf(seen) });
      const page = new PortTransport(channel.port2);
      cleanups.push(async () => {
        await page.close();
        await worker.close();
        channel.port1.close();
        channel.port2.close();
      });
      return { worker, client: retryingClient(page), plain: plainClient(page) };
    }

    it("sends the error of a stream when the side that serves it closes, on an open port", async () => {
      const seen = seenOf();
      const { worker, client } = start(seen);
      const read = await readUntilCut(client.stream(feed, {}), () => worker.close());
      await read.cutting;
      expect(read.items).toEqual([1]);
      // Before, the caller got no frame, and its call waited for its time-out
      expect(read.error).toMatchObject(STOPPED);
      expect(seen.starts).toBe(1);
    });

    it("sends the error of a repeatable stream after its first item with no retry", async () => {
      const seen = seenOf();
      const { worker, client } = start(seen);
      const read = await readUntilCut(client.stream(watch, {}), () => worker.close());
      await read.cutting;
      expect(read.items).toEqual([1]);
      expect(read.error).toMatchObject(STOPPED);
      expect(seen.starts).toBe(1);
    });

    it("sends the error of a call with a value when the side that serves it closes", async () => {
      const seen = seenOf();
      const { worker, client } = start(seen);
      const error = await errorOfCut(client.call(wait, {}), seen, () => worker.close());
      expect(error).toMatchObject(STOPPED);
      expect(seen.starts).toBe(1);
    });

    it("sends the error of a repeatable call with the retryable flag", async () => {
      const seen = seenOf();
      const { worker, plain } = start(seen);
      const error = await errorOfCut(plain.call(look, {}), seen, () => worker.close());
      expect(error).toMatchObject(STOPPED_REPEATABLE);
      expect(seen.starts).toBe(1);
    });
  });
});
