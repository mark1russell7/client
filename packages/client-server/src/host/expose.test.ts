/**
 * The expose rule of a procedures host covers its collection procedures, on each face (CLI-47).
 *
 * - An `exclude` of the policy hides one collection procedure: a call gets `NOT_FOUND` on the HTTP
 *   face and on the WebSocket face, and the handler does not run.
 * - A rule without `collections.<name>.*` hides each collection procedure. A rule with it serves them.
 * - `host.health`, `host.info`, `host.metrics` and `events.subscribe` stay on, whatever the rule says.
 * - The option `expose` of the host wins over the rule of the policy, and `host.policy` has it.
 * - A host without an expose rule serves each collection procedure, as before.
 */

import { describe, it, expect, afterEach } from "vitest";
import { z } from "zod";
import { service, type Lifecycle, type ServiceBuilder } from "@mark1russell7/service";
import { fakeProcess } from "@mark1russell7/service/testing";
import {
  Client,
  WebSocketTransport,
  createProcedure,
  createRegistry,
  exposePatterns,
  hostPolicy,
  ms,
  pathToMethod,
  seconds,
  type CollectionStorage,
  type HostPolicyOptions,
  type ProcedurePath,
  type ProcedureRegistry,
} from "@procedures/client";
import { createProcedureHost, LOCAL_LISTENER_KNOBS, type ProcedureHost } from "./index.js";

const CLEAR = ["collections", "notes", "clear"];
const GET = ["collections", "notes", "get"];
const HOST_PROCEDURES = [
  ["host", "health"],
  ["host", "info"],
  ["host", "metrics"],
];

/** A registry with one procedure of the app. */
function registryOf(): ProcedureRegistry {
  return createRegistry({
    name: "expose-test",
    procedures: [
      createProcedure()
        .path(["test", "echo"])
        .input(z.object({ text: z.string() }))
        .output(z.string())
        .meta({ effects: { reads: [], writes: [] } })
        .handler(async (input) => input.text)
        .build(),
    ],
  });
}

/** A storage of no data that counts the calls of `clear`. */
function notesStorage(): { storage: CollectionStorage<unknown>; clears: () => number } {
  let clears = 0;
  const storage: CollectionStorage<unknown> = {
    get: async () => undefined,
    getAll: async () => [],
    find: async () => [],
    has: async () => false,
    size: async () => 0,
    set: async () => undefined,
    delete: async () => false,
    clear: async () => {
      clears++;
    },
    setBatch: async () => undefined,
    deleteBatch: async () => 0,
    getBatch: async () => new Map(),
    close: async () => undefined,
  };
  return { storage, clears: () => clears };
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

let cleanups: Array<() => Promise<unknown> | unknown> = [];
const lives: Lifecycle[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  for (const life of lives.splice(0)) {
    await life.shutdown("the test ended");
    await life.done;
  }
});

interface RunningNotesHost {
  readonly host: ProcedureHost;
  readonly clears: () => number;
  /** The base URL of the HTTP face. */
  readonly http: string;
  /** A client of the WebSocket face. */
  readonly ws: Client;
}

/** A host with the collection `notes`, an HTTP face and a WebSocket face, under `run()`. */
async function runNotesHost(name: string, policy?: HostPolicyOptions, expose?: (path: ProcedurePath) => boolean): Promise<RunningNotesHost> {
  const { storage, clears } = notesStorage();
  const host = createProcedureHost({
    name,
    registry: registryOf(),
    ...(policy ? { policy: hostPolicy(policy) } : {}),
    ...(expose ? { expose } : {}),
    faces: { http: true, ws: true },
    listen: [{ port: 0, knobs: LOCAL_LISTENER_KNOBS }],
    collections: { notes: storage },
  });
  const life = await host.declare(serviceOf(name)).run({ process: fakeProcess() });
  lives.push(life);
  const endpoints = host.info.endpoints();
  const http = endpoints.find((endpoint) => endpoint.type === "http")!.address;
  const wsUrl = endpoints.find((endpoint) => endpoint.type === "websocket")!.address;
  const transport = new WebSocketTransport({ url: wsUrl, heartbeat: { enabled: false }, reconnect: { enabled: false } });
  cleanups.push(() => transport.close());
  return { host, clears, http, ws: new Client({ transport, throwOnError: true }) };
}

