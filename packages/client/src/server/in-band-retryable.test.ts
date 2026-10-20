/**
 * The retryable flag of an error of a handler, before and after the start of its stream, on the
 * wire of HTTP and WebSocket (CLI-58, CLI-68, `WIRE-PROTOCOL.md`, section "Error codes"). The first
 * cases send the calls to the server without a client, so they read the NDJSON lines and the frames.
 *
 * - Before the stream starts, an error without a flag gets the flag of its code in `ERROR_CODES`
 *   (`errorResponse`, CLI-48). Thus `UNAVAILABLE` is retryable, and HTTP answers 503.
 * - After the stream starts, the end is in-band: the `error` line of NDJSON (`defaultNdjsonError`)
 *   and the `error` frame of WebSocket (`errorStatus`).
 * - An in-band end without a flag before the first item gets the flag of its code too (CLI-68).
 *   The HTTP status stays 200, because the stream started.
 * - An in-band end without a flag after the first item is not retryable, because a retry can send
 *   the items again (CLI-58). An error with its own flag keeps it.
 *
 * The last cases send the calls with a `Client` and the retry middleware. A stream that fails before
 * its first item goes again, and the caller gets the items of the retry.
 *
 * The procedures host has the same wire cases on its three faces, MCP too, in
 * `client-server/src/host/in-band-retryable.test.ts`.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { z } from "zod";
import { WebSocket as WsClient } from "ws";
import { HttpServerTransport } from "../adapters/http/server/index.js";
import { HttpTransport } from "../adapters/http/client/index.js";
import { WebSocketServerTransport } from "../adapters/websocket/server/transport.js";
import { WebSocketTransport } from "../adapters/websocket/client/transport.js";
import { Client } from "../client/client.js";
import { createRetryMiddleware } from "../client/middleware/retry.js";
import type { Transport } from "../client/types.js";
import { ms } from "../duration.js";
import { createProcedure } from "../procedures/define.js";
import { createRegistry } from "../procedures/module.js";
import type { ProcedureRegistry } from "../procedures/registry.js";
import { ProcedureServer } from "./procedure-server.js";
import { pathToMethod } from "./method.js";

const READS = { reads: [], writes: [] };
/** The effects of a procedure that is not repeatable: the server runs a keyed call of it one time. */
const WRITES = { reads: [], writes: ["rows"] };

/**
 * Where the handler throws: `call` before it gives its stream, `stream` in its stream before the
 * first item, and `item` after the first item.
 */
type At = "call" | "stream" | "item";

/** The input of `test.fail`: where it throws, and the retryable flag of its error. Without `retryable`, the error has no flag. */
interface FailInput {
  readonly at: At;
  readonly retryable?: boolean;
}

/** The end of a call on the wire: the code and the retryable flag of its error, and the count of the items before it. */
interface WireEnd {
  readonly code: string | undefined;
  readonly retryable: boolean | undefined;
  readonly items: number;
}

/** The end of an HTTP call, with its status. */
interface HttpEnd extends WireEnd {
  readonly status: number;
}

/** The end of a WebSocket call. The `error` frame has the flag two times: in `status` and in `error`. */
interface WsEnd extends WireEnd {
  readonly error: { readonly code: string | undefined; readonly retryable: boolean | undefined };
}

/** A case of the rule: the input of the handler, the end on each face, and the HTTP status. */
interface Case {
  readonly name: string;
  readonly input: FailInput;
  readonly end: WireEnd;
  readonly status: number;
}

const CASES: Case[] = [
  {
    name: "an error without a flag before the stream starts gets the flag of its code: UNAVAILABLE is retryable",
    input: { at: "call" },
    end: { code: "UNAVAILABLE", retryable: true, items: 0 },
    status: 503,
  },
  {
    name: "an error without a flag after the first item is not retryable: a retry can send the items again",
    input: { at: "item" },
    end: { code: "UNAVAILABLE", retryable: false, items: 1 },
    status: 200,
  },
  {
    name: "an error with retryable: true after the first item stays retryable",
    input: { at: "item", retryable: true },
    end: { code: "UNAVAILABLE", retryable: true, items: 1 },
    status: 200,
  },
  {
    name: "an error without a flag after the start of the stream and before its first item gets the flag of its code (CLI-68)",
    input: { at: "stream" },
    end: { code: "UNAVAILABLE", retryable: true, items: 0 },
    status: 200,
  },
  {
    name: "an error with retryable: false before the first item stays not retryable: the opt-out of the handler",
    input: { at: "stream", retryable: false },
    end: { code: "UNAVAILABLE", retryable: false, items: 0 },
    status: 200,
  },
];

