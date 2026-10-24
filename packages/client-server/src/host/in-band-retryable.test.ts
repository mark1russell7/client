/**
 * The retryable flag of an error of a handler, before and after the start of its stream, on each
 * face of the host (CLI-58, CLI-68, `WIRE-PROTOCOL.md`, section "Error codes").
 *
 * - Before the stream starts, an error without a flag gets the flag of its code in `ERROR_CODES`
 *   (`errorResponse`, CLI-48). Thus `UNAVAILABLE` is retryable, and the HTTP face answers 503.
 * - After the stream starts, the end is in-band: the `error` line of NDJSON, the `error` frame of
 *   WebSocket and the `_meta` of the MCP result.
 * - An in-band end without a flag before the first item gets the flag of its code too (CLI-68).
 *   The HTTP status stays 200, because the stream started.
 * - An in-band end without a flag after the first item is not retryable, because a retry can send
 *   the items again (CLI-58). An error with its own flag keeps it.
 *
 * The bare server has the same cases on the wire of HTTP and WebSocket, in
 * `client/src/server/in-band-retryable.test.ts`. That file also has the cases of the retry middleware.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { z } from "zod";
import { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { service, type Lifecycle, type ServiceBuilder } from "@mark1russell7/service";
import { fakeProcess } from "@mark1russell7/service/testing";
import { Client, WebSocketTransport, createProcedure, createRegistry, ms, pathToMethod, seconds, type ProcedureRegistry } from "@procedures/client";
import { mcpFace } from "@procedures/mcp-server";
import { createProcedureHost, LOCAL_LISTENER_KNOBS } from "./index.js";

const READS = { reads: [], writes: [] };
const FACES = ["http", "ws", "mcp"] as const;
type Face = (typeof FACES)[number];

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

/** The end of a call on a face: the code and the retryable flag of its error, and the count of the items before it. */
interface CallEnd {
  readonly code: string | undefined;
  readonly retryable: boolean | undefined;
  readonly items: number;
  /** The HTTP status: only the HTTP face gives it. */
  readonly status?: number;
}

/** A case of the rule: the input of the handler, the end on each face, and the HTTP status. */
interface Case {
  readonly name: string;
  readonly input: FailInput;
  readonly end: CallEnd;
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

function registryOf(): ProcedureRegistry {
  return createRegistry({
    name: "in-band-retryable-test",
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

/** A service with short stages, as in `drain-cut.test.ts`. */
function serviceOf(name: string): ServiceBuilder {
  return service(name)
    .readiness({ type: "debounce", interval: seconds(5), failAfter: 3, recoverAfter: 1 })
    .liveness({ type: "window", failAfter: seconds(45) })
    .startup(seconds(10))
    .phase("fail readiness", ms(10))
    .phase("stop intake", ms(500))
    .phase("drain", ms(1000))
    .phase("close transports", ms(500))
    .phase("stop the poller", ms(100))
    .phase("tear down dependencies", ms(500))
    .phase("close the health server", ms(100))
    .cooperativeWindow(ms(500))
    .onRepeatSignal("ignore");
}

/**
 * The end of a call of the HTTP face. A stream gives NDJSON lines: the error line, and the count of
 * the item lines before it. Another answer is the JSON body of an error.
 */
async function httpEnd(response: Response): Promise<CallEnd> {
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

const cleanups: Array<() => Promise<unknown> | unknown> = [];
let life: Lifecycle | undefined;
let call: (face: Face, input: FailInput) => Promise<CallEnd> = () => Promise.reject(new Error("The host did not start"));

beforeAll(async () => {
  const name = "in-band-retryable";
  const host = createProcedureHost({
    name,
    registry: registryOf(),
    faces: { http: true, ws: true, mcp: mcpFace({ serverInfo: { name, version: "0.0.0" } }) },
    listen: [{ port: 0, knobs: LOCAL_LISTENER_KNOBS }],
  });
  life = await host.declare(serviceOf(name)).run({ process: fakeProcess() });
  const address = (type: string): string => host.info.endpoints().find((endpoint) => endpoint.type === type)!.address;

  const wsTransport = new WebSocketTransport({ url: address("websocket"), heartbeat: { enabled: false }, reconnect: { enabled: false } });
  cleanups.push(() => wsTransport.close());
  const ws = new Client({ transport: wsTransport, throwOnError: true });
  const mcp = new McpClient({ name: "in-band-retryable-test", version: "0" });
  // The SDK types do not agree with exactOptionalPropertyTypes
  await mcp.connect(new StreamableHTTPClientTransport(new URL(address("mcp"))) as never);
  cleanups.push(() => mcp.close().catch(() => undefined));

  // One function for each face. Each gives the same shape, so the test compares the faces as data.
  const faces: Record<Face, (input: FailInput) => Promise<CallEnd>> = {
    http: async (input) => {
      const response = await fetch(`${address("http")}/test/fail`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/x-ndjson" },
        body: JSON.stringify(input),
      });
      return httpEnd(response);
    },
    ws: async (input) => {
      let items = 0;
      try {
        for await (const _item of ws.stream(pathToMethod(["test", "fail"]), input)) items++;
        return { code: undefined, retryable: undefined, items };
      } catch (error) {
        const { code, retryable } = error as { code?: string; retryable?: boolean };
        return { code, retryable, items };
      }
    },
    mcp: async (input) => {
      const result = (await mcp.callTool({ name: "test.fail", arguments: { ...input } })) as {
        content: Array<{ text: string }>;
        _meta?: { code?: string; retryable?: boolean };
      };
      // Each item is a text block, and the last block of an error is its message
      return { code: result._meta?.code, retryable: result._meta?.retryable, items: result.content.filter((block) => block.text === "row 1").length };
    },
  };
  call = (face, input) => faces[face](input);
}, 20000);

afterAll(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  if (life) {
    await life.shutdown("the test ended");
    await life.done;
  }
}, 20000);

describe("the retryable flag of an error before and after the start of a stream, on each face of the host (CLI-58, CLI-68)", () => {
  for (const { name, input, end, status } of CASES) {
    it(name, async () => {
      for (const face of FACES) {
        const expected = face === "http" ? { ...end, status } : end;
        expect(await call(face, input), `test.fail ${JSON.stringify(input)} on ${face}`).toMatchObject(expected);
      }
    });
  }
});
