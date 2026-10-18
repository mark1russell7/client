/**
 * The narrowing key of the wire (CLI-30): a call asks for a narrower capability than its
 * principal holds. Each face carries the key: the HTTP header and `X-Metadata`, the metadata of a
 * WebSocket frame, and the metadata or the option `narrow` of a call in the process. The server
 * applies it after the request hook, with the meet of the clearance order, so a key can only
 * narrow. A part that asks for more has no effect and goes to the debug reports.
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { createServer, request, type IncomingMessage, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { z } from "zod";
import { Client } from "../client/client.js";
import { HttpTransport } from "../adapters/http/client/index.js";
import { WebSocketTransport } from "../adapters/websocket/client/transport.js";
import { LocalTransport } from "../adapters/local/client/transport.js";
import { procedureHandler } from "../adapters/http/server/handler.js";
import { upgradeHandler } from "../adapters/websocket/server/upgrade.js";
import { DEFAULT_CORS_HEADERS } from "../adapters/http/server/cors.js";
import { defaultKeyGenerator } from "../client/middleware/cache.js";
import { createProcedure } from "../procedures/define.js";
import { createRegistry } from "../procedures/module.js";
import { ladder } from "../procedures/capability.js";
import { invokePath, type Interceptor } from "../procedures/invoke.js";
import { NARROWING_HEADER, NARROWING_METADATA_KEY, addNarrowing, narrowWithin, narrowingOf } from "../procedures/narrowing.js";
import type { CapabilityRequest, ClearanceOrder } from "../procedures/types.js";
import { ProcedureServer, type ProcedureServerOptions } from "./procedure-server.js";
import { pathToMethod } from "./method.js";
import type { PrincipalOf, ServerDebugReport } from "./types.js";

type Audience = "public" | "guest" | "intimate";
const AUDIENCES: readonly Audience[] = ["public", "guest", "intimate"];
const ORDER = ladder(AUDIENCES);

const READ = ["notes", "read"];
const DIARY = ["diary", "read"];
const WRITE = ["notes", "write"];
const NESTED = ["notes", "nested"];

function registry() {
  return createRegistry({
    name: "narrowing",
    procedures: [
      createProcedure()
        .path(READ)
        .input(z.object({}))
        .output(z.unknown())
        .meta({ effects: { reads: ["world"], writes: [] } })
        .handler(async (_input, ctx) => ({
          clearance: ctx.capability.clearance ?? null,
          writes: ctx.capability.effects?.writes ?? null,
          deadline: ctx.capability.deadline ?? null,
        }))
        .build(),
      createProcedure()
        .path(DIARY)
        .input(z.object({}))
        .output(z.string())
        .meta({ effects: { reads: ["diary"], writes: [] } })
        .handler(async () => "secret")
        .build(),
      createProcedure()
        .path(WRITE)
        .input(z.object({}))
        .output(z.string())
        .meta({ effects: { reads: [], writes: ["notes"] } })
        .handler(async () => "written")
        .build(),
      createProcedure()
        .path(NESTED)
        .input(z.object({}))
        .output(z.unknown())
        .meta({ effects: { reads: ["world"], writes: [] }, calls: ["notes.read"] })
        .handler(async (_input, ctx) => ctx.client.call(READ, {}))
        .build(),
    ],
  });
}

/**
 * The gate of jarvis, as an interceptor: below "intimate", a call reads only the world. This is
 * the policy of the application, not of the framework. The narrowing key only lowers the clearance.
 */
const audienceGate: Interceptor = (invocation, next) =>
  invocation.capability.clearance === undefined || invocation.capability.clearance === "intimate"
    ? next()
    : next({ capability: { effects: { reads: ["world"] } } });

const BASE: ProcedureServerOptions = { capability: { clearance: "intimate" }, clearanceOrder: ORDER, interceptors: [audienceGate] };

let cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup();
  cleanups = [];
});

async function listen(http: HttpServer): Promise<number> {
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", () => resolve()));
  cleanups.push(async () => {
    http.closeAllConnections();
    await new Promise<void>((resolve) => http.close(() => resolve()));
  });
  return (http.address() as AddressInfo).port;
}

