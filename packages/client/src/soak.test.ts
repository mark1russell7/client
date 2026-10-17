/**
 * The soak tests of the WebSocket transport and of the HTTP transport (roadmap R32). They start
 * only with `SOAK_MINUTES`: the nightly workflow gives each of them 10 minutes.
 *
 * WebSocket: clients send a mix of calls for the whole time: values, streams that the reader
 * stops, aborts, calls of the server to the client, short subscriptions to remote events, and
 * reconnects. Each client also keeps one subscription for the whole time: it resubscribes after
 * each reconnect (`documentation/EVENTS.md`). At the end, each call has an answer, the maps of the
 * two sides are empty, no listener stays on the bus, and the heap grew less than a limit.
 *
 * HTTP: clients send values, streams that the reader stops, aborts, and quiet NDJSON streams with
 * keep-alive lines between their items. At the end, no request is open, no keep-alive timer
 * stays, and the heap grew less than a limit.
 *
 * Node runs the tests with `--expose-gc`, so the heap is measured after a collection.
 */

import { describe, it, expect } from "vitest";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { z } from "zod";
import { Client } from "./client/client.js";
import { WebSocketTransport } from "./adapters/websocket/client/transport.js";
import { WebSocketServerTransport } from "./adapters/websocket/server/transport.js";
import { HttpTransport } from "./adapters/http/client/transport.js";
import { HttpServerTransport } from "./adapters/http/server/transport.js";
import { createProcedure } from "./procedures/define.js";
import { createRegistry } from "./procedures/module.js";
import { ProcedureServer } from "./server/procedure-server.js";
import { pathToMethod } from "./server/method.js";
import { createEventBus } from "./events/bus.js";
import { ms } from "./duration.js";
import { countingClock } from "../test/counting-clock.js";

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
      // A quiet stream: a pause before each item after the first. An abort ends the pause.
      createProcedure()
        .path(["soak", "quiet"])
        .input(z.object({ items: z.number(), gap: z.number() }))
        .output(z.number())
        .meta({ effects: read })
        .handler(async function* (input: { items: number; gap: number }, ctx: { signal?: AbortSignal }) {
          for (let n = 1; n <= input.items; n++) {
            if (n > 1) await pause(input.gap, ctx.signal);
            if (ctx.signal?.aborted) return;
            yield n;
          }
        } as never)
        .build(),
    ],
  });
}

/** This function waits `time` milliseconds, or until the signal aborts. */
function pause(time: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise<void>((resolve) => {
    const done = (): void => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, time);
    signal?.addEventListener("abort", done, { once: true });
  });
}

describe.runIf(minutes > 0)("the WebSocket transport under load (R32)", () => {
  it(`keeps its maps empty and its heap flat for ${minutes} minutes`, async () => {
    // The remote events (EVENTS.md): each client keeps one subscription for the whole time, and
    // makes short ones in its loop
    const bus = createEventBus();
    const host = new ProcedureServer({ registry: registry(), autoRegister: true, events: { bus, topics: ["soak.*"] } });
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

    // The long subscriptions: they resubscribe after each reconnect
    const ticks = transports.map(() => 0);
    const confirmations = transports.map(() => 0);
    const reconnectsOf = transports.map(() => 0);
    const subscriptions = transports.map((transport, index) =>
      transport.subscribe("soak.ticks", () => void ticks[index]!++, { onSubscribed: () => void confirmations[index]!++ }),
    );
    await Promise.all(subscriptions.map((subscription) => subscription.ready));
    let tick = 0;
    const ticker = setInterval(() => host.publish("soak.ticks", ++tick), 20);
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
            reconnectsOf[index]!++;
            (transport as unknown as { ws?: { close(): void } }).ws?.close();
            await until(() => transport.isConnected());
          } else if (step % 17 === 0) {
            // A short subscription: the confirmation, one event, the unsubscribe
            const topic = `soak.echo.${index}`;
            let got = false;
            const subscription = transport.subscribe(topic, (data) => void (got = got || data === step));
            try {
              await subscription.ready;
              host.publish(topic, step);
              if (!(await until(() => got, 5000))) throw new Error("the event of a short subscription did not come");
            } finally {
              subscription();
            }
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

    // The long subscriptions end: their calls leave the maps of the two sides
    clearInterval(ticker);
    const publisherBefore = host.publisher!.subscriptions;
    for (const subscription of subscriptions) subscription();
    await sleep(1000);
    const heapAfter = heapMb();
    const events = { ticks, confirmations, reconnectsOf, publisherBefore, publisherAfter: host.publisher!.subscriptions, channels: bus.channels() };
    const pending = transports.map((transport) => (transport as unknown as { pendingRequests: Map<string, unknown> }).pendingRequests.size);
    const channels = (wsServer as unknown as {
      channels: Map<string, { incoming: { size: number; credits: Map<string, unknown> }; outgoing: { size: number } }>;
    }).channels;
    const serverMaps = [...channels.values()].map((channel) => channel.incoming.size + channel.incoming.credits.size + channel.outgoing.size);
    console.log(JSON.stringify({ ...counts, heapBeforeMb: heapBefore, heapAfterMb: heapAfter, pending, serverMaps, events }));

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
    // Each long subscription got events, and it resubscribed after each reconnect of its client
    for (let index = 0; index < transports.length; index++) {
      expect(ticks[index]).toBeGreaterThan(0);
      expect(confirmations[index]).toBeGreaterThanOrEqual(reconnectsOf[index]! + 1);
    }
    // The open subscriptions are only the long ones, and no listener stays after the unsubscribe
    expect(events.publisherBefore).toBe(transports.length);
    expect(events.publisherAfter).toBe(0);
    expect(events.channels).toEqual([]);
  }, (minutes + 2) * 60_000);
});

