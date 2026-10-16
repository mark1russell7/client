/**
 * The bidirectional peer (roadmap R24): the server sends calls to a client over the same
 * WebSocket, with the same frames as the calls of the client. The client serves them with a
 * `ProcedureServer`, so a call gets validation, a stream with credit, cancel and the deadline.
 */

import { describe, it, expect, afterEach } from "vitest";
import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { z } from "zod";
import { Client } from "../../client/client.js";
import { createOverallTimeoutMiddleware } from "../../client/middleware/timeout.js";
import { seconds } from "../../duration.js";
import { createProcedure } from "../../procedures/define.js";
import { createRegistry } from "../../procedures/module.js";
import { ProcedureServer } from "../../server/procedure-server.js";
import { pathToMethod } from "../../server/method.js";
import { WebSocketTransport } from "./client/transport.js";
import { WebSocketServerTransport } from "./server/transport.js";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup().catch(() => {});
  cleanups = [];
});

async function waitFor(check: () => boolean, ms = 2000): Promise<void> {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error("waitFor: condition not met");
    await sleep(5);
  }
}

/** The procedures that the client serves to the server, and what they saw. */
function clientSide() {
  const seen = { aborted: 0, deadlineLeft: [] as number[], produced: 0 };
  const read = { reads: [], writes: [] };
  const registry = createRegistry({
    name: "ui",
    procedures: [
      createProcedure()
        .path(["ui", "notify"])
        .input(z.object({ text: z.string() }))
        .output(z.string())
        .meta({ effects: read })
        .handler(async (input, ctx) => {
          const deadline = ctx.capability?.deadline;
          if (deadline !== undefined) seen.deadlineLeft.push(deadline - Date.now());
          return `shown: ${input.text}`;
        })
        .build(),
      createProcedure()
        .path(["ui", "ticks"])
        .input(z.object({ count: z.number() }))
        .output(z.number())
        .meta({ effects: read })
        .handler(async function* (input: { count: number }) {
          for (let n = 1; n <= input.count; n++) {
            seen.produced++;
            yield n;
          }
        } as never)
        .build(),
      createProcedure()
        .path(["ui", "wait"])
        .input(z.object({}))
        .output(z.string())
        .meta({ effects: read })
        .handler(async (_input, ctx) => {
          await new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, 5000);
            ctx.signal?.addEventListener(
              "abort",
              () => {
                clearTimeout(timer);
                seen.aborted++;
                resolve();
              },
              { once: true },
            );
          });
          return "ended";
        })
        .build(),
    ],
  });
  const served = new ProcedureServer({ registry });
  served.registerFromRegistry();
  return { served, seen };
}

/** A server, and a client that serves `serve` (or nothing). The server side gives a Client to the client. */
async function connect(serve?: ProcedureServer) {
  const rpc = new ProcedureServer({ registry: createRegistry() });
  const http: HttpServer = createServer();
  const ws = new WebSocketServerTransport(rpc, { server: http, path: "/ws" });
  rpc.addTransport(ws);
  await rpc.start();
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", () => resolve()));
  const transport = new WebSocketTransport({
    url: `ws://127.0.0.1:${(http.address() as AddressInfo).port}/ws`,
    heartbeat: { enabled: false },
    reconnect: { enabled: false },
    ...(serve ? { serve } : {}),
  });
  cleanups.push(async () => {
    await transport.close();
    await rpc.stop();
    http.closeAllConnections();
    await new Promise<void>((resolve) => http.close(() => resolve()));
  });
  await waitFor(() => ws.getTrackedConnections().length === 1);
  const id = ws.getTrackedConnections()[0]!.id;
  return { ws, id, transport, toClient: new Client({ transport: ws.transportFor(id), throwOnError: true }) };
}

describe("the server sends calls to the client (R24)", () => {
  it("gives a value, through the ProcedureServer of the client", async () => {
    const { served } = clientSide();
    const { toClient } = await connect(served);
    expect(await toClient.call(pathToMethod(["ui", "notify"]), { text: "hi" })).toBe("shown: hi");
  });

  it("gives a stream with credit: more items than the window, in order", async () => {
    const { served, seen } = clientSide();
    const { toClient } = await connect(served);
    const items: number[] = [];
    for await (const item of toClient.stream<unknown, number>(pathToMethod(["ui", "ticks"]), { count: 200 })) items.push(item);
    expect(items).toEqual(Array.from({ length: 200 }, (_, n) => n + 1));
    expect(seen.produced).toBe(200);
  });

  it("stops the stream of the client when the server stops reading", async () => {
    const { served, seen } = clientSide();
    const { toClient } = await connect(served);
    for await (const item of toClient.stream<unknown, number>(pathToMethod(["ui", "ticks"]), { count: 100_000 })) {
      if (item === 3) break;
    }
    await sleep(50);
    // The credit window bounds what the client made before the cancel arrived
    expect(seen.produced).toBeLessThan(200);
  });

  it("validates the input, and gives the error code", async () => {
    const { served } = clientSide();
    const { toClient } = await connect(served);
    await expect(toClient.call(pathToMethod(["ui", "notify"]), { text: 5 })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("aborts the handler of the client when the server aborts", async () => {
    const { served, seen } = clientSide();
    const { toClient } = await connect(served);
    const controller = new AbortController();
    const call = toClient.call(pathToMethod(["ui", "wait"]), {}, { signal: controller.signal });
    setTimeout(() => controller.abort(), 30);
    await expect(call).rejects.toBeDefined();
    await waitFor(() => seen.aborted === 1);
  });

  it("gives the deadline of the server to the handler of the client", async () => {
    const { served, seen } = clientSide();
    const { toClient } = await connect(served);
    await toClient.use(createOverallTimeoutMiddleware({ overall: seconds(3) })).call(pathToMethod(["ui", "notify"]), { text: "x" });
    expect(seen.deadlineLeft[0]).toBeGreaterThan(2000);
    expect(seen.deadlineLeft[0]).toBeLessThanOrEqual(3000);
  });

  it("answers NOT_FOUND when the client serves nothing", async () => {
    const { toClient } = await connect();
    await expect(toClient.call(pathToMethod(["ui", "notify"]), { text: "x" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("keeps callClient as a wrapper: a value, and the onServerRequest function of an older client", async () => {
    const { served } = clientSide();
    const { ws, id } = await connect(served);
    expect(await ws.callClient(id, ["ui", "notify"], { text: "old" })).toBe("shown: old");
  });

  it("serves the calls of the client at the same time", async () => {
    const { served } = clientSide();
    const { toClient, transport } = await connect(served);
    const forward = new Client({ transport, throwOnError: false });
    const [reverse, forwardResult] = await Promise.all([
      toClient.call(pathToMethod(["ui", "notify"]), { text: "both" }),
      forward.call(pathToMethod(["missing", "op"]), {}),
    ]);
    expect(reverse).toBe("shown: both");
    expect(forwardResult ?? null).toBeNull();
  });
});
