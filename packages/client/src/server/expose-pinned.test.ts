/**
 * The expose rule covers each procedure that the server pins (CLI-47).
 *
 * Before, the server examined the expose rule only for a procedure of the registry. A procedure
 * that `registerProcedure()` pinned was outside the rule, so the collection procedures of
 * `registerCollectionProcedures()` stayed callable: `exclude: ["collections.notes.clear"]` had no
 * effect. Now the rule applies to each pin. Only a pin with `alwaysOn` is outside it:
 * `events.subscribe` here, and the procedures `host.*` of a host (`@procedures/peer`).
 */

import { describe, it, expect } from "vitest";
import { ProcedureServer, type ProcedureServerOptions } from "./procedure-server.js";
import { exposePatterns, hostPolicy, procedureServerOptions, type HostPolicyOptions } from "./host-policy.js";
import { pathToMethod } from "./method.js";
import { createRegistry } from "../procedures/module.js";
import { defineProcedure } from "../procedures/define.js";
import { outputSchema } from "../procedures/core/schemas.js";
import type { AnyProcedure } from "../procedures/types.js";
import type { CollectionStorage } from "../procedures/collection/storage.js";
import type { ProcedureManifest } from "../procedures/manifest.js";
import { createEventBus } from "../events/bus.js";

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

/** A procedure of the app that gives its key. */
const appProcedure = (path: string[]): AnyProcedure =>
  defineProcedure({
    path,
    input: outputSchema<unknown>(),
    output: outputSchema<string>(),
    metadata: { effects: { reads: [], writes: [] } },
    handler: () => path.join("."),
  }) as AnyProcedure;

/**
 * A server of a host policy, with the collection `notes`. The registry of `createRegistry()` has
 * the procedures of the client module, also `client.chain` and `procedure.manifest`. The server
 * serves its registry, and it pins the collection procedures.
 */
function notesServer(policy: HostPolicyOptions = {}): { server: ProcedureServer; clears: () => number } {
  const { storage, clears } = notesStorage();
  const registry = createRegistry();
  const server = new ProcedureServer({ ...procedureServerOptions(hostPolicy(policy), registry), collections: { notes: storage } });
  server.registerCollectionProcedures("notes");
  return { server, clears };
}

/** The status of a call of the server, and its value. */
async function call(server: ProcedureServer, path: string[], payload: unknown = {}): Promise<{ type: string; code?: string; message?: string; value?: unknown }> {
  const response = await server.handle({ id: "1", method: pathToMethod(path), payload, metadata: {} });
  const status = response.status as { type: string; code?: string; message?: string };
  return { type: status.type, ...(status.code !== undefined ? { code: String(status.code) } : {}), ...(status.message ? { message: status.message } : {}), value: response.payload };
}

const CLEAR = ["collections", "notes", "clear"];
const GET = ["collections", "notes", "get"];

