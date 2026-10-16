/**
 * Cancellation scopes and a graceful stop (roadmap R14).
 *
 * - `ProcedureServer.stop({ grace })` refuses new calls with a retryable UNAVAILABLE and lets the
 *   calls in flight end, until the grace time ends. Then it aborts them.
 * - The signal of a call joins its request and the server: a stop aborts it.
 * - `exec()` takes a signal.
 * - `LocalTransport` runs the interceptors and gives a call the deadline of its client.
 * - A remote leaf of `route()` sends the deadline of the capability.
 */

import { describe, it, expect } from "vitest";
import { z } from "zod";
import { Client } from "../client/client.js";
import { createOverallTimeoutMiddleware } from "../client/middleware/timeout.js";
import { ms } from "../duration.js";
import { createProcedure } from "../procedures/define.js";
import { createRegistry } from "../procedures/module.js";
import type { Interceptor } from "../procedures/invoke.js";
import { LocalTransport } from "../adapters/local/client/transport.js";
import { TIMEOUT_METADATA_KEY } from "../client/deadline.js";
import type { Message, ResponseItem, Transport } from "../client/types.js";
import { ProcedureServer } from "./procedure-server.js";
import type { ServerRequest, ServerResponse } from "./types.js";

const method = { service: "test", operation: "slow" };

/** A procedure that takes `ms` milliseconds, or ends when its signal aborts. */
function slowRegistry(state: { aborted: number; finished: number }) {
  return createRegistry({
    name: "slow",
    procedures: [
      createProcedure()
        .path(["test", "slow"])
        .input(z.object({ ms: z.number() }))
        .output(z.string())
        .meta({ effects: { reads: [], writes: [] } })
        .handler(async (input, ctx) => {
          await new Promise<void>((resolve, reject) => {
            const onAbort = (): void => {
              clearTimeout(timer);
              state.aborted++;
              reject(new Error("aborted"));
            };
            const timer = setTimeout(() => {
              ctx.signal?.removeEventListener("abort", onAbort);
              resolve();
            }, input.ms);
            ctx.signal?.addEventListener("abort", onAbort, { once: true });
          });
          state.finished++;
          return "done";
        })
        .build(),
    ],
  });
}

function serverOf(state: { aborted: number; finished: number }) {
  const server = new ProcedureServer({ registry: slowRegistry(state) });
  server.registerFromRegistry();
  const handler = (server as unknown as { findHandler(m: unknown): (r: ServerRequest<unknown>) => Promise<ServerResponse<unknown>> }).findHandler(method);
  const request = (id: string, wait: number): ServerRequest<unknown> => ({ id, method, payload: { ms: wait }, metadata: {} });
  return { server, handler, request };
}

describe("ProcedureServer.stop({ grace }) (R14)", () => {
  it("lets a call in flight end, and refuses a new call with a retryable UNAVAILABLE", async () => {
    const state = { aborted: 0, finished: 0 };
    const { server, handler, request } = serverOf(state);
    const inFlight = handler(request("1", 80));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(server.callsInFlight).toBe(1);
    const stopping = server.stop({ grace: ms(2000) });
    const refused = await handler(request("2", 1));
    expect(refused.status).toMatchObject({ type: "error", code: "UNAVAILABLE", retryable: true });
    expect((await inFlight).payload).toBe("done");
    await stopping;
    expect(state).toEqual({ aborted: 0, finished: 1 });
  });

  it("aborts the calls that still run when the grace time ends", async () => {
    const state = { aborted: 0, finished: 0 };
    const { server, handler, request } = serverOf(state);
    const inFlight = handler(request("1", 5000));
    await new Promise((resolve) => setTimeout(resolve, 10));
    const start = Date.now();
    await server.stop({ grace: ms(50) });
    expect(Date.now() - start).toBeLessThan(1000);
    expect((await inFlight).status.type).toBe("error");
    expect(state.aborted).toBe(1);
  });

  it("aborts at once without grace, and serves again after a start", async () => {
    const state = { aborted: 0, finished: 0 };
    const { server, handler, request } = serverOf(state);
    const inFlight = handler(request("1", 5000));
    await new Promise((resolve) => setTimeout(resolve, 10));
    await server.stop();
    expect((await inFlight).status.type).toBe("error");
    expect((await handler(request("2", 1))).payload).toBe("done");
  });
});

describe("exec() takes a signal (R14)", () => {
  it("an abort stops the procedure", async () => {
    const state = { aborted: 0, finished: 0 };
    const registry = slowRegistry(state);
    const client = new Client({ transport: new LocalTransport({ registry }) }).useRegistry(registry);
    const controller = new AbortController();
    const call = client.exec(["test", "slow"], { ms: 5000 }, { signal: controller.signal });
    setTimeout(() => controller.abort(), 20);
    await expect(call).rejects.toThrow();
    expect(state.aborted).toBe(1);
  });
});

describe("LocalTransport runs the interceptors and the deadline (R14)", () => {
  it("a client timeout gives a local call its deadline", async () => {
    const state = { aborted: 0, finished: 0 };
    const transport = new LocalTransport({ registry: slowRegistry(state) });
    const client = new Client({ transport, throwOnError: true }).use(createOverallTimeoutMiddleware({ overall: ms(60) }));
    await expect(client.call(method, { ms: 5000 })).rejects.toMatchObject({ code: "TIMEOUT" });
    // The handler stopped at the deadline: it did not run to its end
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(state.aborted).toBe(1);
  });

  it("runs the interceptors of the transport", async () => {
    const seen: string[] = [];
    const audit: Interceptor = async (invocation, next) => {
      seen.push(invocation.path.join("."));
      return next();
    };
    const transport = new LocalTransport({ registry: slowRegistry({ aborted: 0, finished: 0 }), interceptors: [audit] });
    await new Client(transport).call(method, { ms: 1 });
    expect(seen).toEqual(["test.slow"]);
  });
});

describe("a remote leaf of route() sends the deadline (R14)", () => {
  it("sends procedure-timeout from the capability of the client", async () => {
    const sent: Array<Record<string, unknown>> = [];
    const transport: Transport = {
      name: "recorder",
      async *send<TReq, TRes>(message: Message<TReq>): AsyncIterable<ResponseItem<TRes>> {
        sent.push({ ...message.metadata });
        yield { id: message.id, status: { type: "success", code: 200 }, payload: "ok" as TRes, metadata: {} };
      },
      close: async () => {},
    };
    const registry = createRegistry();
    registry.register({ path: ["remote", "op"], input: z.object({}), output: z.unknown(), metadata: {} } as never);
    const client = new Client({ transport, capability: { deadline: Date.now() + 5000 } }).useRegistry(registry);
    await client.route({ route: { remote: { op: {} } } });
    expect(sent[0]?.[TIMEOUT_METADATA_KEY]).toBeGreaterThan(4000);
  });
});
