/**
 * The stop of the server ends a keyed stream. A call with an idempotency key of a procedure that is
 * not repeatable takes the keyed path of `ProcedureServer`. Its stream gets the abort of the server
 * until its last item, as on the path without a key:
 *
 * - The cooperative abort of `drain()` ends the stream in-band with `ABORTED`, and `drain()`
 *   resolves before its deadline.
 * - `close()` ends the stream of a local caller that sends no signal.
 * - The stream still ends with its caller.
 * - Each test reads time only from a fake clock: no real sleeps.
 */

import { describe, it, expect } from "vitest";
import * as z from "zod";
import { fakeClock } from "@mark1russell7/service/testing";
import { createProcedure } from "../procedures/define.js";
import { createRegistry } from "../procedures/module.js";
import { IDEMPOTENCY_KEY_METADATA } from "../procedures/idempotency.js";
import { ProcedureServer } from "./procedure-server.js";
import { pathToMethod } from "./method.js";
import type { ServerResponse } from "./types.js";

/** The effects of a procedure that is not repeatable: a call with a key takes the keyed path. */
const WRITES = { reads: [], writes: ["rows"] };

/** The count of the handlers that got the abort of their call. */
let stopped = 0;

/** A stream with one item. Then it waits for the abort of its call. */
async function watch(_input: unknown, ctx: { readonly signal?: AbortSignal }) {
  const aborted = new Promise<void>((resolve) => ctx.signal?.addEventListener("abort", () => resolve(), { once: true }));
  void aborted.then(() => stopped++);
  return (async function* () {
    yield "row 1";
    await aborted;
  })();
}

/** A server on a fake clock with the stream procedure `rows.watch`. */
function serverOf() {
  stopped = 0;
  const clock = fakeClock();
  const registry = createRegistry({
    name: "keyed-stream-stop",
    procedures: [createProcedure().path(["rows", "watch"]).input(z.object({})).output(z.string()).meta({ effects: WRITES }).handler(watch as never).build()],
  });
  const server = new ProcedureServer({ registry, autoRegister: true, clock });
  return { server, clock };
}

let sent = 0;
/** A keyed call of `rows.watch`, with the signal of its caller when the test gives one. */
function keyed(server: ProcedureServer, signal?: AbortSignal): Promise<ServerResponse<unknown>> {
  sent++;
  return server.handle({
    id: `call-${sent}`,
    method: pathToMethod(["rows", "watch"]),
    payload: {},
    metadata: { [IDEMPOTENCY_KEY_METADATA]: `key-${sent}` },
    ...(signal ? { signal } : {}),
  });
}

/** The reader of the stream of a response, after its first item. */
async function afterFirstItem(response: ServerResponse<unknown>): Promise<AsyncIterator<unknown>> {
  expect(response.stream).toBeDefined();
  const reader = response.stream![Symbol.asyncIterator]();
  expect(await reader.next()).toEqual({ done: false, value: "row 1" });
  return reader;
}

describe("the stop of the server ends a keyed stream", () => {
  it("ends the stream at the cooperative abort of drain(), and drain() resolves before its deadline", async () => {
    const { server, clock } = serverOf();
    const reader = await afterFirstItem(await keyed(server));
    expect(server.inFlight()).toBe(1);
    server.stopIntake();
    const drained = server.drain(clock.now() + 60_000, AbortSignal.abort());
    await expect(reader.next()).rejects.toMatchObject({ code: "ABORTED" });
    await drained;
    expect(stopped).toBe(1);
    expect(server.inFlight()).toBe(0);
  });

  it("ends the stream of a local caller without a signal at close()", async () => {
    const { server } = serverOf();
    const reader = await afterFirstItem(await keyed(server));
    const closed = server.close();
    await expect(reader.next()).rejects.toMatchObject({ code: "ABORTED" });
    await closed;
    expect(stopped).toBe(1);
    expect(server.inFlight()).toBe(0);
  });

  it("ends the stream with its caller", async () => {
    const { server } = serverOf();
    const caller = new AbortController();
    const reader = await afterFirstItem(await keyed(server, caller.signal));
    caller.abort();
    await expect(reader.next()).rejects.toMatchObject({ code: "ABORTED" });
    expect(stopped).toBe(1);
    expect(server.inFlight()).toBe(0);
  });
});