/** The error of `test.fail`: `UNAVAILABLE`, with the flag of the input, or without a flag. */
function unavailable(input: FailInput): Error {
  return Object.assign(
    new Error(`The storage is not available (${input.at})`),
    { code: "UNAVAILABLE" },
    input.retryable === undefined ? {} : { retryable: input.retryable },
  );
}

/** The handler of `test.fail`. It throws before it gives its stream, or it gives a stream that throws. */
async function fail(input: FailInput) {
  if (input.at === "call") throw unavailable(input);
  return (async function* () {
    if (input.at === "item") yield "row 1";
    throw unavailable(input);
  })();
}

/**
 * The input of `test.flaky` and `test.flakyWrite`: the first `fails` calls with the key fail `at`
 * the place of the input, with the flag of the input. Each later call gives two items.
 */
interface FlakyInput extends FailInput {
  readonly key: string;
  readonly fails: number;
}

/** The count of the calls of `test.flaky` and `test.flakyWrite`, by key. */
const flakyCalls = new Map<string, number>();

/** The handler of `test.flaky` and `test.flakyWrite`. It always gives a stream. */
async function flaky(input: FlakyInput) {
  const call = (flakyCalls.get(input.key) ?? 0) + 1;
  flakyCalls.set(input.key, call);
  return (async function* () {
    if (call <= input.fails) {
      if (input.at === "item") yield `partial ${call}`;
      throw unavailable(input);
    }
    yield `row 1 of call ${call}`;
    yield `row 2 of call ${call}`;
  })();
}

const FLAKY_INPUT = z.object({
  key: z.string(),
  fails: z.number(),
  at: z.enum(["call", "stream", "item"]),
  retryable: z.boolean().optional(),
});

function registryOf(): ProcedureRegistry {
  return createRegistry({
    name: "in-band-retryable",
    procedures: [
      createProcedure()
        .path(["test", "fail"])
        .input(z.object({ at: z.enum(["call", "stream", "item"]), retryable: z.boolean().optional() }))
        .output(z.string())
        .meta({ effects: READS })
        .handler(fail as never)
        .build(),
      createProcedure().path(["test", "flaky"]).input(FLAKY_INPUT).output(z.string()).meta({ effects: READS }).handler(flaky as never).build(),
      createProcedure().path(["test", "flakyWrite"]).input(FLAKY_INPUT).output(z.string()).meta({ effects: WRITES }).handler(flaky as never).build(),
    ],
  });
}

async function listen(http: HttpServer): Promise<number> {
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", () => resolve()));
  return (http.address() as AddressInfo).port;
}

const stops: Array<() => Promise<void>> = [];
let httpPort = 0;
let wsUrl = "";

/** This function stops a server and closes its listener. */
function stopOf(server: ProcedureServer, http: HttpServer): () => Promise<void> {
  return async () => {
    await server.stop();
    http.closeAllConnections();
    await new Promise<void>((resolve) => http.close(() => resolve()));
  };
}

beforeAll(async () => {
  const httpServer = new ProcedureServer({ registry: registryOf(), autoRegister: true });
  const app = express();
  const httpListener = createServer(app);
  httpServer.addTransport(new HttpServerTransport(httpServer, { app, httpServer: httpListener }));
  await httpServer.start();
  httpPort = await listen(httpListener);
  stops.push(stopOf(httpServer, httpListener));

  const wsServer = new ProcedureServer({ registry: registryOf(), autoRegister: true });
  const wsListener = createServer();
  wsServer.addTransport(new WebSocketServerTransport(wsServer, { server: wsListener, path: "/ws", heartbeat: false }));
  await wsServer.start();
  wsUrl = `ws://127.0.0.1:${await listen(wsListener)}/ws`;
  stops.push(stopOf(wsServer, wsListener));
});

