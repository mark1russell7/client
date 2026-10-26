/**
 * The row filter of the change events over the network (roadmap CLI-78). Two principals subscribe
 * to one topic of a collection, one with full rights and one with a rule of the rows. Each one gets
 * the ids of the rows that it can read and no others, over HTTP and over WebSocket. A change of the
 * rights takes effect at the next re-check (roadmap CLI-44).
 */

import { describe, it, expect, afterEach } from "vitest";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { createRegistry } from "../procedures/module.js";
import type { AdmitItem } from "../procedures/invoke.js";
import type { CollectionAdmission } from "../procedures/collection/admission.js";
import type { CollectionChangeEvent } from "../procedures/collection/changes.js";
import type { CollectionStorage, StorageChanges } from "../procedures/collection/storage.js";
import { ProcedureServer } from "./procedure-server.js";
import { pathToMethod } from "./method.js";
import { Client } from "../client/client.js";
import type { PrincipalOf } from "./types.js";
import { procedureHandler } from "../adapters/http/server/handler.js";
import { upgradeHandler } from "../adapters/websocket/server/upgrade.js";
import { HttpTransport } from "../adapters/http/client/transport.js";
import { WebSocketTransport } from "../adapters/websocket/client/transport.js";
import { subscribeRemote, type EventTransport, type Subscription } from "../events/remote.js";

/** A storage of a Map with a change log (`v:<number>`). */
class LogStorage implements CollectionStorage<unknown> {
  readonly data = new Map<string, unknown>();
  private seq = 0;
  private readonly changedAt = new Map<string, number>();
  private readonly deletedAt = new Map<string, number>();

  constructor(items: Record<string, unknown>) {
    for (const [id, value] of Object.entries(items)) this.data.set(id, value);
  }
  async get(id: string) {
    return this.data.get(id);
  }
  async getAll() {
    return [...this.data.values()];
  }
  async getEntries() {
    return [...this.data.entries()];
  }
  async getChangesSince(since?: string): Promise<StorageChanges<unknown>> {
    const version = `v:${this.seq}`;
    if (since === undefined) return { version, full: true, changed: [...this.data.entries()], deleted: [] };
    const from = Number(since.slice(2));
    const changed = [...this.changedAt].filter(([, at]) => at > from).map(([id]): [string, unknown] => [id, this.data.get(id)]);
    const deleted = [...this.deletedAt].filter(([, at]) => at > from).map(([id]) => id);
    return { version, full: false, changed, deleted };
  }
  async find(predicate: (item: unknown) => boolean) {
    return [...this.data.values()].filter(predicate);
  }
  async has(id: string) {
    return this.data.has(id);
  }
  async size() {
    return this.data.size;
  }
  async set(id: string, value: unknown) {
    this.data.set(id, value);
    this.changedAt.set(id, ++this.seq);
    this.deletedAt.delete(id);
  }
  async delete(id: string) {
    const existed = this.data.delete(id);
    if (existed) {
      this.deletedAt.set(id, ++this.seq);
      this.changedAt.delete(id);
    }
    return existed;
  }
  async clear() {
    for (const id of [...this.data.keys()]) await this.delete(id);
  }
  async setBatch(items: Array<[string, unknown]>) {
    for (const [id, value] of items) await this.set(id, value);
  }
  async deleteBatch(ids: string[]) {
    let count = 0;
    for (const id of ids) if (await this.delete(id)) count++;
    return count;
  }
  async getBatch(ids: string[]) {
    return new Map(ids.filter((id) => this.data.has(id)).map((id): [string, unknown] => [id, this.data.get(id)]));
  }
  async close() {}
}

/** The groups of each principal: a test changes them to change the rights. */
let shared: Record<string, string[]> = {};

/** The rule of the rows: root reads each note, and a note is for its owner and for the principals that the owner shares with. */
const ownRows: AdmitItem = (row, invocation) => {
  const me = invocation.principal?.id ?? "";
  if (me === "root") return true;
  const owner = String(((row as { value: unknown }).value as Record<string, unknown> | null)?.["owner"]);
  return owner === me || (shared[me] ?? []).includes(owner);
};
const admission: CollectionAdmission = { admit: ownRows, admitsAll: (invocation) => invocation.principal?.id === "root" };

/** The principal of a request: the header `x-who` of an HTTP request, or `?who=` of the upgrade of a WebSocket. */
const principalOf: PrincipalOf = ({ headers = {}, query = {} }) => {
  const who = headers["x-who"] ?? query["who"];
  return who ? { principal: { id: who, via: "test" } } : {};
};

let cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup();
  cleanups = [];
  shared = {};
});