describe.runIf(minutes > 0)("the HTTP transport under load (R32)", () => {
  it(`keeps no open request and no keep-alive timer, and its heap flat, for ${minutes} minutes`, async () => {
    const host = new ProcedureServer({ registry: registry(), autoRegister: true });
    const app = express();
    const http = createServer(app);
    // A short keep-alive time: each quiet stream gets keep-alive lines between its items
    const timers = countingClock();
    const transport = new HttpServerTransport(host, { app, httpServer: http, keepAlive: ms(20), clock: timers });
    host.addTransport(transport);
    await host.start();
    await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", () => resolve()));
    const baseUrl = `http://127.0.0.1:${(http.address() as AddressInfo).port}/api`;
    const clients = Array.from({ length: CLIENTS }, () => new Client({ transport: new HttpTransport({ baseUrl }), throwOnError: true }));
    const end = Date.now() + minutes * 60_000;
    const counts = { calls: 0, failures: 0, quietItems: 0 };
    await sleep(500);
    const heapBefore = heapMb();

    const loop = async (index: number) => {
      const client = clients[index]!;
      let step = 0;
      while (Date.now() < end) {
        step++;
        try {
          if (step % 7 === 0) {
            for await (const item of client.stream<unknown, number>(pathToMethod(["soak", "count"]), { to: 1000 })) {
              if (item === 3) break;
            }
          } else if (step % 11 === 0) {
            const controller = new AbortController();
            const call = client.call(pathToMethod(["soak", "slow"]), {}, { signal: controller.signal });
            setTimeout(() => controller.abort(), 5);
            await call.catch(() => undefined);
          } else if (step % 13 === 0) {
            // A quiet stream to its end: the keep-alive lines between the items give no item
            const items: number[] = [];
            for await (const item of client.stream<unknown, number>(pathToMethod(["soak", "quiet"]), { items: 3, gap: 50 })) items.push(item);
            expect(items).toEqual([1, 2, 3]);
            counts.quietItems += items.length;
          } else if (step % 17 === 0) {
            // A quiet stream that the reader stops while the server is quiet
            for await (const _item of client.stream<unknown, number>(pathToMethod(["soak", "quiet"]), { items: 3, gap: 50 })) break;
          } else {
            expect(await client.call(pathToMethod(["soak", "echo"]), { n: step })).toBe(step);
          }
          counts.calls++;
        } catch {
          counts.failures++;
        }
        // A pace that leaves the ports of the closed connections time to come back
        await sleep(5);
      }
    };
    await Promise.all(clients.map((_, index) => loop(index)));

    await sleep(1000);
    const heapAfter = heapMb();
    const openRequests = (transport as unknown as { openRequests: Set<unknown> }).openRequests.size;
    const report = { ...counts, heapBeforeMb: heapBefore, heapAfterMb: heapAfter, openRequests, timersLive: timers.live, timersStarted: timers.started, callsInFlight: host.callsInFlight };
    console.log(JSON.stringify(report));

    await host.stop();
    http.closeAllConnections();
    await new Promise<void>((resolve) => http.close(() => resolve()));

    expect(counts.calls).toBeGreaterThan(minutes * 1000);
    // HTTP has no reconnect: a failure is a fault, but a rare closed keep-alive connection
    expect(counts.failures).toBeLessThanOrEqual(Math.ceil(counts.calls / 1000));
    expect(counts.quietItems).toBeGreaterThan(0);
    expect(report.openRequests).toBe(0);
    expect(report.timersLive).toBe(0);
    expect(report.timersStarted).toBeGreaterThan(0);
    expect(report.callsInFlight).toBe(0);
    expect(heapAfter - heapBefore).toBeLessThan(HEAP_LIMIT_MB);
  }, (minutes + 2) * 60_000);
});
