/**
 * The retryable flag of an error of a handler, before and after the start of its stream, on the
 * wire of HTTP and WebSocket (CLI-58, `WIRE-PROTOCOL.md`, section "Error codes"). The calls go to
 * the server without a client, so the test reads the NDJSON lines and the frames.
 *
 * - Before the stream starts, an error without a flag gets the flag of its code in `ERROR_CODES`
 *   (`errorResponse`, CLI-48). Thus `UNAVAILABLE` is retryable, and HTTP answers 503.
 * - After the stream starts, the end is in-band: the `error` line of NDJSON (`defaultNdjsonError`)
 *   and the `error` frame of WebSocket (`errorStatus`). An error without a flag is not retryable
 *   there, also when the stream gave no item, because a retry can send the items again.
 * - An error with `retryable: true` stays retryable after the first item.
 *
 * The procedures host has the same cases on its three faces, MCP too, in
 * `client-server/src/host/in-band-retryable.test.ts`.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { z } from "zod";
import { WebSocket as WsClient } from "ws";
import { HttpServerTransport } from "../adapters/http/server/index.js";
import { WebSocketServerTransport } from "../adapters/websocket/server/transport.js";
import { createProcedure } from "../procedures/define.js";
import { createRegistry } from "../procedures/module.js";
import type { ProcedureRegistry } from "../procedures/registry.js";
import { ProcedureServer } from "./procedure-server.js";
import { pathToMethod } from "./method.js";

const READS = { reads: [], writes: [] };

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
    name: "an error without a flag after the start of the stream and before its first item is not retryable: the end is in-band",
    input: { at: "stream" },
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

describe("the retryable flag of an error before and after the start of a stream, on the wire (CLI-58)", () => {
  for (const { name, input, end, status } of CASES) {
    it(name, async () => {
      expect(await httpEnd(input), `HTTP ${JSON.stringify(input)}`).toMatchObject({ ...end, status });
      expect(await wsEnd(input), `WebSocket ${JSON.stringify(input)}`).toMatchObject({ ...end, error: { code: end.code, retryable: end.retryable } });
    });
  }
});
