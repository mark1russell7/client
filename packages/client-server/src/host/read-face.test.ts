/**
 * A read-only face of a browser next to the full faces of the same host (AG1-B).
 *
 * The host has the full HTTP and WebSocket faces (`/api`, `/ws`), and a second pair with the
 * options `narrowing: { effects: { writes: [] } }` and `expose` (`/rpc/read`, `/rpc/read/ws`).
 * These tests are the evidence of the claim "the server refuses each write of the read face":
 *
 * - A direct call of a writer gets `FORBIDDEN` (`effects-exceeded`), and its handler does not run.
 * - A procedure with no declared effects gets `FORBIDDEN` (`effects-undeclared`).
 * - `client.chain` with a write step is refused, and no write runs. A read step before it runs.
 * - A nested chain with a write step is refused.
 * - A program of `procedure.define` whose body writes is refused through the face.
 * - A narrowing header or key of the caller that asks for writes does not make the face wider.
 * - A path outside the expose rule of the face gets `NOT_FOUND`, also as a nested step of a chain.
 * - The full faces of the same host still let the writes through: the face refuses, not the host.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { z } from "zod";
import { service, type Lifecycle, type ServiceBuilder } from "@mark1russell7/service";
import { fakeProcess } from "@mark1russell7/service/testing";
import {
  Client,
  ClientError,
  NARROWING_HEADER,
  NARROWING_METADATA_KEY,
  WebSocketTransport,
  createProcedure,
  createRegistry,
  ms,
  pathToMethod,
  seconds,
  type CapabilityRequest,
  type ProcedureRegistry,
} from "@procedures/client";
import { createProcedureHost, httpFace, wsFace, LOCAL_LISTENER_KNOBS } from "./index.js";

const READ = ["notes", "read"];
const WRITE = ["notes", "write"];
const LOOSE = ["notes", "loose"];
const HIDDEN = ["admin", "peek"];
const CHAIN = ["client", "chain"];

const READ_ONLY: CapabilityRequest = { effects: { writes: [] } };
const FACE_EXPOSE = ["notes.*", "client.chain", "procedure.get", "procedure.define", "defined.*"];

/** What the handlers did: each read, each write and each other call. */
const log: string[] = [];

/** A registry with a reader, a writer, a procedure without declared effects and a reader outside the face. */
function registryOf(): ProcedureRegistry {
  const reads = { reads: ["notes"], writes: [] };
  return createRegistry({
    name: "read-face-test",
    procedures: [
      createProcedure()
        .path(READ)
        .input(z.object({}).passthrough())
        .output(z.string())
        .meta({ effects: reads })
        .handler(async () => {
          log.push("read");
          return "content";
        })
        .build(),
      createProcedure()
        .path(WRITE)
        .input(z.object({}).passthrough())
        .output(z.string())
        .meta({ effects: { reads: ["notes"], writes: ["notes"] } })
        .handler(async () => {
          log.push("write");
          return "written";
        })
        .build(),
      createProcedure()
        .path(LOOSE)
        .input(z.object({}).passthrough())
        .output(z.string())
        .handler(async () => {
          log.push("loose");
          return "loose";
        })
        .build(),
      createProcedure()
        .path(HIDDEN)
        .input(z.object({}).passthrough())
        .output(z.string())
        .meta({ effects: reads })
        .handler(async () => {
          log.push("peek");
          return "peeked";
        })
        .build(),
    ],
  });
}

/** A service with short stages, so a test shuts it down in a second or two. */
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

/** The end of a call: its value, or its error code and the reason of a refusal. */
type Outcome = { readonly value: unknown } | { readonly code: string; readonly reason?: string | undefined };

/** A caller of one face: a call with an optional narrowing of the caller. */
type Caller = (path: readonly string[], input?: unknown, narrowing?: unknown) => Promise<Outcome>;

/** A caller of an HTTP face: the narrowing of the caller goes in the header `Procedure-Narrowing`. */
function httpCaller(base: string): Caller {
  return async (path, input = {}, narrowing) => {
    const method = pathToMethod(path);
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (narrowing !== undefined) headers[NARROWING_HEADER] = JSON.stringify(narrowing);
    const url = `${base}/${encodeURIComponent(method.service)}/${encodeURIComponent(method.operation)}`;
    const response = await fetch(url, { method: "POST", headers, body: JSON.stringify(input) });
    const text = await response.text();
    const body = text === "" ? undefined : (JSON.parse(text) as unknown);
    if (response.ok) return { value: body };
    const error = body as { code: string; reason?: string };
    return { code: error.code, reason: error.reason };
  };
}

