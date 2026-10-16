/**
 * A stream that can run without an end over HTTP (roadmap R15): a client without NDJSON gets
 * 406 at once, and the stream stops. A client with NDJSON reads its items.
 */

import { describe, it, expect } from "vitest";
import express from "express";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { ProcedureRegistry } from "../../procedures/registry.js";
import { defineProcedure } from "../../procedures/define.js";
import { outputSchema } from "../../procedures/core/schemas.js";
import { ProcedureServer } from "../../server/procedure-server.js";
import { HttpServerTransport } from "./server/transport.js";
import { HttpTransport } from "./client/transport.js";
import { Client } from "../../client/client.js";

async function startServer(state: { started: boolean; stopped: boolean }) {
  const registry = new ProcedureRegistry();
  registry.register(
    defineProcedure({
      path: ["test", "ticks"],
      input: outputSchema<Record<string, unknown>>(),
      output: outputSchema<number>(),
      metadata: { stream: { unbounded: true } },
      handler: async function* () {
        state.started = true;
        try {
          for (let tick = 1; ; tick++) {
            await new Promise((resolve) => setTimeout(resolve, 5));
            yield tick;
          }
        } finally {
          state.stopped = true;
        }
      },
    }),
  );
  const server = new ProcedureServer({ registry, autoRegister: true });
  const app = express();
  const http = createServer(app);
  server.addTransport(new HttpServerTransport(server, { app, httpServer: http }));
  await server.start();
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", () => resolve()));
  const close = async (): Promise<void> => {
    await server.stop();
    http.closeAllConnections();
    await new Promise<void>((resolve) => http.close(() => resolve()));
  };
  return { url: `http://127.0.0.1:${(http.address() as AddressInfo).port}/api`, close };
}

describe("an unbounded stream over HTTP (R15)", () => {
  it("refuses a request without NDJSON at once, and the stream does not run", async () => {
    const state = { started: false, stopped: false };
    const { url, close } = await startServer(state);
    try {
      const start = Date.now();
      const response = await fetch(`${url}/test/ticks`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      expect(response.status).toBe(406);
      expect(((await response.json()) as { code: string }).code).toBe("NOT_ACCEPTABLE");
      expect(Date.now() - start).toBeLessThan(2000);
      await new Promise((resolve) => setTimeout(resolve, 30));
      // The stream ends before its first item: its body never runs
      expect(state.started).toBe(false);
    } finally {
      await close();
    }
  });

  it("gives the items to a client with NDJSON", async () => {
    const { url, close } = await startServer({ started: false, stopped: false });
    try {
      const client = new Client(new HttpTransport({ baseUrl: url }));
      const seen: number[] = [];
      for await (const tick of client.stream<unknown, number>({ service: "test", operation: "ticks" }, {})) {
        seen.push(tick);
        if (seen.length === 3) break;
      }
      expect(seen).toEqual([1, 2, 3]);
    } finally {
      await close();
    }
  });
});
