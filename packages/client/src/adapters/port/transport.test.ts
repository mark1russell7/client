/**
 * The transport over a message port (roadmap R27), over a `MessageChannel` of Node: calls in the
 * two directions, a stream with credit, a cancel, a validation error and the close.
 */

import { describe, it, expect, afterEach } from "vitest";
import { MessageChannel } from "node:worker_threads";
import { z } from "zod";
import { Client } from "../../client/client.js";
import { createProcedure } from "../../procedures/define.js";
import { createRegistry } from "../../procedures/module.js";
import { ProcedureServer } from "../../server/procedure-server.js";
import { pathToMethod } from "../../server/method.js";
import { PortTransport } from "./transport.js";

const read = { reads: [], writes: [] };

function served(state: { produced: number; aborted: number }) {
  const server = new ProcedureServer({
    registry: createRegistry({
      name: "worker",
      procedures: [
        createProcedure()
          .path(["worker", "double"])
          .input(z.object({ n: z.number() }))
          .output(z.number())
          .meta({ effects: read })
          .handler(async (input) => input.n * 2)
          .build(),
        createProcedure()
          .path(["worker", "count"])
          .input(z.object({ to: z.number() }))
          .output(z.number())
          .meta({ effects: read })
          .handler(async function* (input: { to: number }) {
            for (let n = 1; n <= input.to; n++) {
              state.produced++;
              yield n;
            }
          } as never)
          .build(),
        createProcedure()
          .path(["worker", "wait"])
          .input(z.object({}))
          .output(z.string())
          .meta({ effects: read })
          .handler(async (_input, ctx) => {
            await new Promise<void>((resolve) => {
              const timer = setTimeout(resolve, 5000);
              ctx.signal?.addEventListener("abort", () => {
                clearTimeout(timer);
                state.aborted++;
                resolve();
              }, { once: true });
            });
            return "ended";
          })
          .build(),
      ],
    }),
  });
  server.registerFromRegistry();
  return server;
}

let cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup();
  cleanups = [];
});

function pair(state = { produced: 0, aborted: 0 }) {
  const channel = new MessageChannel();
  const worker = new PortTransport(channel.port1, { serve: served(state) });
  const page = new PortTransport(channel.port2);
  cleanups.push(async () => {
    await page.close();
    await worker.close();
    channel.port1.close();
    channel.port2.close();
  });
  return { worker, page, client: new Client({ transport: page, throwOnError: true }), state };
}

describe("PortTransport (R27)", () => {
  it("gives a value and a validation error", async () => {
    const { client } = pair();
    expect(await client.call(pathToMethod(["worker", "double"]), { n: 21 })).toBe(42);
    await expect(client.call(pathToMethod(["worker", "double"]), { n: "x" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("gives a stream with credit, and stops it when the reader stops", async () => {
    const { client, state } = pair();
    const all: number[] = [];
    for await (const item of client.stream<unknown, number>(pathToMethod(["worker", "count"]), { to: 150 })) all.push(item);
    expect(all).toHaveLength(150);
    state.produced = 0;
    for await (const item of client.stream<unknown, number>(pathToMethod(["worker", "count"]), { to: 100_000 })) {
      if (item === 2) break;
    }
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(state.produced).toBeLessThan(200);
  });

  it("aborts the handler of the other side", async () => {
    const { client, state } = pair();
    const controller = new AbortController();
    const call = client.call(pathToMethod(["worker", "wait"]), {}, { signal: controller.signal });
    setTimeout(() => controller.abort(), 20);
    await expect(call).rejects.toMatchObject({ code: "ABORTED" });
    const until = Date.now() + 2000;
    while (state.aborted === 0 && Date.now() < until) await new Promise((resolve) => setTimeout(resolve, 5));
    expect(state.aborted).toBe(1);
  });

  it("sends calls in the two directions", async () => {
    const channel = new MessageChannel();
    const a = new PortTransport(channel.port1, { serve: served({ produced: 0, aborted: 0 }) });
    const b = new PortTransport(channel.port2, { serve: served({ produced: 0, aborted: 0 }) });
    cleanups.push(async () => {
      await a.close();
      await b.close();
      channel.port1.close();
      channel.port2.close();
    });
    expect(await new Client(a).call(pathToMethod(["worker", "double"]), { n: 1 })).toBe(2);
    expect(await new Client(b).call(pathToMethod(["worker", "double"]), { n: 2 })).toBe(4);
  });

  it("fails the calls that wait when it closes", async () => {
    const { client, page } = pair();
    const call = client.call(pathToMethod(["worker", "wait"]), {});
    await new Promise((resolve) => setTimeout(resolve, 10));
    await page.close();
    await expect(call).rejects.toThrow("The port transport closed");
  });
});
