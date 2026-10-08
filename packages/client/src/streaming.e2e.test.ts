/**
 * Streaming end to end over real servers on 127.0.0.1 (ARCHITECTURE-PROPOSALS P3).
 *
 * Regressions: BUGS-2026-07 H9 (generator handlers), H5 (the WebSocket client resolved on the
 * first frame and dropped the others, and the server never sent stream frames).
 *
 * Each streaming test proves that the items arrive one by one: the procedure does not yield its
 * second item until the test has read the first. A transport that buffered the stream would
 * never deliver the first item, and the test would time out.
 */

import { describe, it, expect, afterEach } from "vitest";
import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { z } from "zod";
import { Client } from "./client/client.js";
import { HttpTransport } from "./adapters/http/client/index.js";
import { WebSocketTransport } from "./adapters/websocket/client/transport.js";
import { HttpServerTransport } from "./adapters/http/server/index.js";
import { WebSocketServerTransport } from "./adapters/websocket/server/transport.js";
import { ProcedureServer } from "./server/procedure-server.js";
import { ProcedureRegistry } from "./procedures/registry.js";
import { defineProcedure } from "./procedures/define.js";
import { outputSchema, zodAdapter } from "./procedures/core/schemas.js";
import type { Transport } from "./client/types.js";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A gate that the test opens: the procedure waits for it before its next item. */
class Gate {
  private open: (() => void) | undefined;
  private promise = new Promise<void>((resolve) => (this.open = resolve));
  wait(): Promise<void> {
    return this.promise;
  }
  release(): void {
    this.open?.();
  }
}

interface Harness {
  client: Client;
  gate: Gate;
  closed: string[];
  raw: { url: string } | undefined;
}

let cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup().catch(() => {});
  cleanups = [];
});

function makeServer(gate: Gate, closed: string[]): ProcedureServer {
  const registry = new ProcedureRegistry();
  registry.register(
    defineProcedure({
      path: ["test", "gated"],
      input: outputSchema<Record<string, never>>(),
      output: outputSchema<string>(),
      handler: async function* () {
        try {
          yield "first";
          await gate.wait();
          yield "second";
          yield "third";
        } finally {
          closed.push("gated");
        }
      },
    }),
  );
  registry.register(
    defineProcedure({
      path: ["test", "ticks"],
      input: outputSchema<Record<string, never>>(),
      output: outputSchema<number>(),
      handler: async function* () {
        try {
          for (let n = 0; ; n++) {
            yield n;
            await sleep(5);
          }
        } finally {
          closed.push("ticks");
        }
      },
    }),
  );
  registry.register(
    defineProcedure({
      path: ["test", "breaks"],
      input: outputSchema<Record<string, never>>(),
      output: outputSchema<number>(),
      handler: async function* () {
        yield 1;
        throw new Error("broke in the middle");
      },
    }),
  );
  registry.register(
    defineProcedure({
      path: ["test", "double"],
      input: zodAdapter<{ n: number }>(z.object({ n: z.number() })),
      output: outputSchema<number>(),
      handler: (input: { n: number }) => input.n * 2,
    }),
  );
  return new ProcedureServer({ registry, autoRegister: true });
}

async function listen(http: HttpServer): Promise<number> {
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", () => resolve()));
  return (http.address() as AddressInfo).port;
}

async function startHttp(): Promise<Harness> {
  const gate = new Gate();
  const closed: string[] = [];
  const server = makeServer(gate, closed);
  const app = express();
  app.use(express.json());
  const http = createServer(app);
  const transport = new HttpServerTransport(server, { app, httpServer: http, basePath: "/api" });
  server.addTransport(transport);
  await server.start();
  const port = await listen(http);
  cleanups.push(async () => {
    await new Promise<void>((resolve) => http.close(() => resolve()));
  });
  const url = `http://127.0.0.1:${port}/api`;
  return { client: new Client(new HttpTransport({ baseUrl: url })), gate, closed, raw: { url } };
}