function serverOf(options: ProcedureServerOptions, reports: ServerDebugReport[]): ProcedureServer {
  const server = new ProcedureServer({ registry: registry(), ...options, debug: (report) => reports.push(report) });
  server.registerFromRegistry();
  return server;
}

/** One POST over HTTP with any headers: the status and the body. */
function post(port: number, path: string, headers: Record<string, string | string[]> = {}, body = "{}"): Promise<{ status: number; body: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, method: "POST", path, headers: { "content-type": "application/json", ...headers } }, (res: IncomingMessage) => {
      let text = "";
      res.setEncoding("utf8");
      res.on("data", (chunk: string) => (text += chunk));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: JSON.parse(text) as Record<string, unknown> }));
    });
    req.on("error", reject);
    req.end(body);
  });
}

/** The value of a call, or the code of its error. With `narrowing`, the call sends the narrowing key. */
async function outcome(client: Client, path: string[], narrowing?: unknown): Promise<unknown> {
  const options = narrowing === undefined ? {} : { metadata: { [NARROWING_METADATA_KEY]: narrowing } };
  try {
    return await client.call(pathToMethod(path), {}, options);
  } catch (error) {
    return { code: (error as { code?: unknown }).code };
  }
}

interface Face {
  name: string;
  /** True when the face has a server, so the debug reports of the server exist. */
  reports: boolean;
  client(options: ProcedureServerOptions, reports: ServerDebugReport[]): Promise<Client>;
}

const faces: Face[] = [
  {
    name: "LocalTransport",
    reports: false,
    async client(options) {
      const capability = typeof options.capability === "function" ? undefined : options.capability;
      const transport = new LocalTransport({
        registry: registry(),
        ...(capability ? { capability } : {}),
        ...(options.clearanceOrder ? { clearanceOrder: options.clearanceOrder } : {}),
        ...(options.interceptors ? { interceptors: options.interceptors } : {}),
      });
      return new Client({ transport, throwOnError: true });
    },
  },
  {
    name: "HTTP",
    reports: true,
    async client(options, reports) {
      const handler = procedureHandler(serverOf(options, reports));
      const port = await listen(createServer((req, res) => {
        if (!handler(req, res)) res.end("app");
      }));
      return new Client({ transport: new HttpTransport({ baseUrl: `http://127.0.0.1:${port}/api` }), throwOnError: true });
    },
  },
  {
    name: "WebSocket",
    reports: true,
    async client(options, reports) {
      const upgrade = upgradeHandler(serverOf(options, reports), { path: "/ws", heartbeat: false });
      const http = createServer((_req, res) => res.end("app"));
      http.on("upgrade", (req, socket, head) => {
        if (!upgrade(req, socket, head)) socket.destroy();
      });
      const port = await listen(http);
      const transport = new WebSocketTransport({ url: `ws://127.0.0.1:${port}/ws`, heartbeat: { enabled: false }, reconnect: { enabled: false } });
      cleanups.push(async () => {
        await transport.close();
        await upgrade.close();
      });
      return new Client({ transport, throwOnError: true });
    },
  },
];

