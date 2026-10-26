/**
 * A collection whose name has a dot, end to end (roadmap CLI-75). The collection "e2e.tabs" works
 * through `createCollectionProcedures` over HTTP and over WebSocket: its calls reach the
 * procedures `["collections", "e2e.tabs", <operation>]`, and a subscriber of its change topic
 * gets the change event of each write. Before, the method `collections.e2e.tabs.set` came back as
 * the four segments `["collections", "e2e", "tabs", "set"]`, and the call got NOT_FOUND.
 */

import { describe, it, expect, afterEach } from "vitest";
import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { Client } from "../client/client.js";
import { HttpTransport } from "../adapters/http/client/index.js";
import { HttpServerTransport } from "../adapters/http/server/index.js";
import { WebSocketTransport } from "../adapters/websocket/client/transport.js";
import { WebSocketServerTransport } from "../adapters/websocket/server/transport.js";
import { ProcedureServer } from "./procedure-server.js";
import { ProcedureRegistry } from "../procedures/registry.js";
import { createCollectionProcedures } from "../procedures/collection/procedures.js";
import { collectionChangeTopic } from "../procedures/collection/changes.js";
import { collectionTopicRule } from "../procedures/collection/topic.js";
import type { CollectionStorage } from "../procedures/collection/storage.js";
import { createEventBus } from "../events/bus.js";
import type { RemoteEvent } from "../events/remote.js";
import { pathToMethod } from "./method.js";

const NAME = "e2e.tabs";

/** A storage of a Map. */
class MapStorage implements CollectionStorage<unknown> {
  readonly data = new Map<string, unknown>();
  async get(id: string) {
    return this.data.get(id);
  }
  async getAll() {
    return [...this.data.values()];
  }
  async getEntries() {
    return [...this.data.entries()];
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
  }
  async delete(id: string) {
    return this.data.delete(id);
  }
  async clear() {
    this.data.clear();
  }
  async getBatch(ids: string[]) {
    return new Map(ids.filter((id) => this.data.has(id)).map((id): [string, unknown] => [id, this.data.get(id)]));
  }
  async setBatch(items: Array<[string, unknown]>) {
    for (const [id, value] of items) this.data.set(id, value);
  }
  async deleteBatch(ids: string[]) {
    let count = 0;
    for (const id of ids) if (this.data.delete(id)) count++;
    return count;
  }
  async close() {}
}

let cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup().catch(() => {});
  cleanups = [];
});

async function listen(http: HttpServer): Promise<number> {
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", () => resolve()));
  return (http.address() as AddressInfo).port;
}

async function waitFor(check: () => boolean, what: string, limit = 3000): Promise<void> {
  const end = Date.now() + limit;
  while (!check()) {
    if (Date.now() > end) throw new Error(`timed out: ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/** A server with the collection "e2e.tabs", its procedures and the rule of its change topics. */
function hostOf(): { server: ProcedureServer; storage: MapStorage } {
  const registry = new ProcedureRegistry();
  registry.registerAll(createCollectionProcedures(NAME));
  const storage = new MapStorage();
  const server = new ProcedureServer({
    registry,
    autoRegister: true,
    collections: { [NAME]: storage },
    events: { bus: createEventBus(), topics: collectionTopicRule(NAME) },
  });
  return { server, storage };
}

interface Face {
  name: string;
  /** A client of the server, and the base URL of an HTTP face. */
  connect(server: ProcedureServer): Promise<{ client: Client; url?: string }>;
}

const faces: Face[] = [
  {
    name: "HTTP",
    async connect(server) {
      const app = express();
      app.use(express.json({ strict: false }));
      const http = createServer(app);
      server.addTransport(new HttpServerTransport(server, { app, httpServer: http }));
      await server.start();
      const port = await listen(http);
      cleanups.push(async () => {
        await server.stop();
        http.closeAllConnections();
        await new Promise<void>((resolve) => http.close(() => resolve()));
      });
      const url = `http://127.0.0.1:${port}/api`;
      return { client: new Client(new HttpTransport({ baseUrl: url })), url };
    },
  },
  {
    name: "WebSocket",
    async connect(server) {
      const http = createServer();
      server.addTransport(new WebSocketServerTransport(server, { server: http, path: "/ws", heartbeat: false }));
      await server.start();
      const port = await listen(http);
      const transport = new WebSocketTransport({ url: `ws://127.0.0.1:${port}/ws`, heartbeat: { enabled: false }, reconnect: { enabled: false } });
      cleanups.push(async () => {
        await transport.close();
        await server.stop();
        http.closeAllConnections();
        await new Promise<void>((resolve) => http.close(() => resolve()));
      });
      return { client: new Client(transport) };
    },
  },
];

describe.each(faces)("the collection e2e.tabs over $name (CLI-75)", (face) => {
  it("writes and reads through the collection procedures, and a subscriber of the change topic gets each write", async () => {
    const { server, storage } = hostOf();
    const { client } = await face.connect(server);
    expect(collectionChangeTopic(NAME)).toBe("collections.e2e%2Etabs");

    const seen: RemoteEvent[] = [];
    const subscription = client.subscribe(collectionChangeTopic(NAME), (_data, event) => void seen.push(event));
    await subscription.ready;

    await client.call(pathToMethod(["collections", NAME, "set"]), { id: "t1", value: { title: "one" } });
    expect(storage.data.get("t1")).toEqual({ title: "one" });
    expect(await client.call(pathToMethod(["collections", NAME, "get"]), { id: "t1" })).toEqual({ title: "one" });
    expect(await client.call(pathToMethod(["collections", NAME, "find"]), {})).toEqual([{ id: "t1", value: { title: "one" } }]);

    await waitFor(() => seen.length >= 1, "the change event");
    expect(seen.map((event) => event.topic)).toEqual(["collections.e2e%2Etabs"]);

    subscription();
  }, 10_000);
});

describe("the URL of a call to e2e.tabs (CLI-75)", () => {
  it("carries the encoded service, and the URI encoding keeps its %", async () => {
    const { server, storage } = hostOf();
    storage.data.set("t1", { title: "one" });
    const { url } = await faces[0]!.connect(server);
    const response = await fetch(`${url}/collections.e2e%252Etabs/get`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "t1" }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ title: "one" });
    // The raw dotted form names the four segments ["collections", "e2e", "tabs", "get"]: no procedure
    const raw = await fetch(`${url}/collections.e2e.tabs/get`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    expect(raw.status).toBe(404);
  }, 10_000);
});