async function startWebSocket(): Promise<Harness> {
  const gate = new Gate();
  const closed: string[] = [];
  const server = makeServer(gate, closed);
  const http = createServer();
  const transport = new WebSocketServerTransport(server, { server: http, path: "/ws" });
  server.addTransport(transport);
  await server.start();
  const port = await listen(http);
  const client: Transport = new WebSocketTransport({ url: `ws://127.0.0.1:${port}/ws`, heartbeat: { enabled: false } });
  cleanups.push(async () => {
    await client.close();
    await transport.stop();
    await new Promise<void>((resolve) => http.close(() => resolve()));
  });
  return { client: new Client(client), gate, closed, raw: undefined };
}

async function waitFor(check: () => boolean, ms = 2000): Promise<void> {
  const until = Date.now() + ms;
  while (!check()) {
    if (Date.now() > until) throw new Error("timed out");
    await sleep(10);
  }
}

for (const [name, start] of [
  ["HTTP (NDJSON)", startHttp],
  ["WebSocket", startWebSocket],
] as const) {
  describe(`streaming over ${name}`, () => {
    it("delivers each item when the procedure yields it", async () => {
      const { client, gate } = await start();
      const items: string[] = [];
      for await (const item of client.stream<unknown, string>({ service: "test", operation: "gated" }, {})) {
        items.push(item);
        if (item === "first") gate.release();
      }
      expect(items).toEqual(["first", "second", "third"]);
    }, 10_000);

    it("call() gives the last item", async () => {
      const { client, gate } = await start();
      gate.release();
      expect(await client.call({ service: "test", operation: "gated" }, {})).toBe("third");
    }, 10_000);

    it("stops the procedure on the server when the reader stops early", async () => {
      const { client, closed } = await start();
      const items: number[] = [];
      for await (const n of client.stream<unknown, number>({ service: "test", operation: "ticks" }, {})) {
        items.push(n);
        if (items.length === 3) break;
      }
      expect(items).toEqual([0, 1, 2]);
      await waitFor(() => closed.includes("ticks"));
    }, 10_000);

    it("ends with the error of a procedure that fails in the middle", async () => {
      const { client } = await start();
      const items: number[] = [];
      await expect(
        (async () => {
          for await (const n of client.stream<unknown, number>({ service: "test", operation: "breaks" }, {})) items.push(n);
        })(),
      ).rejects.toThrow("broke in the middle");
      expect(items).toEqual([1]);
    }, 10_000);

    it("stops when the caller's signal aborts", async () => {
      const { client, closed } = await start();
      const controller = new AbortController();
      const items: number[] = [];
      await expect(
        (async () => {
          for await (const n of client.stream<unknown, number>({ service: "test", operation: "ticks" }, {}, { signal: controller.signal })) {
            items.push(n);
            if (items.length === 2) controller.abort();
          }
        })(),
      ).rejects.toThrow();
      expect(items.length).toBeGreaterThanOrEqual(2);
      await waitFor(() => closed.includes("ticks"));
    }, 10_000);

    it("keeps request/response procedures as before, with input validation", async () => {
      const { client } = await start();
      expect(await client.call({ service: "test", operation: "double" }, { n: 21 })).toBe(42);
      await expect(client.call({ service: "test", operation: "double" }, { n: "x" })).rejects.toThrow(/Input validation failed/);
    }, 10_000);
  });
}

describe("HTTP stream responses for a client without NDJSON", () => {
  it("gives the last item as plain JSON (curl, a browser fetch)", async () => {
    const { gate, raw } = await startHttp();
    gate.release();
    const response = await fetch(`${raw!.url}/test/gated`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toBe("third");
  }, 10_000);

  it("gives NDJSON lines to a client that accepts them", async () => {
    const { gate, raw } = await startHttp();
    gate.release();
    const response = await fetch(`${raw!.url}/test/gated`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" },
      body: "{}",
    });
    const lines = (await response.text()).trim().split("\n").map((line) => JSON.parse(line) as unknown);
    expect(lines).toEqual([
      { type: "item", payload: "first" },
      { type: "item", payload: "second" },
      { type: "item", payload: "third" },
      { type: "done" },
    ]);
  }, 10_000);
});