describe.each(faces)("the narrowing key on $name (CLI-30)", (face) => {
  it("a narrowed call cannot reach a procedure above the narrowing", async () => {
    const reports: ServerDebugReport[] = [];
    const client = await face.client(BASE, reports);
    expect(await outcome(client, DIARY)).toBe("secret");
    expect(await outcome(client, DIARY, { clearance: "guest" })).toEqual({ code: "FORBIDDEN" });
    expect(await outcome(client, READ, { clearance: "guest" })).toMatchObject({ clearance: "guest" });
    expect(await outcome(client, WRITE)).toBe("written");
    expect(await outcome(client, WRITE, { effects: { writes: [] } })).toEqual({ code: "FORBIDDEN" });
    expect(await outcome(client, READ, { effects: { writes: [] } })).toMatchObject({ clearance: "intimate", writes: [] });
    // A narrowing within the capability of the call is not a debug report
    expect(reports).toEqual([]);
  });

  it("a key that tries to widen has no effect", async () => {
    const reports: ServerDebugReport[] = [];
    const client = await face.client({ ...BASE, capability: { clearance: "guest", effects: { writes: [] } } }, reports);
    const wider = { clearance: "intimate", effects: { reads: "any", writes: "any", destructive: true } };
    expect(await outcome(client, READ, wider)).toMatchObject({ clearance: "guest", writes: [] });
    expect(await outcome(client, DIARY, wider)).toEqual({ code: "FORBIDDEN" });
    expect(await outcome(client, WRITE, wider)).toEqual({ code: "FORBIDDEN" });
    if (face.reports) {
      expect(reports.map((report) => report.detail)).toEqual(
        expect.arrayContaining([
          { field: "clearance", kind: "widens" },
          { field: "effects", kind: "widens" },
        ]),
      );
    }
  });

  it("makes the deadline of the call earlier", async () => {
    const client = await face.client(BASE, []);
    const result = (await outcome(client, READ, { timeoutMs: 1500 })) as { deadline: number | null };
    expect(result.deadline).not.toBeNull();
    expect((result.deadline ?? 0) - Date.now()).toBeLessThanOrEqual(1500);
    expect((result.deadline ?? 0) - Date.now()).toBeGreaterThan(0);
  });
});

describe("the narrowing key on the HTTP header (CLI-30)", () => {
  async function start(options: ProcedureServerOptions = BASE, reports: ServerDebugReport[] = []): Promise<number> {
    const handler = procedureHandler(serverOf(options, reports), { basePath: "/api/proc" });
    return listen(createServer((req, res) => {
      if (!handler(req, res)) res.end("app");
    }));
  }

  it("reads the Procedure-Narrowing header as raw or URI-encoded JSON, and the response tells the reason", async () => {
    const port = await start();
    const raw = await post(port, "/api/proc/diary/read", { [NARROWING_HEADER]: JSON.stringify({ clearance: "guest" }) });
    expect(raw.status).toBe(403);
    expect(raw.body).toMatchObject({ code: "FORBIDDEN", reason: "effects-exceeded" });
    const encoded = await post(port, "/api/proc/notes/read", { [NARROWING_HEADER]: encodeURIComponent(JSON.stringify({ clearance: "public" })) });
    expect(encoded.body).toMatchObject({ clearance: "public" });
  });

  it("reads the same key from X-Metadata", async () => {
    const port = await start();
    const res = await post(port, "/api/proc/notes/read", { "x-metadata": encodeURIComponent(JSON.stringify({ [NARROWING_METADATA_KEY]: { clearance: "guest" } })) });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ clearance: "guest" });
  });

  it("combines the header and the key of X-Metadata: no source replaces the other, in each sequence", async () => {
    const port = await start();
    const meta = (narrowing: unknown): string => encodeURIComponent(JSON.stringify({ [NARROWING_METADATA_KEY]: narrowing }));
    // A gateway narrows with the header, and the client asks for more in X-Metadata
    const gateway = await post(port, "/api/proc/notes/read", { [NARROWING_HEADER]: JSON.stringify({ clearance: "public" }), "x-metadata": meta({ clearance: "intimate" }) });
    expect(gateway.body).toMatchObject({ clearance: "public" });
    // The reverse: the header asks for more, and the key of X-Metadata narrows
    const client = await post(port, "/api/proc/notes/read", { [NARROWING_HEADER]: JSON.stringify({ clearance: "intimate" }), "x-metadata": meta({ clearance: "public" }) });
    expect(client.body).toMatchObject({ clearance: "public" });
    // The effects of one source and the clearance of the other both apply
    const both = await post(port, "/api/proc/notes/write", { [NARROWING_HEADER]: JSON.stringify({ effects: { writes: [] } }), "x-metadata": meta({ clearance: "intimate", effects: { writes: "any" } }) });
    expect(both.status).toBe(403);
    // A query parameter with the name of the key is one more source
    const query = `/api/proc/notes/read?${NARROWING_METADATA_KEY}=${encodeURIComponent(JSON.stringify({ clearance: "guest" }))}`;
    expect((await post(port, query, { "x-metadata": meta({ clearance: "intimate" }) })).body).toMatchObject({ clearance: "guest" });
  });

  it("takes each line of a repeated header, and refuses a source that it cannot read", async () => {
    const port = await start();
    const lines = await post(port, "/api/proc/notes/read", { [NARROWING_HEADER]: [JSON.stringify({ clearance: "intimate" }), JSON.stringify({ clearance: "public" })] });
    expect(lines.body).toMatchObject({ clearance: "public" });
    // A broken line of the client does not remove the line of a gateway: the server refuses the call
    const broken = await post(port, "/api/proc/notes/read", { [NARROWING_HEADER]: ['{"clearance":', JSON.stringify({ clearance: "public" })] });
    expect(broken.status).toBe(400);
    expect(broken.body).toMatchObject({ code: "INVALID_REQUEST" });
  });

  it("is in the default CORS headers, so a browser on another origin can send it", () => {
    expect(DEFAULT_CORS_HEADERS).toContain(NARROWING_HEADER);
  });
});

