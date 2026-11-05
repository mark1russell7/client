/**
 * The ways that the offline queue of `HybridStorage` loses a write or stops, on a real procedures
 * host over this store (roadmap CLI-108). The remote is `ApiStorage` over HTTP or WebSocket, with the
 * size limits of the host. The second writer is the store on the server.
 *
 * A row states the wanted result, and it prints a line `queue-row {json}` with its reading. The
 * function `redToday` holds a known fault: the row is green while the wanted result fails. The row
 * goes red when a fix makes the wanted result pass. So a fix must change that row into a plain assert.
 * The rows with no fault use the same wanted results. So each wanted result can pass.
 *
 * These rows need `MONGO_TEST_URL`.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { MongoClient, type Db } from "mongodb";
import { service, type Lifecycle } from "@mark1russell7/service";
import { fakeProcess } from "@mark1russell7/service/testing";
import { Client, HttpTransport, WebSocketTransport, createRegistry, ms, seconds, type CollectionAdmission } from "@procedures/client";
import { LOCAL_LISTENER_KNOBS, createProcedureHost } from "@procedures/peer";
import { ApiStorage, HybridStorage, MemoryQueueStore, type DroppedWrite, type HybridStorageOptions } from "@procedures/store";
import { MongoDocumentStorage } from "./document-storage.js";

const url = process.env["MONGO_TEST_URL"];

type Item = { id: string; n: number; rev: string; body?: string };

const versionOf = (item: Item): string | undefined => item.rev;

const MEBIBYTE = 1024 * 1024;
/** The default limit of a request body and of a WebSocket frame on the host is 1 MiB. */
const OVER_THE_LIMIT = 2 * MEBIBYTE;
const UNDER_THE_LIMIT = 100 * 1024;
const FLUSH_TRIES = 10;
const FLUSH_GAP_MS = 200;
/** The limit of one row. On CI, 10 refused flushes of a batch over the limit took 26 s (run 42096946434), and too-large-http flushes twice. */
const ROW_TIMEOUT_MS = 90_000;
const SMALL_IDS = ["s1", "s2", "s3"];

const large = (id: string, size = OVER_THE_LIMIT): Item => ({ id, n: 1, rev: "L", body: "x".repeat(size) });
const small = (id: string): Item => ({ id, n: 1, rev: "L" });

let mongo: MongoClient;
let db: Db;
let next = 0;
let cleanups: Array<() => Promise<unknown>> = [];

function printRow(row: Record<string, unknown>): void {
  console.log(`queue-row ${JSON.stringify(row)}`);
}

/** This function holds a known fault: the wanted result must fail today. */
function redToday(wanted: () => void): void {
  expect(wanted).toThrow();
}

/** The store on the server, and a host that serves it with the HTTP and the WebSocket faces. */
async function hostOf(admission?: CollectionAdmission): Promise<{ store: MongoDocumentStorage<Item>; http: string; ws: string }> {
  next += 1;
  const store = new MongoDocumentStorage<Item>({ collection: `queue_${next}`, db: () => db, versionOf, transactions: "never" });
  const name = `queue-${next}`;
  const host = createProcedureHost({
    name,
    registry: createRegistry({ name, procedures: [] }),
    collections: { items: { storage: store as never, procedures: admission === undefined ? true : { admission } } },
    faces: { http: true, ws: true },
    listen: [{ port: 0, knobs: LOCAL_LISTENER_KNOBS }],
  });
  const life: Lifecycle = await host
    .declare(service(name))
    .readiness({ type: "debounce", interval: seconds(5), failAfter: 3, recoverAfter: 1 })
    .liveness({ type: "window", failAfter: seconds(45) })
    .startup(seconds(10))
    .phase("fail readiness", ms(10))
    .phase("stop intake", ms(100))
    .phase("drain", ms(100))
    .phase("close transports", ms(100))
    .phase("stop the poller", ms(100))
    .phase("tear down dependencies", ms(100))
    .phase("close the health server", ms(100))
    .cooperativeWindow(ms(100))
    .onRepeatSignal("ignore")
    .run({ process: fakeProcess() });
  cleanups.push(async () => {
    for (const part of [...host.parts].reverse()) await part.impl.close();
    await life.shutdown("the row ended");
    await life.done;
  });
  const address = (type: string): string => host.info.endpoints().find((endpoint) => endpoint.type === type)!.address;
  return { store, http: address("http"), ws: address("websocket") };
}

