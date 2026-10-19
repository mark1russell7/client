/**
 * The end of a call that the shutdown cuts, on each face of the host (CLI-48, decision D4).
 *
 * - A cut after the first item ends the stream in-band with `UNAVAILABLE`, on the HTTP face, the
 *   WebSocket face and the MCP face. The flag `retryable` tells if a retry is safe: false for a
 *   call that can have had its effect. Before, this end had the code `INTERNAL_ERROR`, which the
 *   error registry gives to a bug of the server.
 * - A cut before the first item of a repeatable call stays `UNAVAILABLE` and retryable.
 * - A real failure of a handler keeps its own code: it stays `INTERNAL_ERROR`.
 */

import { describe, it, expect, afterEach } from "vitest";
import { z } from "zod";
import { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { service, type Lifecycle, type ServiceBuilder } from "@mark1russell7/service";
import { fakeClock, fakeProcess } from "@mark1russell7/service/testing";
import { Client, WebSocketTransport, createProcedure, createRegistry, ms, pathToMethod, seconds, type ProcedureRegistry, type ServerResponse } from "@procedures/client";
import { mcpFace } from "@procedures/mcp-server";
import { createProcedureHost, LOCAL_LISTENER_KNOBS, type HostFaceContext } from "./index.js";

const READS = { reads: [], writes: [] };
const WRITES = { reads: [], writes: ["notes"] };
const FACES = ["http", "ws", "mcp"] as const;
type Face = (typeof FACES)[number];

/** The end of a call on a face: the code and the retryable flag of its error, and the count of the items before it. */
interface CallEnd {
  readonly code: string | undefined;
  readonly retryable: boolean | undefined;
  readonly items: number;
}

/** A promise and the function that resolves it. */
interface Mark {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
}

function newMark(): Mark {
  let resolve = (): void => undefined;
  const promise = new Promise<void>((given) => {
    resolve = given;
  });
  return { promise, resolve };
}

/** A promise that resolves at the abort of the signal. */
function aborted(signal: AbortSignal | undefined): Promise<void> {
  return new Promise<void>((resolve) => {
    if (!signal || signal.aborted) return resolve();
    signal.addEventListener("abort", () => resolve(), { once: true });
  });
}

/** The marks of the handlers, by name: the test knows when each call is in flight. */
const marks = new Map<string, Mark>();
function mark(name: string): Mark {
  let found = marks.get(name);
  if (!found) {
    found = newMark();
    marks.set(name, found);
  }
  return found;
}

/** The release of each handler that does not stop at the abort. The cleanup of each test gives it. */
let release = newMark();

/** A stream that gives one row, and then waits until the abort of its call. */
function rowThenAbort(name: string) {
  return async function* (input: { tag: string }, ctx: { signal?: AbortSignal | undefined }) {
    yield "row 1";
    // The face took the first row and asks for the next one
    mark(`${name} ${input.tag}`).resolve();
    await aborted(ctx.signal);
  };
}

/** A unary call that does not stop at the cooperative abort: only the deadline of the drain cuts it. */
function waitForRelease(name: string) {
  return async (input: { tag: string }) => {
    mark(`${name} ${input.tag}`).resolve();
    await release.promise;
    return "late";
  };
}

/**
 * The procedures of the test. Each call gives the name of its face as `tag`.
 * - `test.write` and `test.read` give one row and wait for the abort. `test.write` writes, so a retry of it is not safe.
 * - `test.waitRead` and `test.waitWrite` give no response before the deadline of the drain.
 * - `test.fails` fails after its first row, as a broken storage does.
 */
function registryOf(): ProcedureRegistry {
  const tag = z.object({ tag: z.string() });
  const stream = (name: string, effects: typeof READS | typeof WRITES) =>
    createProcedure().path(["test", name]).input(tag).output(z.string()).meta({ effects }).handler(rowThenAbort(name) as never).build();
  const unary = (name: string, effects: typeof READS | typeof WRITES) =>
    createProcedure().path(["test", name]).input(tag).output(z.string()).meta({ effects }).handler(waitForRelease(name)).build();
  return createRegistry({
    name: "drain-cut-test",
    procedures: [
      stream("write", WRITES),
      stream("read", READS),
      unary("waitRead", READS),
      unary("waitWrite", WRITES),
      createProcedure()
        .path(["test", "fails"])
        .input(tag)
        .output(z.string())
        .meta({ effects: READS })
        .handler(async function* () {
          yield "row 1";
          throw Object.assign(new Error("the storage failed"), { code: "INTERNAL_ERROR" });
        } as never)
        .build(),
    ],
  });
}

/** A service with short stages: the cooperative abort comes 500 ms after the start of the drain, and the deadline 500 ms later. */
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

let cleanups: Array<() => Promise<unknown> | unknown> = [];
const lives: Lifecycle[] = [];
afterEach(async () => {
  release.resolve();
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  for (const life of lives.splice(0)) {
    await life.shutdown("the test ended");
    await life.done;
  }
  marks.clear();
  release = newMark();
});

/** The end of a stream of NDJSON lines: the error line, and the count of the item lines before it. */
async function ndjsonEnd(response: Response): Promise<CallEnd> {
  const lines = (await response.text())
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as { type?: string; error?: { code?: string; retryable?: boolean } });
  const error = lines.find((line) => line.type === "error");
  return { code: error?.error?.code, retryable: error?.error?.retryable, items: lines.filter((line) => line.type === "item").length };
}

