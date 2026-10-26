/**
 * The admission contract (roadmap CLI-85, invariant I6 of ARCHITECTURE.md): each read and each
 * change event of a served collection goes through `admission.admit`.
 *
 * The test does not keep its own list of the procedures. It reads the procedures that the server
 * serves from its registry at run time. Each procedure whose effects read `collection:<name>` is a
 * procedure of the collection. A procedure without writes is a read, the others are writes.
 *
 * - Each procedure of the collection must have a row in the table of inputs below. A new procedure
 *   without a row fails the test, so its author adds the row and the checks apply to it.
 * - A read of a principal with a rule of the rows gives the same output as the same read on a
 *   storage of only the admitted rows. The read of root differs, so the check is not empty.
 * - `admit` gets the invocation of the read: its path and its principal. A read of a partition
 *   does the same.
 * - The output and the errors of a write of the principal do not show a refused row.
 * - The change events of each write reach the principal without the ids and the values of the
 *   refused rows. The events of root have them. The topic is the event path of the collection.
 */

import { describe, it, expect, afterEach } from "vitest";
import { createRegistry } from "../module.js";
import type { AdmitItem, Invocation } from "../invoke.js";
import type { AnyProcedure } from "../types.js";
import type { CollectionAdmission } from "./admission.js";
import { collectionChangeTopic, type CollectionChangeEvent } from "./changes.js";
import { ProcedureServer } from "../../server/procedure-server.js";
import { pathToMethod } from "../../server/method.js";
import { PortTransport } from "../../adapters/port/transport.js";
import { subscribeRemote } from "../../events/remote.js";
import { LogStorage } from "../../../test/log-storage.js";

const NAME = "contract.rows";
const RESOURCE = `collection:${NAME}`;
const MARKER = "SECRET";

/** The rows of root: the principal "eve" cannot read them. */
const SECRET_ROWS = { s1: { owner: "root", secret: `${MARKER}-s1` }, s2: { owner: "root", secret: `${MARKER}-s2` } };
/** The row of eve. */
const EVE_ROWS = { e0: { owner: "eve", note: "mine" } };

/** The invocations that `admit` got: the path and the principal of each. */
let seen: Array<{ path: string; principal: string | undefined; partition: unknown }> = [];

/** The rule of the rows: root reads each row, another principal reads only its own rows. */
const ownRows: AdmitItem = (row, invocation: Invocation) => {
  seen.push({ path: invocation.path.join("/"), principal: invocation.principal?.id, partition: (invocation.input as { partition?: unknown } | undefined)?.partition });
  const me = invocation.principal?.id;
  if (me === "root") return true;
  return ((row as { value?: { owner?: unknown } }).value?.owner ?? null) === me;
};
const admission: CollectionAdmission = { admit: ownRows };

/**
 * The input of a read of each procedure of the collection. A procedure of the collection that the
 * registry has and this table does not have fails the test.
 */
const READS: Record<string, unknown> = {
  get: { id: "s1" },
  has: { id: "s1" },
  getAll: {},
  entries: {},
  ids: {},
  changes: {},
  find: {},
  size: {},
  getBatch: { ids: ["s1", "s2", "e0"] },
};

/** The input of a write of each procedure of the collection: each one touches a row of root. */
const WRITES: Record<string, unknown> = {
  set: { id: "s1", value: { owner: "root", secret: `${MARKER}-new` } },
  patch: { id: "s1", fields: { secret: `${MARKER}-patched` } },
  delete: { id: "s1" },
  clear: {},
  setBatch: { items: [{ id: "s3", value: { owner: "root", secret: `${MARKER}-s3` } }] },
  deleteBatch: { ids: ["s1", "s2"] },
};

type Mode = { partitioned: boolean; values: boolean };

/** A server of the collection with the rows, the rule of the rows and the change events. */
function serverOf(rows: Record<string, unknown>, mode: Mode = { partitioned: false, values: false }): ProcedureServer {
  const server = new ProcedureServer({
    registry: createRegistry(),
    authenticate: (request) => (request.credentials?.bearer ? { id: request.credentials.bearer, via: "test" } : undefined),
    events: { topics: ["collections.*"] },
  });
  if (mode.partitioned) {
    const storages = new Map<string, LogStorage>();
    server.usePartitions(NAME, {
      storageOf: (partition) => {
        let storage = storages.get(partition);
        if (!storage) storages.set(partition, (storage = new LogStorage(rows)));
        return storage;
      },
      resolve: (_ctx, requested) => requested ?? null,
    });
  } else {
    server.useStorage(NAME, new LogStorage(rows));
  }
  server.registerCollectionProcedures(NAME, { admission, ...(mode.values && { changeEvents: { values: true } }) });
  return server;
}