/** A client of the host, as a person's device has: a storage with a queue that a test flushes. */
function deviceOf(remote: ApiStorage<Item>, options: HybridStorageOptions = {}) {
  const drops: DroppedWrite[] = [];
  const queue = new MemoryQueueStore();
  const hybrid = new HybridStorage<Item>(remote, {
    mode: "write-back",
    syncOnInit: false,
    syncInterval: ms(0),
    queueStore: queue,
    onDropped: (drop) => void drops.push(drop),
    ...options,
  });
  cleanups.push(() => hybrid.close().catch(() => undefined));
  return { hybrid, drops, queue };
}

function httpDevice(address: string, options: HybridStorageOptions = {}) {
  const client = new Client({ transport: new HttpTransport({ baseUrl: address }) });
  return deviceOf(new ApiStorage<Item>(client, { collection: "items", retry: false }), options);
}

/** The codes of the failed flushes, and what a person's screen can read after them. */
async function flushes(hybrid: HybridStorage<Item>, tries = FLUSH_TRIES): Promise<{ codes: string[]; windowMs: number }> {
  const from = Date.now();
  const codes: string[] = [];
  for (let attempt = 0; attempt < tries; attempt += 1) {
    await hybrid.flush().catch((error: unknown) => {
      const { code, name } = error as { code?: unknown; name?: unknown };
      codes.push(String(code ?? name));
    });
    if (hybrid.getPendingOpsCount() === 0) break;
    await new Promise((resolve) => setTimeout(resolve, FLUSH_GAP_MS));
  }
  return { codes: [...new Set(codes)], windowMs: Date.now() - from };
}

/** The status that a screen reads, with the age of each queued write. */
async function screen(hybrid: HybridStorage<Item>, queue: MemoryQueueStore): Promise<Record<string, unknown>> {
  const status = hybrid.getStatus();
  const now = Date.now();
  const errorCode = (status as { error?: { code?: unknown } }).error?.code;
  return {
    connected: status.connected,
    pending: status.pendingChanges,
    errorCode,
    queuedAgesMs: (await queue.load()).map((op) => now - op.timestamp),
  };
}

const arrived = async (store: MongoDocumentStorage<Item>, ids: readonly string[]): Promise<string[]> => {
  const found = await store.getBatch([...ids]);
  return ids.filter((id) => found.has(id));
};