/** A caller of a WebSocket face: the narrowing of the caller goes in the metadata of the frame. */
function wsCaller(client: Client): Caller {
  return async (path, input = {}, narrowing) => {
    try {
      const metadata = narrowing === undefined ? {} : { [NARROWING_METADATA_KEY]: narrowing };
      return { value: await client.call(pathToMethod(path), input, { metadata }) };
    } catch (error) {
      if (!(error instanceof ClientError)) throw error;
      const reason = error.metadata["reason"];
      return { code: error.code, reason: typeof reason === "string" ? reason : undefined };
    }
  };
}

interface Faces {
  readonly full: Caller;
  readonly read: Caller;
}

const cleanups: Array<() => Promise<unknown> | unknown> = [];
let life: Lifecycle | undefined;
const faces: Record<"HTTP" | "WebSocket", Faces> = {} as Record<"HTTP" | "WebSocket", Faces>;

beforeAll(async () => {
  const host = createProcedureHost({
    name: "read-face",
    registry: registryOf(),
    faces: {
      http: true,
      ws: true,
      readHttp: httpFace({ basePath: "/rpc/read", narrowing: READ_ONLY, expose: FACE_EXPOSE }),
      readWs: wsFace({ path: "/rpc/read/ws", narrowing: READ_ONLY, expose: FACE_EXPOSE }),
    },
    listen: [{ port: 0, knobs: LOCAL_LISTENER_KNOBS }],
  });
  life = await host.declare(serviceOf("read-face")).run({ process: fakeProcess() });
  const endpoints = host.info.endpoints();
  const address = (type: string, read: boolean): string =>
    endpoints.find((endpoint) => endpoint.type === type && endpoint.address.includes("/rpc/read") === read)!.address;
  const ws = (url: string): Client => {
    const transport = new WebSocketTransport({ url, heartbeat: { enabled: false }, reconnect: { enabled: false } });
    cleanups.push(() => transport.close());
    return new Client({ transport, throwOnError: true });
  };
  faces.HTTP = { full: httpCaller(address("http", false)), read: httpCaller(address("http", true)) };
  faces.WebSocket = { full: wsCaller(ws(address("websocket", false))), read: wsCaller(ws(address("websocket", true))) };
}, 20000);

afterAll(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  if (life) {
    await life.shutdown("the test ended");
    await life.done;
  }
});

/** This function runs a call and gives the entries that the handlers added to the log during it. */
async function logged(call: () => Promise<Outcome>): Promise<{ outcome: Outcome; ran: string[] }> {
  const start = log.length;
  const outcome = await call();
  return { outcome, ran: log.slice(start) };
}