/** A host with the three faces under `run()`, and a function that calls a procedure on one face. */
async function runHost(name: string): Promise<{ life: Lifecycle; call: (face: Face, procedure: string) => Promise<CallEnd> }> {
  const host = createProcedureHost({
    name,
    registry: registryOf(),
    faces: { http: true, ws: true, mcp: mcpFace({ serverInfo: { name, version: "0.0.0" } }) },
    listen: [{ port: 0, knobs: LOCAL_LISTENER_KNOBS }],
  });
  const life = await host.declare(serviceOf(name)).run({ process: fakeProcess() });
  lives.push(life);
  const address = (type: string): string => host.info.endpoints().find((endpoint) => endpoint.type === type)!.address;

  const wsTransport = new WebSocketTransport({ url: address("websocket"), heartbeat: { enabled: false }, reconnect: { enabled: false } });
  cleanups.push(() => wsTransport.close());
  const ws = new Client({ transport: wsTransport, throwOnError: true });
  const mcp = new McpClient({ name: "drain-cut-test", version: "0" });
  // The SDK types do not agree with exactOptionalPropertyTypes
  await mcp.connect(new StreamableHTTPClientTransport(new URL(address("mcp"))) as never);
  cleanups.push(() => mcp.close().catch(() => undefined));

  // One function for each face. Each gives the same shape, so the test compares the faces as data.
  const faces: Record<Face, (procedure: string) => Promise<CallEnd>> = {
    http: async (procedure) => {
      const response = await fetch(`${address("http")}/test/${procedure}`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/x-ndjson" },
        body: JSON.stringify({ tag: "http" }),
      });
      return ndjsonEnd(response);
    },
    ws: async (procedure) => {
      let items = 0;
      try {
        for await (const _item of ws.stream(pathToMethod(["test", procedure]), { tag: "ws" })) items++;
        return { code: undefined, retryable: undefined, items };
      } catch (error) {
        const { code, retryable } = error as { code?: string; retryable?: boolean };
        return { code, retryable, items };
      }
    },
    mcp: async (procedure) => {
      const result = (await mcp.callTool({ name: `test.${procedure}`, arguments: { tag: "mcp" } })) as {
        content: Array<{ text: string }>;
        _meta?: { code?: string; retryable?: boolean };
      };
      // Each item is a text block, and the last block of an error is its message
      return { code: result._meta?.code, retryable: result._meta?.retryable, items: result.content.filter((block) => block.text === "row 1").length };
    },
  };
  return { life, call: (face, procedure) => faces[face](procedure) };
}

describe("a call that the shutdown cuts (CLI-48)", () => {
  it("ends a stream cut after its first item in-band with UNAVAILABLE on each face, and its flag tells if a retry is safe", async () => {
    const { life, call } = await runHost("drain-cut");
    const writes = FACES.map((face) => call(face, "write"));
    const reads = FACES.map((face) => call(face, "read"));
    // Each stream gave its first row, and the face asks for the next one
    await Promise.all(FACES.flatMap((face) => [mark(`write ${face}`).promise, mark(`read ${face}`).promise]));
    expect(life.inFlight("drain-cut")).toBe(FACES.length * 2);

    const exited = life.shutdown("the test stops the host");
    const written = await Promise.all(writes);
    const read = await Promise.all(reads);
    await exited;
    await life.done;
    lives.splice(lives.indexOf(life), 1);

    for (const [index, face] of FACES.entries()) {
      // The cooperative abort cut the stream after its first row. The call writes: a retry is not safe.
      expect(written[index], `test.write on ${face}`).toEqual({ code: "UNAVAILABLE", retryable: false, items: 1 });
      // The call only reads: the caller can send it again
      expect(read[index], `test.read on ${face}`).toEqual({ code: "UNAVAILABLE", retryable: true, items: 1 });
    }
  }, 20000);

  it("keeps the code of a real failure of a handler on each face: INTERNAL_ERROR, not UNAVAILABLE", async () => {
    const { call } = await runHost("drain-fails");
    for (const face of FACES) {
      expect(await call(face, "fails"), face).toEqual({ code: "INTERNAL_ERROR", retryable: false, items: 1 });
    }
  }, 20000);

  it("ends a cut before the first item of a repeatable call with UNAVAILABLE and retryable (a fake clock)", async () => {
    const clock = fakeClock();
    // A face of the test: it keeps the handler of the calls, so the test calls the request tracking directly
    let context: HostFaceContext | undefined;
    const host = createProcedureHost({
      name: "pre-head",
      registry: registryOf(),
      clock,
      faces: {
        http: false,
        probe: (given) => {
          context = given;
          return {};
        },
      },
    });
    const life = await host.declare(serviceOf("pre-head")).run({ clock, process: fakeProcess({ clock }) });
    await clock.advance(0);
    const call = (procedure: string): Promise<ServerResponse> =>
      context!.handler.handle({ id: procedure, method: pathToMethod(["test", procedure]), payload: { tag: "probe" }, metadata: {} });
    const waitRead = call("waitRead");
    const waitWrite = call("waitWrite");
    await Promise.all([mark("waitRead probe").promise, mark("waitWrite probe").promise]);
    expect(life.inFlight("pre-head")).toBe(2);

    let exited = false;
    void life.shutdown("the test stops the host").then(() => {
      exited = true;
    });
    // The handlers do not stop at the cooperative abort: the deadline of the drain cuts them
    for (let step = 0; step < 100 && !exited; step++) await clock.advance(100);
    expect(exited).toBe(true);

    // The call only reads, and it gave nothing: the caller can send it again
    expect((await waitRead).status).toMatchObject({ type: "error", code: "UNAVAILABLE", retryable: true });
    // Not changed by CLI-48: before its first item, a call that can have had its effect gets 500,
    // as the runner answers it. Its code is INTERNAL_ERROR, the code of the status 500 in wire v1.
    expect((await waitWrite).status).toMatchObject({ type: "error", code: "INTERNAL_ERROR", retryable: false });
  }, 20000);
});