describe("the narrowing key in the process (CLI-30)", () => {
  it("narrows a direct handle() of the server", async () => {
    const server = serverOf(BASE, []);
    const response = await server.handle({ id: "1", method: pathToMethod(DIARY), payload: {}, metadata: { [NARROWING_METADATA_KEY]: { clearance: "guest" } } });
    expect(response.status).toMatchObject({ type: "error", code: "FORBIDDEN" });
    expect(response.metadata["reason"]).toBe("effects-exceeded");
  });

  it("narrows an invocation with the option narrow, and never widens it", async () => {
    const options = { registry: registry(), capability: { clearance: "guest" }, clearanceOrder: ORDER, interceptors: [audienceGate] };
    await expect(invokePath(DIARY, {}, { ...options, capability: { clearance: "intimate" }, narrow: { clearance: "guest" } })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const wider = await invokePath(READ, {}, { ...options, narrow: { clearance: "intimate", effects: { writes: "any" } } });
    expect(wider).toMatchObject({ kind: "value", value: { clearance: "guest" } });
    // A value outside the order has no effect, and the invocation does not throw for it
    const unknown = await invokePath(READ, {}, { ...options, narrow: { clearance: "secret" } });
    expect(unknown).toMatchObject({ kind: "value", value: { clearance: "guest" } });
    // The nested calls get the narrowed capability, so the option applies one time
    const narrowed = await invokePath(READ, {}, { ...options, capability: { clearance: "intimate" }, narrow: { clearance: "public", timeoutMs: 5000 } });
    expect(narrowed).toMatchObject({ kind: "value", value: { clearance: "public" } });
  });

  it("combines the option narrow with the key of the metadata, and refuses a source that it cannot read", async () => {
    const options = { registry: registry(), capability: { clearance: "intimate" }, clearanceOrder: ORDER, interceptors: [audienceGate] };
    const both = await invokePath(READ, {}, { ...options, metadata: { [NARROWING_METADATA_KEY]: { clearance: "intimate" } }, narrow: { clearance: "public" } });
    expect(both).toMatchObject({ value: { clearance: "public" } });
    const reverse = await invokePath(READ, {}, { ...options, metadata: { [NARROWING_METADATA_KEY]: { clearance: "public" } }, narrow: { clearance: "intimate" } });
    expect(reverse).toMatchObject({ value: { clearance: "public" } });
    await expect(invokePath(READ, {}, { ...options, metadata: { [NARROWING_METADATA_KEY]: "{broken" } })).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    // Without an order, two different clearances have no meet: the invocation refuses the call
    const unmet = invokePath(READ, {}, { registry: registry(), capability: { clearance: "a" }, metadata: { [NARROWING_METADATA_KEY]: { clearance: "b" } } });
    await expect(unmet).rejects.toMatchObject({ code: "FORBIDDEN", reason: "clearance" });
  });

  it("applies the key one time, for the call of the host: a nested call gets the narrowed capability", async () => {
    const notes: unknown[] = [];
    const output = await invokePath(NESTED, {}, {
      registry: registry(),
      clearanceOrder: ORDER,
      metadata: { [NARROWING_METADATA_KEY]: { clearance: "guest", timeoutMs: 5000 } },
      onNarrowingNotes: (list) => notes.push(...list),
    });
    expect(output).toMatchObject({ value: { clearance: "guest" } });
    // A second application in the nested call would note that its time is after the deadline
    expect(notes).toEqual([]);
  });

  it("narrows a local procedure of a Client through the metadata of exec()", async () => {
    const reg = registry();
    const client = new Client({ transport: new LocalTransport({ registry: reg }), capability: { clearance: "intimate" }, clearanceOrder: ORDER, interceptors: [audienceGate] }).useRegistry(reg);
    expect(await client.exec(DIARY, {})).toBe("secret");
    await expect(client.exec(DIARY, {}, { metadata: { [NARROWING_METADATA_KEY]: { clearance: "guest" } } })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await client.exec(READ, {}, { metadata: { [NARROWING_METADATA_KEY]: { clearance: "public" } } })).toMatchObject({ clearance: "public" });
  });

  it("is part of the cache key of the client: a narrowed call does not get the cached result of a wider call", () => {
    const method = pathToMethod(READ);
    expect(defaultKeyGenerator(method, {}, { [NARROWING_METADATA_KEY]: { clearance: "guest" } })).not.toBe(defaultKeyGenerator(method, {}, {}));
  });
});

describe("the debug reports of the narrowing key (CLI-30)", () => {
  const handle = (server: ProcedureServer, narrowing: unknown, path: string[] = READ) =>
    server.handle({ id: "r1", method: pathToMethod(path), payload: {}, metadata: { [NARROWING_METADATA_KEY]: narrowing } });

  it("reports each part that has no effect, and the call goes on without that part", async () => {
    const reports: ServerDebugReport[] = [];
    const server = serverOf({ ...BASE, capability: { clearance: "guest" } }, reports);
    const response = await handle(server, { clearance: "secret", timeoutMs: -1, extra: 1 });
    expect(response.payload).toMatchObject({ clearance: "guest", deadline: null });
    expect(reports.map((report) => ({ topic: report.topic, requestId: report.requestId, method: report.method, ...report.detail }))).toEqual([
      { topic: "narrowing", requestId: "r1", method: pathToMethod(READ), field: "timeoutMs", kind: "invalid" },
      { topic: "narrowing", requestId: "r1", method: pathToMethod(READ), field: "narrowing", kind: "invalid" },
      { topic: "narrowing", requestId: "r1", method: pathToMethod(READ), field: "clearance", kind: "invalid" },
    ]);
    reports.length = 0;
    // A source that the server cannot read refuses the call: the server does not know what it asks for
    expect((await handle(server, "not json")).status).toMatchObject({ type: "error", code: "INVALID_REQUEST" });
    expect(reports.map((report) => report.detail)).toEqual([{ field: "narrowing", kind: "refused" }]);
  });

  it("writes each report with console.debug for debug: true, and nothing without the option", async () => {
    const spy = vi.spyOn(console, "debug").mockImplementation(() => undefined);
    try {
      const loud = new ProcedureServer({ registry: registry(), ...BASE, capability: { clearance: "guest" }, debug: true });
      loud.registerFromRegistry();
      await handle(loud, { clearance: "intimate" });
      expect(spy).toHaveBeenCalledTimes(1);
      expect(String(spy.mock.calls[0]?.[0])).toContain("narrowing of r1");
      const quiet = new ProcedureServer({ registry: registry(), ...BASE, capability: { clearance: "guest" } });
      quiet.registerFromRegistry();
      expect((await handle(quiet, { clearance: "intimate" })).payload).toMatchObject({ clearance: "guest" });
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
  });
});

describe("a jarvis-style mapping of the audience (CLI-30)", () => {
  // The guest switch sets the cookie jarvis_audience: the request hook reads it. The header
  // x-jarvis-audience of the API callers becomes the narrowing key. The narrower one wins.
  const principalOf: PrincipalOf = ({ cookies = {} }) => {
    const audience = cookies["jarvis_audience"];
    return AUDIENCES.includes(audience as Audience) ? { narrowing: { clearance: audience } } : {};
  };

  async function start(reports: ServerDebugReport[]): Promise<number> {
    const handler = procedureHandler(serverOf({ ...BASE, principalOf }, reports), { basePath: "/api/proc" });
    return listen(createServer((req, res) => {
      if (!handler(req, res)) res.end("app");
    }));
  }
  const key = (clearance: Audience): Record<string, string> => ({ [NARROWING_HEADER]: JSON.stringify({ clearance }) });

  it("applies the key after the narrowing of the cookie: the narrower of the two wins", async () => {
    const reports: ServerDebugReport[] = [];
    const port = await start(reports);
    expect((await post(port, "/api/proc/notes/read", { cookie: "jarvis_audience=guest", ...key("public") })).body).toMatchObject({ clearance: "public" });
    expect((await post(port, "/api/proc/notes/read", { cookie: "jarvis_audience=public", ...key("guest") })).body).toMatchObject({ clearance: "public" });
    expect(reports.map((report) => report.detail)).toEqual([{ field: "clearance", kind: "widens" }]);
    expect((await post(port, "/api/proc/diary/read", { cookie: "jarvis_audience=guest" })).status).toBe(403);
    expect((await post(port, "/api/proc/diary/read", key("guest"))).status).toBe(403);
    expect((await post(port, "/api/proc/diary/read")).body).toBe("secret");
  });
});

describe("the decoder of the narrowing key (CLI-30)", () => {
  it("reads an object, the JSON of a header and its URI-encoded form", () => {
    expect(narrowingOf(undefined)).toEqual({ narrowings: [], notes: [] });
    expect(narrowingOf({ clearance: "guest" }).narrowings).toEqual([{ clearance: "guest" }]);
    expect(narrowingOf('{"clearance":"guest","timeoutMs":20}').narrowings).toEqual([{ clearance: "guest", timeoutMs: 20 }]);
    expect(narrowingOf(encodeURIComponent('{"effects":{"reads":["a"],"writes":"any","destructive":false}}')).narrowings).toEqual([
      { effects: { reads: ["a"], writes: "any", destructive: false } },
    ]);
  });

  it("reads each source of a list, and two header values that a server joined", () => {
    expect(narrowingOf([{ clearance: "guest" }, '{"timeoutMs":5}']).narrowings).toEqual([{ clearance: "guest" }, { timeoutMs: 5 }]);
    expect(narrowingOf('{"clearance":"guest"}, {"clearance":"public"}').narrowings).toEqual([{ clearance: "guest" }, { clearance: "public" }]);
    expect(narrowingOf(encodeURIComponent('{"clearance":"guest"}') + ", " + encodeURIComponent('{"timeoutMs":5}')).narrowings).toEqual([{ clearance: "guest" }, { timeoutMs: 5 }]);
    // A joined value with a broken part is not JSON: the server refuses the call
    expect(narrowingOf('{"clearance":, {"clearance":"public"}').notes).toMatchObject([{ field: "narrowing", kind: "refused" }]);
    expect(addNarrowing(undefined, "a")).toBe("a");
    expect(addNarrowing("a", undefined)).toBe("a");
    expect(addNarrowing(["a", "b"], ["c"])).toEqual(["a", "b", "c"]);
  });

  it("ignores each part that is not valid, with a note, and refuses a source that is not an object", () => {
    expect(narrowingOf("[1]")).toMatchObject({ narrowings: [], notes: [{ field: "narrowing", kind: "refused" }] });
    expect(narrowingOf({ clearance: null, effects: { reads: "all", writes: [1], destructive: "no" }, timeoutMs: Number.NaN })).toMatchObject({
      narrowings: [],
      notes: [
        { field: "clearance", kind: "invalid" },
        { field: "effects", kind: "invalid" },
        { field: "effects", kind: "invalid" },
        { field: "effects", kind: "invalid" },
        { field: "timeoutMs", kind: "invalid" },
      ],
    });
  });

  it("reads only own fields: a __proto__ key gives nothing and changes no prototype", () => {
    const parsed = narrowingOf('{"__proto__": {"clearance": "intimate"}, "effects": {"__proto__": {"writes": "any"}, "writes": []}}');
    expect(parsed.narrowings).toEqual([{ effects: { writes: [] } }]);
    expect(Object.getPrototypeOf(parsed.narrowings[0])).toBe(Object.prototype);
    expect(Object.getPrototypeOf(parsed.narrowings[0]?.effects)).toBe(Object.prototype);
    expect(parsed.notes.map((note) => note.kind)).toEqual(["invalid", "invalid"]);
    expect(({} as Record<string, unknown>)["clearance"]).toBeUndefined();
    // A field of the prototype of a value from the process does not count either
    expect(narrowingOf(Object.create({ clearance: "public" })).narrowings).toEqual([]);
  });
});

describe("narrowWithin (CLI-30)", () => {
  it("takes the meet of a partial order: separate compartments narrow to their common part", () => {
    const compartments: ClearanceOrder<readonly string[]> = {
      leq: (a, b) => a.every((name) => b.includes(name)),
      meet: (a, b) => a.filter((name) => b.includes(name)),
    };
    const result = narrowWithin<readonly string[]>({ clearance: ["health", "finance"] }, { clearance: ["health", "travel"] }, compartments);
    expect(result.capability.clearance).toEqual(["health"]);
    expect(result.notes).toMatchObject([{ field: "clearance", kind: "widens" }]);
    expect(narrowWithin<readonly string[]>({ clearance: ["health", "finance"] }, { clearance: ["health"] }, compartments).notes).toEqual([]);
  });

  it("gives the same result for the sources in each sequence", () => {
    const sources: CapabilityRequest<unknown>[] = [{ clearance: "guest", effects: { reads: ["world", "diary"] } }, { clearance: "public", timeoutMs: 50 }, { effects: { reads: ["world"], writes: [] } }];
    const held = { clearance: "intimate" as Audience };
    const sequences = [sources, [...sources].reverse(), [sources[1]!, sources[2]!, sources[0]!]];
    for (const sequence of sequences) {
      expect(narrowWithin(held, sequence, ORDER, 1000).capability).toEqual({ clearance: "public", effects: { reads: ["world"], writes: [] }, deadline: 1050 });
    }
    // One more source can only make the result narrower
    expect(narrowWithin(held, [...sources, { clearance: "intimate", effects: { reads: "any" } }], ORDER, 1000).capability).toEqual({
      clearance: "public",
      effects: { reads: ["world"], writes: [] },
      deadline: 1050,
    });
  });

  it("refuses clearances without a meet when the server has no order, in each sequence", () => {
    const noOrder = narrowWithin<string>({ clearance: "a" }, { clearance: "b" });
    expect(noOrder.refusal).toMatchObject({ field: "clearance", kind: "refused" });
    expect(noOrder.capability.clearance).toBe("a");
    expect(narrowWithin<string>(undefined, [{ clearance: "a" }, { clearance: "b" }]).refusal).toBeDefined();
    expect(narrowWithin<string>(undefined, [{ clearance: "b" }, { clearance: "a" }]).refusal).toBeDefined();
    const same = narrowWithin<string>(undefined, [{ clearance: "a" }, { clearance: "a" }]);
    expect(same.refusal).toBeUndefined();
    expect(same.capability.clearance).toBe("a");
  });

  it("keeps the earlier deadline", () => {
    const later = narrowWithin({ deadline: 1100 }, { timeoutMs: 1000 }, undefined, 1000);
    expect(later.capability.deadline).toBe(1100);
    expect(later.notes).toMatchObject([{ field: "timeoutMs", kind: "widens" }]);
    const earlier = narrowWithin({ deadline: 5000 }, { timeoutMs: 1000 }, undefined, 1000);
    expect(earlier.capability.deadline).toBe(2000);
    expect(earlier.notes).toEqual([]);
  });

  it("narrows an unlimited capability, and keeps destructive off", () => {
    expect(narrowWithin(undefined, { clearance: "guest", effects: { writes: [] } }, ORDER).capability).toEqual({ clearance: "guest", effects: { writes: [] } });
    const destructive = narrowWithin({ effects: { destructive: false } }, { effects: { destructive: true } });
    expect(destructive.capability.effects).toEqual({ destructive: false });
    expect(destructive.notes).toMatchObject([{ field: "effects", kind: "widens" }]);
    expect(narrowWithin({ clearance: "guest" }, undefined, ORDER)).toEqual({ capability: { clearance: "guest" }, notes: [] });
  });
});