describe.each(["HTTP", "WebSocket"] as const)("a read-only face of the %s face (AG1-B)", (kind) => {
  it("refuses a direct call of a writer with effects-exceeded, and the handler does not run", async () => {
    const { read } = faces[kind];
    expect(await logged(() => read(WRITE))).toEqual({ outcome: { code: "FORBIDDEN", reason: "effects-exceeded" }, ran: [] });
  });

  it("refuses a procedure without declared effects with effects-undeclared", async () => {
    const { read } = faces[kind];
    expect(await logged(() => read(LOOSE))).toEqual({ outcome: { code: "FORBIDDEN", reason: "effects-undeclared" }, ran: [] });
  });

  it("serves a reader inside the expose rule of the face", async () => {
    const { read } = faces[kind];
    expect(await logged(() => read(READ))).toEqual({ outcome: { value: "content" }, ran: ["read"] });
  });

  it("refuses client.chain with a write step: the read step before it runs, and no write runs", async () => {
    const { read } = faces[kind];
    const steps = [
      { $proc: READ, input: {} },
      { $proc: WRITE, input: {} },
    ];
    const { outcome, ran } = await logged(() => read(CHAIN, { steps }));
    expect(outcome).toMatchObject({ code: "FORBIDDEN" });
    expect(ran).toEqual(["read"]);
  });

  it("refuses a nested chain with a write step inside", async () => {
    const { read } = faces[kind];
    const steps = [{ $proc: CHAIN, input: { steps: [{ $proc: WRITE, input: {} }] } }];
    const { outcome, ran } = await logged(() => read(CHAIN, { steps }));
    expect(outcome).toMatchObject({ code: "FORBIDDEN" });
    expect(ran).toEqual([]);
  });

  it("refuses procedure.define, and a program of procedure.define whose body writes", async () => {
    const { full, read } = faces[kind];
    const prefix = kind === "HTTP" ? "http" : "ws";
    // The read face cannot define a program: procedure.define changes the registry
    const define = (path: string[], aggregation: unknown) => ({ path, aggregation });
    expect(await read(["procedure", "define"], define(["defined", `${prefix}Refused`], { $proc: READ, input: {} }))).toMatchObject({ code: "FORBIDDEN" });
    // The full face defines a writer and a reader
    expect(await full(["procedure", "define"], define(["defined", `${prefix}Write`], { $proc: WRITE, input: {} }))).toHaveProperty("value");
    expect(await full(["procedure", "define"], define(["defined", `${prefix}Read`], { $proc: READ, input: {} }))).toHaveProperty("value");
    const written = await logged(() => read(["defined", `${prefix}Write`]));
    expect(written.outcome).toMatchObject({ code: "FORBIDDEN" });
    expect(written.ran).toEqual([]);
    expect(await logged(() => read(["defined", `${prefix}Read`]))).toEqual({ outcome: { value: "content" }, ran: ["read"] });
  });

  it("does not let a narrowing of the caller make the face wider", async () => {
    const { read } = faces[kind];
    const wider = { effects: { reads: "any", writes: "any", destructive: true } };
    expect(await logged(() => read(WRITE, {}, wider))).toEqual({ outcome: { code: "FORBIDDEN", reason: "effects-exceeded" }, ran: [] });
    expect(await logged(() => read(WRITE, {}, [wider, wider]))).toEqual({ outcome: { code: "FORBIDDEN", reason: "effects-exceeded" }, ran: [] });
    const steps = [{ $proc: WRITE, input: {} }];
    const chained = await logged(() => read(CHAIN, { steps }, wider));
    expect(chained.outcome).toMatchObject({ code: "FORBIDDEN" });
    expect(chained.ran).toEqual([]);
  });

  it("refuses a path outside the expose rule of the face, as a call and as a nested step of a chain", async () => {
    const { read } = faces[kind];
    expect(await logged(() => read(HIDDEN))).toEqual({ outcome: { code: "NOT_FOUND", reason: undefined }, ran: [] });
    // The host procedures are outside the rule too: the rule of the face applies to each procedure
    expect(await read(["host", "info"])).toMatchObject({ code: "NOT_FOUND" });
    const nested = await logged(() => read(CHAIN, { steps: [{ $proc: HIDDEN, input: {} }] }));
    expect(nested.outcome).not.toHaveProperty("value");
    expect(nested.ran).toEqual([]);
    // procedure.get does not describe a procedure outside the rule
    expect(await read(["procedure", "get"], { path: HIDDEN })).not.toHaveProperty("value");
    expect(await read(["procedure", "get"], { path: READ })).toMatchObject({ value: { key: "notes.read" } });
    // A chain of steps inside the rule runs
    expect(await logged(() => read(CHAIN, { steps: [{ $proc: READ, input: {} }] }))).toMatchObject({ ran: ["read"] });
  });

  it("leaves the full face of the same host open: the face refuses, not the host", async () => {
    const { full } = faces[kind];
    expect(await logged(() => full(WRITE))).toEqual({ outcome: { value: "written" }, ran: ["write"] });
    expect(await logged(() => full(LOOSE))).toEqual({ outcome: { value: "loose" }, ran: ["loose"] });
    expect(await logged(() => full(HIDDEN))).toEqual({ outcome: { value: "peeked" }, ran: ["peek"] });
    const steps = [{ $proc: READ, input: {} }, { $proc: CHAIN, input: { steps: [{ $proc: WRITE, input: {} }] } }, { $proc: HIDDEN, input: {} }];
    const chained = await logged(() => full(CHAIN, { steps }));
    expect(chained.outcome).toHaveProperty("value");
    expect(chained.ran).toEqual(["read", "write", "peek"]);
    expect(await full(["host", "info"])).toHaveProperty("value");
  });
});

describe("the options of the read-only face (AG1-B)", () => {
  it("stop the factory for a narrowing that is not valid", () => {
    const bad = { efects: { writes: [] } } as unknown as CapabilityRequest;
    expect(() => createProcedureHost({ registry: createRegistry(), faces: { read: httpFace({ narrowing: bad }) } })).toThrow(/narrowing of the HTTP face is not valid/);
    expect(() => createProcedureHost({ registry: createRegistry(), faces: { read: wsFace({ narrowing: bad }) } })).toThrow(/narrowing of the WebSocket face is not valid/);
  });
});