/**
 * The procedures of the collection that the server serves, from its registry: each one whose
 * effects read the resource of the collection.
 */
function proceduresOf(server: ProcedureServer): { reads: AnyProcedure[]; writes: AnyProcedure[] } {
  const procedures = server
    .getRegistry()
    .getAll()
    .filter((procedure) => server.hasProcedure(procedure.path) && (procedure.metadata?.effects?.reads ?? []).includes(RESOURCE));
  const isWrite = (procedure: AnyProcedure) => (procedure.metadata?.effects?.writes ?? []).length > 0;
  return { reads: procedures.filter((procedure) => !isWrite(procedure)), writes: procedures.filter(isWrite) };
}

const operationOf = (procedure: AnyProcedure) => procedure.path.at(-1)!;

let counter = 0;
/** A call of a principal through `handle()` of the server: the output, or the error. */
async function call(server: ProcedureServer, principal: string, path: readonly string[], input: unknown): Promise<{ ok: boolean; value: unknown }> {
  const response = await server.handle({ id: String(++counter), method: pathToMethod([...path]), payload: input, metadata: {}, credentials: { bearer: principal } });
  if (response.status.type !== "success") return { ok: false, value: response.status };
  if (response.stream) {
    const items: unknown[] = [];
    for await (const item of response.stream) items.push(item);
    return { ok: true, value: items };
  }
  return { ok: true, value: response.payload };
}

let cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup();
  cleanups = [];
  seen = [];
});

async function started(server: ProcedureServer): Promise<ProcedureServer> {
  await server.start();
  cleanups.push(() => server.stop());
  return server;
}

/** A subscriber of the topic of the collection over a message port, with the bearer of a principal. */
async function subscribe(server: ProcedureServer, principal: string): Promise<CollectionChangeEvent[]> {
  const channel = new MessageChannel();
  const worker = new PortTransport(channel.port1, { serve: server, credentials: { bearer: principal } });
  const page = new PortTransport(channel.port2);
  const events: CollectionChangeEvent[] = [];
  const subscription = subscribeRemote<CollectionChangeEvent>(page, collectionChangeTopic(NAME), (data) => void events.push(data));
  cleanups.push(async () => {
    subscription();
    await page.close();
    await worker.close();
    channel.port1.close();
    channel.port2.close();
  });
  await subscription.ready;
  return events;
}