describe.runIf(url)("the offline queue on a real host", () => {
  beforeAll(async () => {
    mongo = new MongoClient(url!);
    await mongo.connect();
    db = mongo.db(`offline_queue_${process.pid}`);
  });

  afterEach(async () => {
    for (const cleanup of cleanups.splice(0).reverse()) await cleanup().catch(() => undefined);
  });

  afterAll(async () => {
    await db?.dropDatabase().catch(() => undefined);
    await mongo?.close();
  });

  it("no-fault-http: each write reaches the remote, and the queue ends", { timeout: ROW_TIMEOUT_MS }, async () => {
    const { store, http } = await hostOf();
    const { hybrid, drops, queue } = httpDevice(http, { versionOf });
    await hybrid.set("a", small("a"));
    await hybrid.setBatch(SMALL_IDS.map((id) => [id, small(id)]));
    const read = await flushes(hybrid);
    const reached = await arrived(store, ["a", ...SMALL_IDS]);
    printRow({ name: "no-fault-http", reached, drops: drops.length, ...read, ...(await screen(hybrid, queue)) });
    expect(reached).toEqual(["a", ...SMALL_IDS]);
    expect(hybrid.getPendingOpsCount()).toBe(0);
  });

  it("no-fault-ws: each write reaches the remote over WebSocket", { timeout: ROW_TIMEOUT_MS }, async () => {
    const { store, ws } = await hostOf();
    const transport = new WebSocketTransport({ url: ws, heartbeat: { enabled: false } });
    cleanups.push(() => transport.close());
    const { hybrid, queue } = deviceOf(new ApiStorage<Item>(new Client({ transport }), { collection: "items", retry: false }), { versionOf });
    await hybrid.set("a", small("a"));
    const read = await flushes(hybrid);
    const reached = await arrived(store, ["a"]);
    printRow({ name: "no-fault-ws", reached, ...read, ...(await screen(hybrid, queue)) });
    expect(reached).toEqual(["a"]);
  });

  it.each([
    ["flush", (hybrid: HybridStorage<Item>) => flushes(hybrid)],
    ["sync", async (hybrid: HybridStorage<Item>) => { await hybrid.sync().catch(() => undefined); return { codes: [], windowMs: 0 }; }],
  ] as const)("lost-no-version-%s: a queued write with no versionOf does not go over the write of another client", { timeout: ROW_TIMEOUT_MS }, async (how, push) => {
    const { store, http } = await hostOf();
    await store.set("a", { id: "a", n: 1, rev: "1" });
    const { hybrid, drops } = httpDevice(http);
    await hybrid.syncFromRemote();
    await hybrid.set("a", { id: "a", n: 5, rev: "L" });
    await store.set("a", { id: "a", n: 9, rev: "2" });
    await push(hybrid);
    const remote = await store.get("a");
    const local = await hybrid.get("a");
    printRow({ name: `lost-no-version-${how}`, remoteN: remote?.n, localN: local?.n, drops: drops.length });
    // The write of the other client is on the remote, or the device reports the overlap
    redToday(() => expect(remote?.n === 9 || drops.length > 0).toBe(true));
  });

  it("lost-unknown-base: a queued write with an unknown base does not go over the write of another client", { timeout: ROW_TIMEOUT_MS }, async () => {
    const { store, http } = await hostOf();
    await store.set("a", { id: "a", n: 9, rev: "2" });
    const { hybrid, drops } = httpDevice(http, { versionOf });
    await hybrid.set("a", { id: "a", n: 5, rev: "L" });
    const read = await flushes(hybrid);
    const remote = await store.get("a");
    printRow({ name: "lost-unknown-base", remoteN: remote?.n, drops: drops.length, ...read });
    redToday(() => expect(remote?.n === 9 || drops.length > 0).toBe(true));
  });

  it("lost-default-drop: the default policy drops the queued write, and the hook gets its value", { timeout: ROW_TIMEOUT_MS }, async () => {
    const { store, http } = await hostOf();
    await store.set("a", { id: "a", n: 1, rev: "1" });
    const { hybrid, drops } = httpDevice(http, { versionOf });
    await hybrid.syncFromRemote();
    await hybrid.set("a", { id: "a", n: 5, rev: "L" });
    await store.set("a", { id: "a", n: 9, rev: "2" });
    const read = await flushes(hybrid);
    const remote = await store.get("a");
    const local = await hybrid.get("a");
    printRow({ name: "lost-default-drop", remoteN: remote?.n, localN: local?.n, drops: drops.map(({ id, reason, during }) => ({ id, reason, during })), ...read });
    expect(remote?.n).toBe(9);
    expect(drops.map((drop) => [drop.id, drop.reason, (drop.value as Item).n])).toEqual([["a", "conflict", 5]]);
  });

  it("error-policy: a conflict under the policy error leaves the writes behind it free to go", { timeout: ROW_TIMEOUT_MS }, async () => {
    const { store, http } = await hostOf();
    await store.set("a", { id: "a", n: 1, rev: "1" });
    const { hybrid, drops, queue } = httpDevice(http, { versionOf, conflictResolution: "error" });
    await hybrid.syncFromRemote();
    await hybrid.set("a", { id: "a", n: 5, rev: "L" });
    await store.set("a", { id: "a", n: 9, rev: "2" });
    for (const id of SMALL_IDS) await hybrid.set(id, small(id));
    const read = await flushes(hybrid);
    const reached = await arrived(store, SMALL_IDS);
    printRow({ name: "error-policy", reached, drops: drops.length, ...read, ...(await screen(hybrid, queue)) });
    redToday(() => expect(reached).toEqual(SMALL_IDS));
  });

  it("too-large-http: one write over the limit leaves the writes behind it free to go", { timeout: ROW_TIMEOUT_MS }, async () => {
    const { store, http } = await hostOf();
    const { hybrid, drops, queue } = httpDevice(http, { versionOf });
    await hybrid.set("big", large("big"));
    for (const id of SMALL_IDS) await hybrid.set(id, small(id));
    const read = await flushes(hybrid);
    const reached = await arrived(store, SMALL_IDS);
    const seen = await screen(hybrid, queue);
    // A restart reads the same queue: the stop outlives the process
    const again = deviceOf(new ApiStorage<Item>(new Client({ transport: new HttpTransport({ baseUrl: http }) }), { collection: "items", retry: false }), { versionOf, queueStore: queue });
    await again.hybrid.whenQueued();
    const afterRestart = await flushes(again.hybrid, 2);
    const reachedAfterRestart = await arrived(store, SMALL_IDS);
    printRow({ name: "too-large-http", reached, drops: drops.length, ...read, ...seen, restartPending: again.hybrid.getPendingOpsCount(), restartCodes: afterRestart.codes, reachedAfterRestart });
    redToday(() => expect(reached).toEqual(SMALL_IDS));
  });

  it("too-large-ws: a write over the limit names itself, and another call of the connection does not get its code", { timeout: ROW_TIMEOUT_MS }, async () => {
    const { store, ws } = await hostOf();
    await store.set("other", small("other"));
    const transport = new WebSocketTransport({ url: ws, heartbeat: { enabled: false } });
    cleanups.push(() => transport.close());
    const remote = new ApiStorage<Item>(new Client({ transport }), { collection: "items", retry: false });
    const { hybrid, drops, queue } = deviceOf(remote, { versionOf });
    await hybrid.set("big", large("big"));
    for (const id of SMALL_IDS) await hybrid.set(id, small(id));
    const pushed = hybrid.flush().catch((error: unknown) => (error as { code?: unknown }).code);
    // Reads of the same connection while the large frame goes
    const reads = await Promise.allSettled(
      Array.from({ length: 40 }, async (_, index) => {
        await new Promise((resolve) => setTimeout(resolve, index));
        return remote.get("other");
      }),
    );
    const firstCode = await pushed;
    const otherCodes = reads.flatMap((read) => (read.status === "rejected" ? [String((read.reason as { code?: unknown }).code)] : []));
    const read = await flushes(hybrid, 5);
    const reached = await arrived(store, SMALL_IDS);
    printRow({ name: "too-large-ws", firstCode, otherFailed: otherCodes.length, otherCodes: [...new Set(otherCodes)], otherOk: reads.length - otherCodes.length, reached, drops: drops.length, ...read, ...(await screen(hybrid, queue)) });
    redToday(() => expect(otherCodes).toEqual([]));
    redToday(() => expect(reached).toEqual(SMALL_IDS));
  });

  it("too-large-batch: one write over the limit in a batch leaves its small siblings free to go", { timeout: ROW_TIMEOUT_MS }, async () => {
    const { store, http } = await hostOf();
    const { hybrid, drops, queue } = httpDevice(http, { versionOf });
    await hybrid.setBatch([["big", large("big")], ...SMALL_IDS.map((id): [string, Item] => [id, small(id)])]);
    const read = await flushes(hybrid);
    const reached = await arrived(store, SMALL_IDS);
    printRow({ name: "too-large-batch", reached, drops: drops.length, ...read, ...(await screen(hybrid, queue)) });
    redToday(() => expect(reached).toEqual(SMALL_IDS));
  });

  it("too-large-sum: a batch of small writes over the limit reaches the remote", { timeout: ROW_TIMEOUT_MS }, async () => {
    const { store, http } = await hostOf();
    const { hybrid, drops, queue } = httpDevice(http, { versionOf });
    const ids = Array.from({ length: 12 }, (_, index) => `s${index}`);
    await hybrid.setBatch(ids.map((id): [string, Item] => [id, large(id, UNDER_THE_LIMIT)]));
    const read = await flushes(hybrid);
    const reached = await arrived(store, ids);
    printRow({ name: "too-large-sum", reached: reached.length, of: ids.length, drops: drops.length, ...read, ...(await screen(hybrid, queue)) });
    redToday(() => expect(reached).toEqual(ids));
  });

  it("refused-batch: a refusal of one id leaves its small siblings free to go", { timeout: ROW_TIMEOUT_MS }, async () => {
    const { store, http } = await hostOf({ guard: (write) => write.id !== "bad" });
    const { hybrid, drops, queue } = httpDevice(http, { versionOf });
    await hybrid.setBatch([["bad", small("bad")], ...SMALL_IDS.map((id): [string, Item] => [id, small(id)])]);
    const read = await flushes(hybrid);
    const reached = await arrived(store, SMALL_IDS);
    const local = await hybrid.getBatch(SMALL_IDS);
    printRow({ name: "refused-batch", reached, localLeft: [...local.keys()], drops: drops.map(({ id, reason }) => ({ id, reason })), ...read, ...(await screen(hybrid, queue)) });
    expect(drops.map((drop) => drop.id).sort()).toEqual(["bad", ...SMALL_IDS].sort());
    redToday(() => expect(reached).toEqual(SMALL_IDS));
  });
});