/** A call of the HTTP face: its status and its body. */
async function post(base: string, path: readonly string[], body: unknown = {}): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`${base}/${path.join("/")}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const text = await response.text();
  return { status: response.status, body: text === "" ? undefined : (JSON.parse(text) as unknown) };
}

describe("the expose rule of a procedures host covers the collection procedures (CLI-47)", () => {
  it("hides the collection procedure that the exclude list names, on the HTTP face and on the WebSocket face", async () => {
    const { host, clears, http, ws } = await runNotesHost("exclude", {
      expose: ["test.*", "collections.notes.*"],
      exclude: ["collections.notes.clear"],
      events: { topics: ["notes.*"] },
    });

    const viaHttp = await post(http, CLEAR);
    expect(viaHttp.status).toBe(404);
    expect(viaHttp.body).toMatchObject({ code: "NOT_FOUND" });
    await expect(ws.call(pathToMethod(CLEAR), {})).rejects.toMatchObject({ code: expect.stringMatching(/NOT_FOUND/) });
    expect(clears()).toBe(0);
    expect(host.server.hasProcedure(CLEAR)).toBe(false);

    // The other procedures of the collection stay
    expect((await post(http, GET, { id: "a" })).status).toBe(204);
    await ws.call(pathToMethod(GET), { id: "a" });

    // The procedures of the host stay on
    for (const path of HOST_PROCEDURES) expect((await post(http, path)).status, path.join(".")).toBe(200);
    await expect(ws.call(pathToMethod(["host", "health"]), {})).resolves.toMatchObject({ status: "ok" });

    // events.subscribe stays on: the topic rule is its expose rule
    const subscription = await host.server.handle({ id: "s", method: pathToMethod(["events", "subscribe"]), payload: { topics: ["notes.created"] }, metadata: {} });
    expect(subscription.status.type).toBe("success");
    const items = (subscription.stream as AsyncIterable<unknown>)[Symbol.asyncIterator]();
    expect((await items.next()).value).toMatchObject({ type: "subscribed", topics: ["notes.created"] });
    await items.return?.();
  }, 20000);

  it("hides each collection procedure for a rule without collections.*, and keeps host.* on", async () => {
    const { clears, http, ws } = await runNotesHost("no-collections", { expose: ["test.*"] });
    expect((await post(http, GET, { id: "a" })).status).toBe(404);
    expect((await post(http, CLEAR)).status).toBe(404);
    await expect(ws.call(pathToMethod(GET), { id: "a" })).rejects.toMatchObject({ code: expect.stringMatching(/NOT_FOUND/) });
    expect(clears()).toBe(0);
    for (const path of HOST_PROCEDURES) expect((await post(http, path)).status, path.join(".")).toBe(200);
    await expect(ws.call(pathToMethod(["host", "info"]), {})).resolves.toMatchObject({ runtime: expect.stringMatching(/^node /) });
    expect((await post(http, ["test", "echo"], { text: "hi" })).body).toBe("hi");
  }, 20000);

  it("serves the collection procedures that the rule lists", async () => {
    const { clears, http, ws } = await runNotesHost("with-collections", { expose: ["test.*", "collections.notes.*"] });
    expect((await post(http, GET, { id: "a" })).status).toBe(204);
    expect((await post(http, CLEAR)).status).toBe(204);
    await ws.call(pathToMethod(CLEAR), {});
    expect(clears()).toBe(2);
  }, 20000);

  it("gives the option expose to the server and to host.policy: it wins over the rule of the policy", async () => {
    const own = exposePatterns(["test.*"]);
    const { host, http } = await runNotesHost("option-expose", { expose: ["test.*", "collections.notes.*"] }, own);
    expect(host.policy.expose).toBe(own);
    expect((await post(http, GET, { id: "a" })).status).toBe(404);
    expect((await post(http, ["host", "health"])).status).toBe(200);
  }, 20000);

  it("changes nothing without an expose rule: each collection procedure stays served", async () => {
    const { clears, http, ws } = await runNotesHost("open");
    expect((await post(http, CLEAR)).status).toBe(204);
    await ws.call(pathToMethod(CLEAR), {});
    expect(clears()).toBe(2);
    expect((await post(http, ["host", "health"])).status).toBe(200);
  }, 20000);
});