afterAll(async () => {
  for (const stop of stops.splice(0).reverse()) await stop().catch(() => undefined);
});

/**
 * The end of a call over HTTP. A stream gives NDJSON lines: the error line, and the count of the
 * item lines before it. Another answer is the JSON body of an error.
 */
async function httpEnd(input: FailInput): Promise<HttpEnd> {
  const response = await fetch(`http://127.0.0.1:${httpPort}/api/test/fail`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/x-ndjson" },
    body: JSON.stringify(input),
  });
  const status = response.status;
  if (!(response.headers.get("content-type") ?? "").includes("ndjson")) {
    const body = (await response.json()) as { code?: string; retryable?: boolean };
    return { code: body.code, retryable: body.retryable, items: 0, status };
  }
  const lines = (await response.text())
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as { type?: string; error?: { code?: string; retryable?: boolean } });
  const error = lines.find((line) => line.type === "error");
  return { code: error?.error?.code, retryable: error?.error?.retryable, items: lines.filter((line) => line.type === "item").length, status };
}

/** A frame of the server, with the fields that the test reads. */
interface Frame {
  readonly id?: string;
  readonly type?: string;
  readonly status?: { readonly code?: string; readonly retryable?: boolean };
  readonly error?: { readonly code?: string; readonly retryable?: boolean };
  readonly stream?: { readonly done?: boolean };
}

/**
 * The end of a call over WebSocket: the frames of the call until its last frame. The `stream`
 * frames with `done: false` are the items. The `error` frame gives the code and the flag.
 */
async function wsEnd(input: FailInput): Promise<WsEnd> {
  const socket = new WsClient(wsUrl);
  try {
    await new Promise<void>((resolve, reject) => {
      socket.once("open", () => resolve());
      socket.once("error", reject);
    });
    const frames: Frame[] = [];
    const ended = new Promise<void>((resolve) => {
      socket.on("message", (data) => {
        const frame = JSON.parse(String(data)) as Frame;
        if (frame.id !== "c1") return;
        frames.push(frame);
        if (frame.type === "error" || frame.type === "response" || frame.stream?.done === true) resolve();
      });
    });
    socket.send(JSON.stringify({ id: "c1", type: "request", method: pathToMethod(["test", "fail"]), payload: input, metadata: {}, credit: 64 }));
    await ended;
    const error = frames.find((frame) => frame.type === "error");
    return {
      code: error?.status?.code,
      retryable: error?.status?.retryable,
      items: frames.filter((frame) => frame.type === "stream" && frame.stream?.done === false).length,
      error: { code: error?.error?.code, retryable: error?.error?.retryable },
    };
  } finally {
    socket.terminate();
  }
}

describe("the retryable flag of an error before and after the start of a stream, on the wire (CLI-58, CLI-68)", () => {
  for (const { name, input, end, status } of CASES) {
    it(name, async () => {
      expect(await httpEnd(input), `HTTP ${JSON.stringify(input)}`).toMatchObject({ ...end, status });
      expect(await wsEnd(input), `WebSocket ${JSON.stringify(input)}`).toMatchObject({ ...end, error: { code: end.code, retryable: end.retryable } });
    });
  }
});

describe("the retryable flag of a stream error for a client without NDJSON (CLI-68)", () => {
  /** The JSON answer of a call without NDJSON: the server reads the whole stream, and gives its last item. */
  async function spongeEnd(input: FailInput): Promise<{ status: number; code?: string; retryable?: boolean }> {
    const response = await fetch(`http://127.0.0.1:${httpPort}/api/test/fail`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(input),
    });
    const body = (await response.json()) as { code?: string; retryable?: boolean };
    return { status: response.status, ...body };
  }

  it("an error before the first item of the stream gets the flag and the status of its code", async () => {
    expect(await spongeEnd({ at: "stream" })).toMatchObject({ status: 503, code: "UNAVAILABLE", retryable: true });
  });

  it("an error after an item of the stream gets false, and thus 500 and not 503", async () => {
    expect(await spongeEnd({ at: "item" })).toMatchObject({ status: 500, code: "UNAVAILABLE", retryable: false });
  });
});