/** A server of the collection "notes" on HTTP (/api/proc) and WebSocket (/ws). */
async function start() {
  const server = new ProcedureServer({ registry: createRegistry(), principalOf, events: { topics: ["collections.*"] } });
  server.useStorage("notes", new LogStorage({ a1: { owner: "ann" }, b1: { owner: "bob" } }));
  server.registerCollectionProcedures("notes", { admission });
  const handler = procedureHandler(server, { basePath: "/api/proc" });
  const upgrade = upgradeHandler(server, { path: "/ws", heartbeat: false });
  const http = createServer((req, res) => {
    if (!handler(req, res)) res.end("app");
  });
  http.on("upgrade", (req, socket, head) => {
    if (!upgrade(req, socket, head)) socket.destroy();
  });
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", () => resolve()));
  const port = (http.address() as AddressInfo).port;
  cleanups.push(async () => {
    upgrade.close();
    await server.stop();
    http.closeAllConnections();
    await new Promise<void>((resolve) => http.close(() => resolve()));
  });
  const base = `http://127.0.0.1:${port}/api/proc`;
  /** A call of root over HTTP. */
  const client = new Client(new HttpTransport({ baseUrl: base, defaultHeaders: { "x-who": "root" } }));
  const write = async (operation: string, input: unknown): Promise<void> => {
    await client.call(pathToMethod(["collections", "notes", operation]), input);
  };
  const http1 = (who: string): EventTransport => new HttpTransport({ baseUrl: base, defaultHeaders: { "x-who": who } });
  const ws = (who: string): EventTransport => {
    const transport = new WebSocketTransport({ url: `ws://127.0.0.1:${port}/ws?who=${who}`, heartbeat: { enabled: false }, reconnect: { enabled: false } });
    cleanups.push(() => transport.close());
    return transport;
  };
  return { server, write, http: http1, ws };
}

/** A subscription to the topic of the notes: the events that it gets. */
async function subscribe(transport: EventTransport): Promise<{ events: CollectionChangeEvent[]; subscription: Subscription }> {
  const events: CollectionChangeEvent[] = [];
  const subscription = subscribeRemote<CollectionChangeEvent>(transport, "collections.notes", (data) => void events.push(data));
  cleanups.push(() => subscription());
  await subscription.ready;
  return { events, subscription };
}

async function waitFor(check: () => boolean, what: string, limit = 5000): Promise<void> {
  const end = Date.now() + limit;
  while (!check()) {
    if (Date.now() > end) throw new Error(`waitFor: ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

/** The ids of the events: `changed` and `deleted` of each. */
const idsOf = (events: readonly CollectionChangeEvent[]) => events.map(({ changed, deleted, reset }) => ({ changed, deleted, ...(reset === true && { reset }) }));

describe("the row filter of the change events over the network (CLI-78)", () => {
  for (const face of ["http", "ws"] as const) {
    it(`gives each subscriber the ids of the rows that it can read and no others, over ${face}`, async () => {
      const host = await start();
      const root = await subscribe(host[face]("root"));
      const ann = await subscribe(host[face]("ann"));
      // A pull starts the chain of the events
      await host.write("changes", {});
      await host.write("set", { id: "a2", value: { owner: "ann" } });
      await host.write("set", { id: "b2", value: { owner: "bob" } });
      // Ann's note goes to Bob: Ann gets a delete
      await host.write("set", { id: "a1", value: { owner: "bob" } });
      await host.write("delete", { id: "b1" });
      await waitFor(() => root.events.length === 4 && ann.events.length === 2, "the events");
      expect(idsOf(root.events)).toEqual([
        { changed: ["a2"], deleted: [] },
        { changed: ["b2"], deleted: [] },
        { changed: ["a1"], deleted: [] },
        { changed: [], deleted: ["b1"] },
      ]);
      expect(idsOf(ann.events)).toEqual([
        { changed: ["a2"], deleted: [] },
        { changed: [], deleted: ["a1"] },
      ]);
      // The chain of Ann's events has no hole: the `since` of each event is the `version` of the one before
      expect(ann.events[1]!.since).toBe(ann.events[0]!.version);

      // Bob shares his notes with Ann: the re-check gives Ann a reset hint, and then the notes of Bob
      shared = { ann: ["bob"] };
      await host.server.publisher!.rightsChanged();
      await host.write("set", { id: "b3", value: { owner: "bob" } });
      await waitFor(() => root.events.length === 5 && ann.events.length === 4, "the events after the change of the rights");
      expect(idsOf(ann.events.slice(2))).toEqual([
        { changed: [], deleted: [], reset: true },
        { changed: ["b3"], deleted: [] },
      ]);
      expect(root.events.some((event) => event.reset === true)).toBe(false);
    });
  }
});
