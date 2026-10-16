/**
 * The soak test of the WebSocket transport (roadmap R32). It starts only with `SOAK_MINUTES`:
 * the nightly workflow gives it 10 minutes.
 *
 * Clients send a mix of calls for the whole time: values, streams that the reader stops, aborts,
 * calls of the server to the client, and reconnects. At the end, each call has an answer, the
 * maps of the two sides are empty, and the heap grew less than a limit. Node runs the test with
 * `--expose-gc`, so the heap is measured after a collection.
 */

import { describe, it, expect } from "vitest";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { z } from "zod";
import { Client } from "./client/client.js";
import { WebSocketTransport } from "./adapters/websocket/client/transport.js";
import { WebSocketServerTransport } from "./adapters/websocket/server/transport.js";
import { createProcedure } from "./procedures/define.js";
import { createRegistry } from "./procedures/module.js";
import { ProcedureServer } from "./server/procedure-server.js";
import { pathToMethod } from "./server/method.js";

const minutes = Number(process.env["SOAK_MINUTES"] ?? 0);
/** The growth of the heap that the test allows, in megabytes. */
const HEAP_LIMIT_MB = Number(process.env["SOAK_HEAP_MB"] ?? 64);
const CLIENTS = 4;
const read = { reads: [], writes: [] };
const sleep = (time: number) => new Promise((resolve) => setTimeout(resolve, time));

function heapMb(): number {
  (globalThis as { gc?: () => void }).gc?.();
  return process.memoryUsage().heapUsed / 1024 / 1024;
}

function registry() {
  return createRegistry({
    name: "soak",
    procedures: [
      createProcedure()
        .path(["soak", "echo"])
        .input(z.object({ n: z.number() }))
        .output(z.number())
        .meta({ effects: read })
        .handler(async (input) => input.n)
        .build(),
      createProcedure()
        .path(["soak", "count"])
        .input(z.object({ to: z.number() }))
        .output(z.number())
        .meta({ effects: read })
        .handler(async function* (input: { to: number }) {
          for (let n = 1; n <= input.to; n++) yield n;
        } as never)
        .build(),
      createProcedure()
        .path(["soak", "slow"])
        .input(z.object({}))
        .output(z.string())
        .meta({ effects: read })
        .handler(async (_input, ctx) => {
          await new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, 200);
            ctx.signal?.addEventListener("abort", () => {
              clearTimeout(timer);
              resolve();
            }, { once: true });
          });
          return "done";
        })
        .build(),
    ],
  });
}

describe.runIf(minutes > 0)("the WebSocket transport under load (R32)", () => {
  it(`keeps its maps empty and its heap flat for ${minutes} minutes`, async () => {
    const host = new ProcedureServer({ registry: registry(), autoRegister: true });
    const http = createServer();
    const wsServer = new WebSocketServerTransport(host, { server: http, path: "/ws" });
    host.addTransport(wsServer);
    await host.start();
    await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", () => resolve()));
    const port = (http.address() as AddressInfo).port;

    // Each client also serves soak.* to the server: the server calls back over the connection
    const clientServer = new ProcedureServer({ registry: registry(), autoRegister: true });
    const transports = Array.from(
      { length: CLIENTS },
      () => new WebSocketTransport({ url: `ws://127.0.0.1:${port}/ws`, serve: clientServer, reconnect: { enabled: true } }),
    );
    const clients = transports.map((transport) => new Client({ transport, throwOnError: true }));
    const end = Date.now() + minutes * 60_000;
    const counts = { calls: 0, failures: 0, reconnects: 0 };

    const until = async (check: () => boolean, limit = 10_000) => {
      const stop = Date.now() + limit;
      while (!check() && Date.now() < stop) await sleep(10);
      return check();
    };
    await until(() => transports.every((transport) => transport.isConnected()));
    await sleep(500);
    const heapBefore = heapMb();

    const loop = async (index: number) => {
      const client = clients[index]!;
      const transport = transports[index]!;
      let step = 0;
      while (Date.now() < end) {
        step++;
        try {
          if (step % 500 === 0) {
            // A reconnect: the connection drops, and the client opens a new one
            counts.reconnects++;
            (transport as unknown as { ws?: { close(): void } }).ws?.close();
            await until(() => transport.isConnected());
          } else if (step % 7 === 0) {
            for await (const item of client.stream<unknown, number>(pathToMethod(["soak", "count"]), { to: 1000 })) {
              if (item === 3) break;
            }
          } else if (step % 11 === 0) {
            const controller = new AbortController();
            const call = client.call(pathToMethod(["soak", "slow"]), {}, { signal: controller.signal });
            setTimeout(() => controller.abort(), 5);
            await call.catch(() => undefined);
          } else if (step % 13 === 0) {
            // A call of the server to the client over one connection (roadmap R24)
            const ids = [...(wsServer as unknown as { channels: Map<string, unknown> }).channels.keys()];
            const id = ids[index % Math.max(1, ids.length)];
            if (id) expect(await wsServer.callClient(id, ["soak", "echo"], { n: step })).toBe(step);
          } else {
            expect(await client.call(pathToMethod(["soak", "echo"]), { n: step })).toBe(step);
          }
          counts.calls++;
        } catch {
          // A call that a reconnect cut fails: count it, and go on
          counts.failures++;
        }
      }
    };
    await Promise.all(clients.map((_, index) => loop(index)));

    await sleep(1000);
    const heapAfter = heapMb();
    const pending = transports.map((transport) => (transport as unknown as { pendingRequests: Map<string, unknown> }).pendingRequests.size);
    const channels = (wsServer as unknown as {
      channels: Map<string, { incoming: { size: number; credits: Map<string, unknown> }; outgoing: { size: number } }>;
    }).channels;
    const serverMaps = [...channels.values()].map((channel) => channel.incoming.size + channel.incoming.credits.size + channel.outgoing.size);
    console.log(JSON.stringify({ ...counts, heapBeforeMb: heapBefore, heapAfterMb: heapAfter, pending, serverMaps }));

    for (const transport of transports) await transport.close();
    await host.stop();
    http.closeAllConnections();
    await new Promise<void>((resolve) => http.close(() => resolve()));

    expect(counts.calls).toBeGreaterThan(minutes * 1000);
    // Only a call that a reconnect cut can fail
    expect(counts.failures).toBeLessThanOrEqual(counts.reconnects * 4);
    expect(pending).toEqual(transports.map(() => 0));
    expect(serverMaps.every((size) => size === 0)).toBe(true);
    expect(host.callsInFlight).toBe(0);
    expect(heapAfter - heapBefore).toBeLessThan(HEAP_LIMIT_MB);
  }, (minutes + 2) * 60_000);
});