/** The items that a caller reads from a stream, and the code and the flag of the error that ended it. */
interface CallerView {
  readonly items: readonly string[];
  readonly error?: { readonly code: string | undefined; readonly retryable: boolean | undefined };
}

/** A client with the retry middleware: short delays, no jitter and no budget, so the test is fast and exact. */
function retryingClient(transport: Transport) {
  return new Client({ transport, throwOnError: true }).use(createRetryMiddleware({ retryDelay: ms(1), jitter: 0, budget: false }));
}

/** The items of a stream call of a `Client`, and the error that ended it. */
async function readAll(client: ReturnType<typeof retryingClient>, path: readonly string[], input: FlakyInput): Promise<CallerView> {
  const items: string[] = [];
  try {
    for await (const item of client.stream<FlakyInput, string>(pathToMethod(path), input)) items.push(item);
    return { items };
  } catch (error) {
    const { code, retryable } = error as { code?: string; retryable?: boolean };
    return { items, error: { code, retryable } };
  }
}

/** The faces of the retry cases: a `Client` over HTTP with NDJSON, and a `Client` over WebSocket. */
const RETRY_FACES: ReadonlyArray<{ readonly face: string; readonly transport: () => Transport }> = [
  { face: "HTTP", transport: () => new HttpTransport({ baseUrl: `http://127.0.0.1:${httpPort}/api` }) },
  { face: "WebSocket", transport: () => new WebSocketTransport({ url: wsUrl, heartbeat: { enabled: false }, reconnect: { enabled: false } }) },
];

/**
 * The procedures of the retry cases. The server runs `test.flaky` again for each try. The retry
 * gives each try of `test.flakyWrite` one idempotency key, so the server runs it one time for the
 * key, unless the stream ended with a retryable error.
 */
const FLAKY_PATHS: ReadonlyArray<readonly string[]> = [
  ["test", "flaky"],
  ["test", "flakyWrite"],
];

describe("the retry middleware and a stream that fails before its first item (CLI-68)", () => {
  let next = 0;
  /** A new key for each case, so the counts of the calls of the cases do not mix. */
  const keyOf = (name: string): string => `${name}-${++next}`;

  for (const { face, transport: transportOf } of RETRY_FACES) {
    for (const path of FLAKY_PATHS) {
      const label = `${face}, ${path.join(".")}`;

      it(`retries the stream, and the caller gets the items of the retry, not the error (${label})`, async () => {
        const transport = transportOf();
        try {
          const key = keyOf("retry");
          const view = await readAll(retryingClient(transport), path, { key, fails: 1, at: "stream" });
          expect(view).toEqual({ items: ["row 1 of call 2", "row 2 of call 2"] });
          expect(flakyCalls.get(key)).toBe(2);
        } finally {
          await transport.close();
        }
      });

      it(`does not retry the stream after its first item: the caller gets the item and the error (${label})`, async () => {
        const transport = transportOf();
        try {
          const key = keyOf("after-item");
          const view = await readAll(retryingClient(transport), path, { key, fails: 1, at: "item" });
          expect(view).toEqual({ items: ["partial 1"], error: { code: "UNAVAILABLE", retryable: false } });
          expect(flakyCalls.get(key)).toBe(1);
        } finally {
          await transport.close();
        }
      });

      it(`does not retry the stream when the handler gives retryable: false, the opt-out (${label})`, async () => {
        const transport = transportOf();
        try {
          const key = keyOf("opt-out");
          const view = await readAll(retryingClient(transport), path, { key, fails: 1, at: "stream", retryable: false });
          expect(view).toEqual({ items: [], error: { code: "UNAVAILABLE", retryable: false } });
          expect(flakyCalls.get(key)).toBe(1);
        } finally {
          await transport.close();
        }
      });
    }
  }
});
