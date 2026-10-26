/**
 * A collection whose name has a dot (roadmap CLI-75). The transport contract
 * (`src/testing/transport-contract.ts`, CLI-85) writes, reads and subscribes to such a collection
 * on each face. This file checks the URL of a call over HTTP and the change topic of the name.
 * Before CLI-75, the method `collections.e2e.tabs.set` came back as the four segments
 * `["collections", "e2e", "tabs", "set"]`, and the call got NOT_FOUND.
 */

import { describe, it, expect, afterEach } from "vitest";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { HttpServerTransport } from "../adapters/http/server/index.js";
import { ProcedureServer } from "./procedure-server.js";
import { ProcedureRegistry } from "../procedures/registry.js";
import { createCollectionProcedures } from "../procedures/collection/procedures.js";
import { collectionChangeTopic } from "../procedures/collection/changes.js";
import { collectionTopicRule } from "../procedures/collection/topic.js";
import { createEventBus } from "../events/bus.js";
import { LogStorage } from "../testing/log-storage.js";

const NAME = "e2e.tabs";

let cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup().catch(() => {});
  cleanups = [];
});

/** A server with the collection "e2e.tabs" over HTTP, and the base URL of its procedures. */
async function serve(storage: LogStorage): Promise<string> {
  const registry = new ProcedureRegistry();
  registry.registerAll(createCollectionProcedures(NAME));
  const server = new ProcedureServer({
    registry,
    autoRegister: true,
    collections: { [NAME]: storage },
    events: { bus: createEventBus(), topics: collectionTopicRule(NAME) },
  });
  const app = express();
  app.use(express.json({ strict: false }));
  const http = createServer(app);
  server.addTransport(new HttpServerTransport(server, { app, httpServer: http }));
  await server.start();
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", () => resolve()));
  cleanups.push(async () => {
    await server.stop();
    http.closeAllConnections();
    await new Promise<void>((resolve) => http.close(() => resolve()));
  });
  return `http://127.0.0.1:${(http.address() as AddressInfo).port}/api`;
}

describe("the URL of a call to e2e.tabs (CLI-75)", () => {
  it("carries the encoded service, and the URI encoding keeps its %", async () => {
    const url = await serve(new LogStorage({ t1: { title: "one" } }));
    expect(collectionChangeTopic(NAME)).toBe("collections.e2e%2Etabs");
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