async function waitFor(check: () => boolean, what: string, limit = 5000): Promise<void> {
  const end = Date.now() + limit;
  while (!check()) {
    if (Date.now() > end) throw new Error(`waitFor: ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

/** The ids of the refused rows that an event shows: in `changed`, `deleted` or `values`. */
const refusedIdsOf = (events: readonly CollectionChangeEvent[]) =>
  events.flatMap((event) => [...event.changed, ...event.deleted, ...(event.values ?? []).map(({ id }) => id)]).filter((id) => id.startsWith("s"));

describe("the admission contract of a served collection (CLI-85, I6)", () => {
  it("each procedure of the collection in the registry has a row in the tables of the contract", () => {
    const { reads, writes } = proceduresOf(serverOf({}));
    // The enumeration finds the procedures: an empty list makes each check below empty
    expect(reads.length).toBeGreaterThanOrEqual(Object.keys(READS).length);
    expect(writes.length).toBeGreaterThanOrEqual(Object.keys(WRITES).length);
    const missing = [
      ...reads.filter((procedure) => !(operationOf(procedure) in READS)).map((procedure) => `read ${procedure.path.join(".")}`),
      ...writes.filter((procedure) => !(operationOf(procedure) in WRITES)).map((procedure) => `write ${procedure.path.join(".")}`),
    ];
    expect(missing, "Add each new procedure of the collection to READS or WRITES of the admission contract").toEqual([]);
    // A row of the tables that names no served procedure is a stale row
    const served = new Set([...reads, ...writes].map(operationOf));
    expect([...Object.keys(READS), ...Object.keys(WRITES)].filter((operation) => !served.has(operation))).toEqual([]);
  });

  it("the server serves the event path of the collection, events.subscribe", () => {
    // The pin of the event path is not in the registry: the test asks the server for it
    expect(serverOf({}).procedureOf(pathToMethod(["events", "subscribe"]))).toBeDefined();
  });

  for (const partitioned of [false, true]) {
    const where = partitioned ? "of a partition" : "of the collection";
    const inputOf = (input: unknown) => (partitioned ? { ...(input as object), partition: "p1" } : input);

    it(`each read ${where} gives a principal only the admitted rows, and admit gets the invocation of the read`, async () => {
      const mode = { partitioned, values: false };
      const full = await started(serverOf({ ...SECRET_ROWS, ...EVE_ROWS }, mode));
      const admitted = await started(serverOf(EVE_ROWS, mode));
      const { reads } = proceduresOf(full);
      for (const procedure of reads) {
        const input = inputOf(READS[operationOf(procedure)]);
        const label = procedure.path.join(".");
        seen = [];
        const eve = await call(full, "eve", procedure.path, input);
        const path = procedure.path.join("/");
        expect(
          seen.some((invocation) => invocation.path === path && invocation.principal === "eve"),
          `${label}: admit did not get the invocation of the read`,
        ).toBe(true);
        if (partitioned) expect(seen.filter((invocation) => invocation.path === path).every((invocation) => invocation.partition === "p1"), `${label}: the partition`).toBe(true);
        const only = await call(admitted, "eve", procedure.path, input);
        expect(eve, `${label}: the read of eve shows a refused row`).toEqual(only);
        expect(String(JSON.stringify(eve.value)), `${label}: the marker of a refused row`).not.toContain(MARKER);
        const root = await call(full, "root", procedure.path, input);
        expect(root, `${label}: the read of root is the same as the read of eve, so the check is empty`).not.toEqual(only);
      }
    });
  }

  it("the output and the errors of a write of a principal do not show a refused row", async () => {
    for (const operation of Object.keys(WRITES)) {
      const server = await started(serverOf({ ...SECRET_ROWS, ...EVE_ROWS }));
      const procedure = proceduresOf(server).writes.find((candidate) => operationOf(candidate) === operation)!;
      const result = await call(server, "eve", procedure.path, WRITES[operation]);
      expect(String(JSON.stringify(result.value)), `${procedure.path.join(".")}: the output of the write`).not.toContain(MARKER);
    }
  });

  for (const values of [false, true]) {
    it(`the change events of each write reach a principal only with the admitted rows${values ? " and values" : ""}`, async () => {
      const { writes } = proceduresOf(serverOf({}));
      for (const procedure of writes) {
        const label = procedure.path.join(".");
        const server = await started(serverOf({ ...SECRET_ROWS, ...EVE_ROWS }, { partitioned: false, values }));
        const eve = await subscribe(server, "eve");
        const root = await subscribe(server, "root");
        const base = procedure.path.slice(0, -1);
        // A read of the changes starts the chain of the versions: then an event has the ids of its rows
        await call(server, "root", [...base, "changes"], {});
        seen = [];
        expect((await call(server, "root", procedure.path, WRITES[operationOf(procedure)])).ok, `${label}: the write of root`).toBe(true);
        // A row of eve after the write: when eve has its event, eve has each event of the write before it
        await call(server, "root", [...base, "set"], { id: "e1", value: { owner: "eve" } });
        await waitFor(() => eve.some((event) => event.changed.includes("e1")), `${label}: the event of e1 for eve`);
        await waitFor(() => root.some((event) => event.changed.includes("e1")), `${label}: the event of e1 for root`);
        expect(refusedIdsOf(eve), `${label}: an event of eve shows a refused row`).toEqual([]);
        expect(JSON.stringify(eve), `${label}: the marker of a refused row in an event of eve`).not.toContain(MARKER);
        // The events of root have the rows of root, or a hint for a clear: so the check is not empty
        const hint = (event: CollectionChangeEvent) => event.reset === true || (event.changed.length === 0 && event.deleted.length === 0);
        expect(refusedIdsOf(root).length > 0 || root.some(hint), `${label}: root has no event of the write`).toBe(true);
        // The filter of the events asks the rule with an invocation of the changes of the collection, for the subscriber
        expect(seen.some((invocation) => invocation.path === [...base, "changes"].join("/") && invocation.principal === "eve"), `${label}: admit did not get the subscription of eve`).toBe(true);
        for (const cleanup of cleanups.reverse()) await cleanup();
        cleanups = [];
      }
    });
  }
});