describe("the expose rule covers each pinned procedure (CLI-47)", () => {
  it("hides the collection procedure that the exclude list names: no lookup, no count, no manifest entry and no nested call", async () => {
    const policy = { expose: ["client.*", "procedure.manifest", "collections.notes.*"], exclude: ["collections.notes.clear"] };
    const { server, clears } = notesServer(policy);

    // The lookup: NOT_FOUND, and the handler does not run
    expect(await call(server, CLEAR)).toMatchObject({ type: "error", code: "NOT_FOUND" });
    expect(server.hasProcedure(CLEAR)).toBe(false);
    expect(server.procedureOf(pathToMethod(CLEAR))).toBeUndefined();
    // The other procedures of the collection stay
    expect(await call(server, GET, { id: "a" })).toMatchObject({ type: "success" });
    expect(server.hasProcedure(GET)).toBe(true);

    // The count of the served procedures leaves it out
    const { server: open } = notesServer({ expose: ["client.*", "procedure.manifest", "collections.notes.*"] });
    expect(server.procedureCount).toBe(open.procedureCount - 1);

    // The manifest of the server leaves it out
    const manifest = await call(server, ["procedure", "manifest"]);
    const keys = (manifest.value as ProcedureManifest).procedures.map((entry) => entry.key);
    expect(keys).toContain("collections.notes.get");
    expect(keys).not.toContain("collections.notes.clear");

    // A nested call of a data-driven procedure: the call policy refuses it before the lookup
    const chained = await call(server, ["client", "chain"], { steps: [{ $proc: CLEAR, input: {} }] });
    expect(chained).toMatchObject({ type: "error" });
    expect(chained.message).toContain("Procedure not exposed: collections.notes.clear");
    expect(clears()).toBe(0);
  });

  it("hides each collection procedure for a rule without collections.*, and serves them for a rule with it", async () => {
    const hidden = notesServer({ expose: ["client.*"] });
    expect(await call(hidden.server, GET, { id: "a" })).toMatchObject({ type: "error", code: "NOT_FOUND" });
    expect(await call(hidden.server, CLEAR)).toMatchObject({ type: "error", code: "NOT_FOUND" });
    expect(hidden.clears()).toBe(0);

    const served = notesServer({ expose: ["client.*", "collections.notes.*"] });
    expect(await call(served.server, GET, { id: "a" })).toMatchObject({ type: "success" });
    expect(await call(served.server, CLEAR)).toMatchObject({ type: "success" });
    expect(served.clears()).toBe(1);
  });

  it("applies the rule to each pin, also on a server that does not serve its registry, unless the pin is alwaysOn", async () => {
    const { storage } = notesStorage();
    const options: ProcedureServerOptions = { registry: createRegistry(), expose: exposePatterns(["app.public"]), collections: { notes: storage } };
    const server = new ProcedureServer(options);
    server.registerCollectionProcedures("notes");
    server.registerProcedures([appProcedure(["app", "public"]), appProcedure(["app", "private"])]);
    server.registerProcedure(appProcedure(["app", "status"]), { alwaysOn: true });

    expect(await call(server, ["app", "public"])).toMatchObject({ type: "success", value: "app.public" });
    expect(await call(server, ["app", "private"])).toMatchObject({ type: "error", code: "NOT_FOUND" });
    expect(await call(server, GET, { id: "a" })).toMatchObject({ type: "error", code: "NOT_FOUND" });
    // The pin with alwaysOn is outside the rule
    expect(await call(server, ["app", "status"])).toMatchObject({ type: "success", value: "app.status" });
    expect(server.hasProcedure(["app", "status"])).toBe(true);
    expect(server.procedureCount).toBe(2);
  });

  it("keeps events.subscribe on, whatever the expose rule says: the topic rule is its expose rule", async () => {
    const bus = createEventBus();
    const server = new ProcedureServer(procedureServerOptions(hostPolicy({ expose: ["client.*"], exclude: ["events.subscribe"], events: { bus, topics: ["notes.*"] } }), createRegistry()));
    const response = await server.handle({ id: "s", method: pathToMethod(["events", "subscribe"]), payload: { topics: ["notes.created"] }, metadata: {} });
    expect(response.status.type).toBe("success");
    const items = (response.stream as AsyncIterable<unknown>)[Symbol.asyncIterator]();
    expect((await items.next()).value).toMatchObject({ type: "subscribed", topics: ["notes.created"] });
    await items.return?.();
    expect(server.hasProcedure(["events", "subscribe"])).toBe(true);
  });

  it("changes nothing without an expose rule: each pin and each collection procedure stays served", async () => {
    const { server, clears } = notesServer();
    server.registerProcedure(appProcedure(["app", "private"]));
    expect(await call(server, ["app", "private"])).toMatchObject({ type: "success", value: "app.private" });
    expect(await call(server, CLEAR)).toMatchObject({ type: "success" });
    expect(clears()).toBe(1);
    const chained = await call(server, ["client", "chain"], { steps: [{ $proc: CLEAR, input: {} }] });
    expect(chained).toMatchObject({ type: "success" });
    expect(clears()).toBe(2);
  });
});
